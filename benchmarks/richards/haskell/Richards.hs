{-# LANGUAGE BangPatterns #-}
-- | Richards, Martin Richards' operating-system scheduler simulation, as the
-- Are We Fast Yet suite has it, in Haskell, after ../rust/src/lib.rs.
--
-- Task control blocks and packets are linked lists of records in IO: every
-- field the other ports assign is an 'IORef', and a packet's four data words
-- are a bounds-checked 'IOUArray'. The four kinds of task are one ADT of each
-- kind's private (mutable) data, which the scheduler pattern-matches on.
module Richards () where

import Control.Monad (forM_)
import Data.Array.IO (IOArray, IOUArray, newArray, readArray, writeArray)
import Data.Bits (xor, (.&.))
import Data.Int (Int32, Int64)
import Data.IORef
import Data.Maybe (isNothing)

idler, worker, handlerA, handlerB, deviceA, deviceB, numTypes :: Int
idler = 0
worker = 1
handlerA = 2
handlerB = 3
deviceA = 4
deviceB = 5
numTypes = 6

devicePacketKind, workPacketKind, dataSize :: Int
devicePacketKind = 0
workPacketKind = 1
dataSize = 4

------------------------------------------------------------------------------
-- Packets

data Packet = Packet
  { pLink :: !(IORef (Maybe Packet))
  , pIdentity :: !(IORef Int)
  , pKind :: !Int
  , pDatum :: !(IORef Int)
  , pData :: !(IOUArray Int Int)
  }

newPacket :: Maybe Packet -> Int -> Int -> IO Packet
newPacket link identity k =
  Packet
    <$> newIORef link
    <*> newIORef identity
    <*> pure k
    <*> newIORef 0
    <*> newArray (0, dataSize - 1) 0

-- | Adds the packet to the end of the queue, which may be empty; the queue's
-- head.
append :: Packet -> Maybe Packet -> IO Packet
append packet queueHead = do
  writeIORef (pLink packet) Nothing
  case queueHead of
    Nothing -> pure packet
    Just hd -> do
      let walk mouse = do
            next <- readIORef (pLink mouse)
            case next of
              Just n -> walk n
              Nothing -> writeIORef (pLink mouse) (Just packet)
      walk hd
      pure hd

------------------------------------------------------------------------------
-- Task control blocks

-- | What each kind of task keeps between its runs.
data TaskData
  = Idle !(IORef Int) !(IORef Int) -- control, count
  | Device !(IORef (Maybe Packet)) -- pending
  | Handler !(IORef (Maybe Packet)) !(IORef (Maybe Packet)) -- work in, device in
  | Worker !(IORef Int) !(IORef Int) -- destination, count

data Task = Task
  { tLink :: !(Maybe Task)
  , tIdentity :: !Int
  , tPriority :: !Int
  , tInput :: !(IORef (Maybe Packet))
  , tPacketPending :: !(IORef Bool)
  , tTaskWaiting :: !(IORef Bool)
  , tTaskHolding :: !(IORef Bool)
  , tData :: !TaskData
  }

isTaskHoldingOrWaiting :: Task -> IO Bool
isTaskHoldingOrWaiting t = do
  holding <- readIORef (tTaskHolding t)
  if holding
    then pure True
    else do
      pending <- readIORef (tPacketPending t)
      if pending then pure False else readIORef (tTaskWaiting t)

isWaitingWithPacket :: Task -> IO Bool
isWaitingWithPacket t = do
  pending <- readIORef (tPacketPending t)
  if not pending
    then pure False
    else do
      waiting <- readIORef (tTaskWaiting t)
      if not waiting then pure False else not <$> readIORef (tTaskHolding t)

addInputAndCheckPriority :: Task -> Packet -> Task -> IO Task
addInputAndCheckPriority t packet oldTask = do
  inp <- readIORef (tInput t)
  case inp of
    Nothing -> do
      writeIORef (tInput t) (Just packet)
      writeIORef (tPacketPending t) True
      pure $ if tPriority t > tPriority oldTask then t else oldTask
    Just queue -> do
      q <- append packet (Just queue)
      writeIORef (tInput t) (Just q)
      pure oldTask

setFlags :: Task -> Bool -> Bool -> Bool -> IO ()
setFlags t pending waiting holding = do
  writeIORef (tPacketPending t) pending
  writeIORef (tTaskWaiting t) waiting
  writeIORef (tTaskHolding t) holding

runTask :: Task -> Scheduler -> IO (Maybe Task)
runTask t s = do
  waitingWithPacket <- isWaitingWithPacket t
  message <-
    if waitingWithPacket
      then do
        m <- readIORef (tInput t) >>= maybe (error "a waiting packet") pure
        readIORef (pLink m) >>= writeIORef (tInput t)
        empty <- isNothing <$> readIORef (tInput t)
        if empty
          then setFlags t False False False
          else setFlags t True False False
        pure (Just m)
      else pure Nothing
  runFunction s (tData t) message

------------------------------------------------------------------------------
-- The scheduler

data Scheduler = Scheduler
  { taskList :: !(IORef (Maybe Task))
  , currentTask :: !(IORef (Maybe Task))
  , currentTaskIdentity :: !(IORef Int)
  , taskTable :: !(IOArray Int (Maybe Task))
  , holdCount :: !(IORef Int)
  , queuePacketCount :: !(IORef Int)
  }

newScheduler :: IO Scheduler
newScheduler =
  Scheduler
    <$> newIORef Nothing
    <*> newIORef Nothing
    <*> newIORef 0
    <*> newArray (0, numTypes - 1) Nothing
    <*> newIORef 0
    <*> newIORef 0

createTask :: Scheduler -> Int -> Int -> Maybe Packet -> Bool -> Bool -> Bool -> TaskData -> IO ()
createTask s identity priority work pending waiting holding d = do
  link <- readIORef (taskList s)
  writeIORef (taskList s) Nothing
  t <-
    Task link identity priority
      <$> newIORef work
      <*> newIORef pending
      <*> newIORef waiting
      <*> newIORef holding
      <*> pure d
  writeArray (taskTable s) identity (Just t)
  writeIORef (taskList s) (Just t)

current :: Scheduler -> IO Task
current s = readIORef (currentTask s) >>= maybe (error "a current task") pure

findTask :: Scheduler -> Int -> IO Task
findTask s identity = readArray (taskTable s) identity >>= maybe (error "findTask failed") pure

holdSelf :: Scheduler -> IO (Maybe Task)
holdSelf s = do
  modifyIORef' (holdCount s) (+ 1)
  t <- current s
  writeIORef (tTaskHolding t) True
  pure (tLink t)

waitTask :: Scheduler -> IO (Maybe Task)
waitTask s = do
  t <- current s
  writeIORef (tTaskWaiting t) True
  pure (Just t)

release :: Scheduler -> Int -> IO (Maybe Task)
release s identity = do
  t <- findTask s identity
  writeIORef (tTaskHolding t) False
  cur <- current s
  pure $ Just (if tPriority t > tPriority cur then t else cur)

queuePacket :: Scheduler -> Packet -> IO (Maybe Task)
queuePacket s packet = do
  t <- readIORef (pIdentity packet) >>= findTask s
  modifyIORef' (queuePacketCount s) (+ 1)
  writeIORef (pLink packet) Nothing
  readIORef (currentTaskIdentity s) >>= writeIORef (pIdentity packet)
  cur <- current s
  Just <$> addInputAndCheckPriority t packet cur

-- | One run of a task of each kind, given the packet it received, if any.
runFunction :: Scheduler -> TaskData -> Maybe Packet -> IO (Maybe Task)
runFunction s d work = case d of
  Idle control count -> do
    n <- subtract 1 <$> readIORef count
    writeIORef count n
    if n == 0
      then holdSelf s
      else do
        c <- readIORef control
        if c .&. 1 == 0
          then do
            writeIORef control $! c `quot` 2
            release s deviceA
          else do
            writeIORef control $! (c `quot` 2) `xor` 53256
            release s deviceB
  Device pending -> case work of
    Just w -> do
      writeIORef pending (Just w)
      holdSelf s
    Nothing -> do
      p <- readIORef pending
      writeIORef pending Nothing
      case p of
        Just packet -> queuePacket s packet
        Nothing -> waitTask s
  Handler workIn deviceIn -> do
    forM_ work $ \w -> do
      let queue = if pKind w == workPacketKind then workIn else deviceIn
      q <- readIORef queue
      writeIORef queue Nothing
      append w q >>= writeIORef queue . Just
    wi <- readIORef workIn
    case wi of
      Nothing -> waitTask s
      Just workPacket -> do
        count <- readIORef (pDatum workPacket)
        if count >= dataSize
          then do
            readIORef (pLink workPacket) >>= writeIORef workIn
            queuePacket s workPacket
          else do
            di <- readIORef deviceIn
            case di of
              Nothing -> waitTask s
              Just devicePacket -> do
                readIORef (pLink devicePacket) >>= writeIORef deviceIn
                readArray (pData workPacket) count >>= writeIORef (pDatum devicePacket)
                writeIORef (pDatum workPacket) $! count + 1
                queuePacket s devicePacket
  Worker destination count -> case work of
    Nothing -> waitTask s
    Just w -> do
      dest <- readIORef destination
      let dest' = if dest == handlerA then handlerB else handlerA
      writeIORef destination dest'
      writeIORef (pIdentity w) dest'
      writeIORef (pDatum w) 0
      forM_ [0 .. dataSize - 1] $ \i -> do
        c <- (+ 1) <$> readIORef count
        let c' = if c > 26 then 1 else c
        writeIORef count c'
        writeArray (pData w) i c'
      queuePacket s w

schedule :: Scheduler -> IO ()
schedule s = do
  readIORef (taskList s) >>= writeIORef (currentTask s)
  let loop = do
        ct <- readIORef (currentTask s)
        case ct of
          Nothing -> pure ()
          Just t -> do
            heldOrWaiting <- isTaskHoldingOrWaiting t
            if heldOrWaiting
              then writeIORef (currentTask s) (tLink t)
              else do
                writeIORef (currentTaskIdentity s) (tIdentity t)
                runTask t s >>= writeIORef (currentTask s)
            loop
  loop

------------------------------------------------------------------------------
-- The benchmark

-- | One simulation: queuePacketCount * 100000 + holdCount (23246 and 9297).
richards :: IO Int64
richards = do
  s <- newScheduler
  idle <- Idle <$> newIORef 1 <*> newIORef 10000
  createTask s idler 0 Nothing False False False idle

  workQ0 <- newPacket Nothing worker workPacketKind
  workQ1 <- newPacket (Just workQ0) worker workPacketKind
  wrk <- Worker <$> newIORef handlerA <*> newIORef 0
  createTask s worker 1000 (Just workQ1) True True False wrk

  qa0 <- newPacket Nothing deviceA devicePacketKind
  qa1 <- newPacket (Just qa0) deviceA devicePacketKind
  qa2 <- newPacket (Just qa1) deviceA devicePacketKind
  ha <- Handler <$> newIORef Nothing <*> newIORef Nothing
  createTask s handlerA 2000 (Just qa2) True True False ha

  qb0 <- newPacket Nothing deviceB devicePacketKind
  qb1 <- newPacket (Just qb0) deviceB devicePacketKind
  qb2 <- newPacket (Just qb1) deviceB devicePacketKind
  hb <- Handler <$> newIORef Nothing <*> newIORef Nothing
  createTask s handlerB 3000 (Just qb2) True True False hb

  da <- Device <$> newIORef Nothing
  createTask s deviceA 4000 Nothing False True False da
  db <- Device <$> newIORef Nothing
  createTask s deviceB 5000 Nothing False True False db

  schedule s
  qpc <- readIORef (queuePacketCount s)
  hc <- readIORef (holdCount s)
  pure $ fromIntegral qpc * 100000 + fromIntegral hc

-- | Each iteration runs the simulation 'innerIterations' times.
innerIterations :: Int32
innerIterations = 10

bench :: Int32 -> IO Int64
bench iterations = go 0 0
  where
    go :: Int32 -> Int64 -> IO Int64
    go !i !acc
      | i >= iterations * innerIterations = pure acc
      | otherwise = do
          r <- richards
          go (i + 1) (acc + r)

foreign export ccall bench :: Int32 -> IO Int64
