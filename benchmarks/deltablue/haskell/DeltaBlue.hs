{-# LANGUAGE BangPatterns #-}
-- | DeltaBlue, the incremental constraint solver (V8's deltablue.js, Dart's
-- DeltaBlue.dart), in Haskell, after ../rust/src/lib.rs.
--
-- Variables and constraints form a mutable object graph in IO: every field
-- the other ports assign is an 'IORef', and every list they grow, shrink, or
-- use as a worklist is a growable 'Vec' over a bounds-checked 'IOArray'
-- (push, pop from the end, in-place retain), so lists keep their order and
-- worklists are stacks, as in the original. The four constraint kinds are
-- one ADT, matched on as the Rust port matches its enum. Constraint equality
-- is identity (the identity of the constraint's own 'IORef').
module DeltaBlue () where

import Control.Monad (forM_, replicateM_, unless, when)
import Data.Array.IO (IOArray, getBounds, newArray_, readArray, writeArray)
import Data.Int (Int32, Int64)
import Data.IORef
import Data.Maybe (isNothing)

------------------------------------------------------------------------------
-- Growable arrays (Rust's Vec, JS's Array)

data Vec a = Vec !(IORef Int) !(IORef (IOArray Int a))

newVec :: IO (Vec a)
newVec = Vec <$> newIORef 0 <*> (newArray_ (0, 3) >>= newIORef)

singletonVec :: a -> IO (Vec a)
singletonVec x = do
  v <- newVec
  push v x
  pure v

vecLength :: Vec a -> IO Int
vecLength (Vec len _) = readIORef len

push :: Vec a -> a -> IO ()
push (Vec len ref) x = do
  n <- readIORef len
  arr <- readIORef ref
  (_, hi) <- getBounds arr
  arr' <-
    if n <= hi
      then pure arr
      else do
        bigger <- newArray_ (0, 2 * n - 1)
        forM_ [0 .. n - 1] $ \i -> readArray arr i >>= writeArray bigger i
        writeIORef ref bigger
        pure bigger
  writeArray arr' n x
  writeIORef len $! n + 1

pop :: Vec a -> IO (Maybe a)
pop (Vec len ref) = do
  n <- readIORef len
  if n == 0
    then pure Nothing
    else do
      writeIORef len $! n - 1
      arr <- readIORef ref
      Just <$> readArray arr (n - 1)

at :: Vec a -> Int -> IO a
at (Vec len ref) i = do
  n <- readIORef len
  when (i >= n) $ error "Vec index out of range"
  arr <- readIORef ref
  readArray arr i

forVec_ :: Vec a -> (a -> IO ()) -> IO ()
forVec_ v f = do
  n <- vecLength v
  forM_ [0 .. n - 1] $ \i -> at v i >>= f

-- | Keeps the elements that satisfy the predicate, in order, in place.
retain :: Vec a -> (a -> Bool) -> IO ()
retain (Vec len ref) keep = do
  n <- readIORef len
  arr <- readIORef ref
  let go !i !j
        | i == n = writeIORef len j
        | otherwise = do
            x <- readArray arr i
            if keep x
              then writeArray arr j x >> go (i + 1) (j + 1)
              else go (i + 1) j
  go 0 0

------------------------------------------------------------------------------
-- Strength

data Strength
  = Required
  | StrongPreferred
  | Preferred
  | StrongDefault
  | Normal
  | WeakDefault
  | Weakest
  deriving (Eq, Ord)

stronger, weaker :: Strength -> Strength -> Bool
stronger a b = a < b
weaker a b = a > b

weakestOf :: Strength -> Strength -> Strength
weakestOf a b = if weaker a b then a else b

-- | The original's table, inverted on purpose: Required is followed by
-- Weakest, so 'incrementalRemove' only ever re-adds required constraints.
nextWeaker :: Strength -> Strength
nextWeaker Required = Weakest
nextWeaker StrongPreferred = WeakDefault
nextWeaker Preferred = Normal
nextWeaker StrongDefault = StrongDefault
nextWeaker Normal = Preferred
nextWeaker WeakDefault = Required
nextWeaker Weakest = error "Weakest has no weaker strength"

------------------------------------------------------------------------------
-- Variable

data Variable = Variable
  { value :: !(IORef Int)
  , constraints :: !(Vec Constraint)
  , determinedBy :: !(IORef (Maybe Constraint))
  , varMark :: !(IORef Int)
  , walkStrength :: !(IORef Strength)
  , stay :: !(IORef Bool)
  }

newVariable :: Int -> IO Variable
newVariable v =
  Variable
    <$> newIORef v
    <*> newVec
    <*> newIORef Nothing
    <*> newIORef 0
    <*> newIORef Weakest
    <*> newIORef True

addConstraint :: Variable -> Constraint -> IO ()
addConstraint v c = push (constraints v) c

removeConstraint :: Variable -> Constraint -> IO ()
removeConstraint v c = do
  retain (constraints v) (/= c)
  d <- readIORef (determinedBy v)
  when (d == Just c) $ writeIORef (determinedBy v) Nothing

-- | Pushes the satisfied constraints that consume this variable, i.e. all
-- satisfied ones except the one that determines it.
pushConsumers :: Variable -> Vec Constraint -> IO ()
pushConsumers v into = do
  determining <- readIORef (determinedBy v)
  forVec_ (constraints v) $ \c ->
    when (Just c /= determining) $ do
      sat <- isSatisfied c
      when sat $ push into c

------------------------------------------------------------------------------
-- Constraint

data Direction = None | Forward | Backward
  deriving (Eq)

data UnaryRole = Stay | Edit
  deriving (Eq)

data BinaryOp
  = Equality
  | -- | @v2 = v1 * scale + offset@
    Scale !Variable !Variable

data Kind
  = Unary
      { output_ :: !Variable
      , satisfied :: !(IORef Bool)
      , role :: !UnaryRole
      }
  | Binary
      { v1 :: !Variable
      , v2 :: !Variable
      , direction :: !(IORef Direction)
      , op :: !BinaryOp
      }

data Constraint = Constraint
  { strength :: !Strength
  , kind :: !Kind
  }

-- | Identity: each constraint owns its satisfied/direction cell.
instance Eq Constraint where
  Constraint _ (Unary _ a _) == Constraint _ (Unary _ b _) = a == b
  Constraint _ (Binary _ _ a _) == Constraint _ (Binary _ _ b _) = a == b
  _ == _ = False

-- | Creates a constraint and adds it to the graph and the plan.
newConstraint :: Strength -> Kind -> Planner -> IO Constraint
newConstraint s k planner = do
  let c = Constraint s k
  addToGraph c
  incrementalAdd planner c
  pure c

stayConstraint, editConstraint :: Variable -> Strength -> Planner -> IO Constraint
stayConstraint v s = unary v s Stay
editConstraint v s = unary v s Edit

unary :: Variable -> Strength -> UnaryRole -> Planner -> IO Constraint
unary v s r planner = do
  sat <- newIORef False
  newConstraint s (Unary v sat r) planner

equalityConstraint :: Variable -> Variable -> Strength -> Planner -> IO Constraint
equalityConstraint a b = binary a b Equality

scaleConstraint :: Variable -> Variable -> Variable -> Variable -> Strength -> Planner -> IO Constraint
scaleConstraint src sc off dst = binary src dst (Scale sc off)

binary :: Variable -> Variable -> BinaryOp -> Strength -> Planner -> IO Constraint
binary a b o s planner = do
  dir <- newIORef None
  newConstraint s (Binary a b dir o) planner

addToGraph :: Constraint -> IO ()
addToGraph c = case kind c of
  Unary out sat _ -> do
    addConstraint out c
    writeIORef sat False
  Binary a b dir o -> do
    addConstraint a c
    addConstraint b c
    writeIORef dir None
    case o of
      Scale sc off -> addConstraint sc c >> addConstraint off c
      Equality -> pure ()

removeFromGraph :: Constraint -> IO ()
removeFromGraph c = case kind c of
  Unary out sat _ -> do
    removeConstraint out c
    writeIORef sat False
  Binary a b dir o -> do
    removeConstraint a c
    removeConstraint b c
    writeIORef dir None
    case o of
      Scale sc off -> removeConstraint sc c >> removeConstraint off c
      Equality -> pure ()

-- | Decides whether (unary) or in which direction (binary) to satisfy this
-- constraint, given the variables already marked in this pass.
chooseMethod :: Constraint -> Int -> IO ()
chooseMethod (Constraint s k) mark = case k of
  Unary out sat _ -> do
    m <- readIORef (varMark out)
    ws <- readIORef (walkStrength out)
    writeIORef sat $! m /= mark && stronger s ws
  Binary a b dir _ -> do
    m1 <- readIORef (varMark a)
    m2 <- readIORef (varMark b)
    w1 <- readIORef (walkStrength a)
    w2 <- readIORef (walkStrength b)
    -- The first two decisions are always overwritten by the third; the
    -- original does this too.
    let d0 = None
        d1
          | m1 == mark = if m2 /= mark && stronger s w2 then Forward else None
          | otherwise = d0
        _d2
          | m2 == mark = if m1 /= mark && stronger s w1 then Backward else None
          | otherwise = d1
        d3
          | weaker w1 w2 = if stronger s w1 then Backward else None
          | otherwise = if stronger s w2 then Forward else Backward
    writeIORef dir $! d3

isSatisfied :: Constraint -> IO Bool
isSatisfied c = case kind c of
  Unary _ sat _ -> readIORef sat
  Binary _ _ dir _ -> (/= None) <$> readIORef dir

markUnsatisfied :: Constraint -> IO ()
markUnsatisfied c = case kind c of
  Unary _ sat _ -> writeIORef sat False
  Binary _ _ dir _ -> writeIORef dir None

isInput :: Constraint -> Bool
isInput c = case kind c of
  Unary _ _ Edit -> True
  _ -> False

input :: Constraint -> IO Variable
input c = case kind c of
  Unary out _ _ -> pure out
  Binary a b dir _ -> do
    d <- readIORef dir
    pure $ if d == Forward then a else b

output :: Constraint -> IO Variable
output c = case kind c of
  Unary out _ _ -> pure out
  Binary a b dir _ -> do
    d <- readIORef dir
    pure $ if d == Forward then b else a

markInputs :: Constraint -> Int -> IO ()
markInputs c mark = case kind c of
  Unary {} -> pure ()
  Binary _ _ _ o -> do
    i <- input c
    writeIORef (varMark i) mark
    case o of
      Scale sc off -> writeIORef (varMark sc) mark >> writeIORef (varMark off) mark
      Equality -> pure ()

inputsKnown :: Constraint -> Int -> IO Bool
inputsKnown c mark = case kind c of
  Unary {} -> pure True
  Binary {} -> do
    i <- input c
    m <- readIORef (varMark i)
    if m == mark
      then pure True
      else do
        st <- readIORef (stay i)
        if st then pure True else isNothing <$> readIORef (determinedBy i)

-- | Recomputes the output's walk strength and stay flag, and its value if it
-- is constant.
recalculate :: Constraint -> IO ()
recalculate c@(Constraint s k) = do
  st <- case k of
    Unary out _ r -> do
      writeIORef (walkStrength out) s
      let st = r /= Edit
      writeIORef (stay out) st
      pure st
    Binary _ _ _ o -> do
      i <- input c
      out <- output c
      iws <- readIORef (walkStrength i)
      writeIORef (walkStrength out) $! weakestOf s iws
      ist <- readIORef (stay i)
      st <- case o of
        Equality -> pure ist
        Scale sc off ->
          if not ist
            then pure False
            else do
              sst <- readIORef (stay sc)
              if not sst then pure False else readIORef (stay off)
      writeIORef (stay out) st
      pure st
  when st $ execute c

execute :: Constraint -> IO ()
execute c = case kind c of
  Unary {} -> pure ()
  Binary _ _ _ Equality -> do
    i <- input c
    out <- output c
    readIORef (value i) >>= writeIORef (value out)
  Binary a b dir (Scale sc off) -> do
    scale <- readIORef (value sc)
    offset <- readIORef (value off)
    d <- readIORef dir
    if d == Forward
      then do
        x <- readIORef (value a)
        writeIORef (value b) $! x * scale + offset
      else do
        y <- readIORef (value b)
        writeIORef (value a) $! (y - offset) `quot` scale

-- | Satisfies this constraint if it can, returning the constraint it
-- overrode, if any.
satisfy :: Constraint -> Int -> Planner -> IO (Maybe Constraint)
satisfy c mark planner = do
  chooseMethod c mark
  sat <- isSatisfied c
  if not sat
    then do
      when (strength c == Required) $ error "could not satisfy a required constraint"
      pure Nothing
    else do
      markInputs c mark
      out <- output c
      overridden <- readIORef (determinedBy out)
      forM_ overridden markUnsatisfied
      writeIORef (determinedBy out) (Just c)
      ok <- addPropagate planner c mark
      unless ok $ error "cycle encountered"
      writeIORef (varMark out) mark
      pure overridden

destroy :: Constraint -> Planner -> IO ()
destroy c planner = do
  sat <- isSatisfied c
  if sat then incrementalRemove planner c else removeFromGraph c

------------------------------------------------------------------------------
-- Planner and plans

newtype Plan = Plan (Vec Constraint)

executePlan :: Plan -> IO ()
executePlan (Plan cs) = forVec_ cs execute

newtype Planner = Planner (IORef Int)

newPlanner :: IO Planner
newPlanner = Planner <$> newIORef 0

newMark :: Planner -> IO Int
newMark (Planner ref) = do
  m <- (+ 1) <$> readIORef ref
  writeIORef ref $! m
  pure m

incrementalAdd :: Planner -> Constraint -> IO ()
incrementalAdd planner c = do
  mark <- newMark planner
  let go Nothing = pure ()
      go (Just o) = satisfy o mark planner >>= go
  satisfy c mark planner >>= go

incrementalRemove :: Planner -> Constraint -> IO ()
incrementalRemove planner c = do
  out <- output c
  markUnsatisfied c
  removeFromGraph c
  unsatisfied <- removePropagateFrom out
  let go s = do
        forVec_ unsatisfied $ \u ->
          when (strength u == s) $ incrementalAdd planner u
        let s' = nextWeaker s
        unless (s' == Weakest) $ go s'
  go Required

-- | Recomputes everything downstream of c; False if that reaches a variable
-- already marked in this pass (a cycle).
addPropagate :: Planner -> Constraint -> Int -> IO Bool
addPropagate planner c mark = do
  todo <- singletonVec c
  let go = do
        next <- pop todo
        case next of
          Nothing -> pure True
          Just d -> do
            out <- output d
            m <- readIORef (varMark out)
            if m == mark
              then incrementalRemove planner c >> pure False
              else do
                recalculate d
                pushConsumers out todo
                go
  go

-- | Resets everything downstream of out, returning the unsatisfied
-- constraints it finds.
removePropagateFrom :: Variable -> IO (Vec Constraint)
removePropagateFrom out = do
  writeIORef (determinedBy out) Nothing
  writeIORef (walkStrength out) Weakest
  writeIORef (stay out) True
  unsatisfied <- newVec
  todo <- singletonVec out
  let go = do
        next <- pop todo
        case next of
          Nothing -> pure unsatisfied
          Just v -> do
            count <- vecLength (constraints v)
            forM_ [0 .. count - 1] $ \i -> do
              c <- at (constraints v) i
              sat <- isSatisfied c
              unless sat $ push unsatisfied c
            determining <- readIORef (determinedBy v)
            forM_ [0 .. count - 1] $ \i -> do
              c <- at (constraints v) i
              when (Just c /= determining) $ do
                sat <- isSatisfied c
                when sat $ do
                  recalculate c
                  output c >>= push todo
            go
  go

makePlan :: Planner -> Vec Constraint -> IO Plan
makePlan planner sources = do
  mark <- newMark planner
  plan <- newVec
  let todo = sources
      go = do
        next <- pop todo
        case next of
          Nothing -> pure (Plan plan)
          Just c -> do
            out <- output c
            m <- readIORef (varMark out)
            when (m /= mark) $ do
              known <- inputsKnown c mark
              when known $ do
                push plan c
                writeIORef (varMark out) mark
                pushConsumers out todo
            go
  go

extractPlanFromConstraints :: Planner -> Vec Constraint -> IO Plan
extractPlanFromConstraints planner cs = do
  sources <- newVec
  forVec_ cs $ \c ->
    when (isInput c) $ do
      sat <- isSatisfied c
      when sat $ push sources c
  makePlan planner sources

------------------------------------------------------------------------------
-- Tests

-- | A chain of n equality constraints, edited from the first variable.
chainTest :: Int -> IO Int
chainTest n = do
  planner <- newPlanner
  let build !i prev first lst
        | i > n = pure (first, lst)
        | otherwise = do
            v <- newVariable 0
            forM_ prev $ \p -> equalityConstraint p v Required planner
            build
              (i + 1)
              (Just v)
              (if i == 0 then Just v else first)
              (if i == n then Just v else lst)
  built <- build 0 Nothing Nothing Nothing
  (first, lst) <- case built of
    (Just f, Just l) -> pure (f, l)
    _ -> error "n >= 0"

  _ <- stayConstraint lst StrongDefault planner
  edit <- editConstraint first Preferred planner
  edits <- singletonVec edit
  plan <- extractPlanFromConstraints planner edits

  let loop !i !failures
        | i == 100 = pure failures
        | otherwise = do
            writeIORef (value first) i
            executePlan plan
            v <- readIORef (value lst)
            loop (i + 1) (if v /= i then failures + 1 else failures)
  loop 0 0

-- | n scale constraints sharing one scale and offset, edited from either end.
projectionTest :: Int -> IO Int
projectionTest n = do
  planner <- newPlanner
  scale <- newVariable 10
  offset <- newVariable 1000
  dests <- newVec
  let build !i src dst
        | i == n = pure (src, dst)
        | otherwise = do
            s <- newVariable i
            d <- newVariable i
            push dests d
            _ <- stayConstraint s Normal planner
            _ <- scaleConstraint s scale offset d Required planner
            build (i + 1) (Just s) (Just d)
  built <- build 0 Nothing Nothing
  (src, dst) <- case built of
    (Just s, Just d) -> pure (s, d)
    _ -> error "n > 0"

  failures <- newIORef (0 :: Int)
  let failIf b = when b $ modifyIORef' failures (+ 1)
  change planner src 17
  readIORef (value dst) >>= failIf . (/= 1170)
  change planner dst 1050
  readIORef (value src) >>= failIf . (/= 5)
  change planner scale 5
  forM_ [0 .. n - 2] $ \i -> do
    d <- at dests i
    readIORef (value d) >>= failIf . (/= i * 5 + 1000)
  change planner offset 2000
  forM_ [0 .. n - 2] $ \i -> do
    d <- at dests i
    readIORef (value d) >>= failIf . (/= i * 5 + 2000)
  readIORef failures

change :: Planner -> Variable -> Int -> IO ()
change planner v newValue = do
  edit <- editConstraint v Preferred planner
  edits <- singletonVec edit
  plan <- extractPlanFromConstraints planner edits
  replicateM_ 10 $ do
    writeIORef (value v) newValue
    executePlan plan
  destroy edit planner

------------------------------------------------------------------------------
-- Exports

sumRuns :: Int32 -> IO Int -> IO Int64
sumRuns iterations run = go 0 0
  where
    go !i !acc
      | i >= iterations = pure acc
      | otherwise = do
          r <- run
          go (i + 1) (acc + fromIntegral r)

benchChain :: Int32 -> IO Int64
benchChain iterations = sumRuns iterations (chainTest 1048)

benchProjection :: Int32 -> IO Int64
benchProjection iterations = sumRuns iterations (projectionTest 1048)

foreign export ccall "bench_chain" benchChain :: Int32 -> IO Int64
foreign export ccall "bench_projection" benchProjection :: Int32 -> IO Int64
