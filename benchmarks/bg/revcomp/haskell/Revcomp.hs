-- BG revcomp GHC #4 (Louis Wasserman; GHC 9.0, 9.2 fix by Artem Pelenitsyn), adapted for Wasm:
-- https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/revcomp-ghc-4.html
-- Changes: hGetBuf stdin -> getInput, a copy from the fasta output setup n
-- generated (fasta GHC #6's generator, below, with out appending to it), with
-- hGetBuf's contract (up to n bytes, 0 at the end); hPutBuf stdout -> putOut,
-- FNV-1a over the bytes. main -> the foreign export bench (a WASI reactor), which
-- returns the hash and frees the buffer. Single-threaded already.

{-
The Computer Language Benchmarks Game
https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

contributed by Louis Wasserman
GHC 9.0, 9.2 fix by Artem Pelenitsyn
-}

{-# LANGUAGE BangPatterns #-}
module Revcomp () where

import Control.Monad
import Foreign hiding (void)
import Foreign.Marshal.Alloc
import Foreign.Marshal.Array
import Foreign.Ptr
import Foreign.Storable
import Data.Bits (xor)
import Data.Char
import Data.Int (Int32)
import Data.IORef
import Data.Word
import Data.ByteString.Internal (c2w, memchr)
import System.IO.Unsafe (unsafeDupablePerformIO, unsafePerformIO)

-- ---- input: the fasta output setup n generates (pointer, length, capacity)
input :: IORef (Ptr Word8, Int, Int)
input = unsafePerformIO (newIORef (nullPtr, 0, 0))
{-# NOINLINE input #-}

out :: Ptr Word8 -> Int -> IO ()
out p len = do
  (b, n, cap) <- readIORef input
  (b', cap') <- if n + len <= cap then return (b, cap) else do
    let cap' = head (filter (>= n + len) (iterate (* 2) (max cap 1048576)))
    b' <- reallocBytes b cap'
    return (b', cap')
  copyBytes (b' `plusPtr` n) p len
  writeIORef input (b', n + len, cap')

outString :: String -> IO ()
outString s = withArrayLen (map (fromIntegral . ord) s) $ \len ptr -> out ptr len

-- ---- fasta generator: copy from here to "end of the fasta generator"

type Cumul = Word32
type Str = Ptr Word8
type Dist = Ptr Cumul

bufferSize, linesPerBuffer, lineLength :: Int
bufferSize = linesPerBuffer * lineLength
linesPerBuffer = 3000
lineLength = 60

ia, ic, im :: Cumul
ia = 3877
ic = 29573
im = 139968

printRepeatedFasta :: Int -> (Str, Int) -> IO ()
printRepeatedFasta n (alu, l) = do
  buf <- mallocBytes m' :: IO (Ptr Word8)
  let
    go 0 i j = do
      pokeElemOff buf i (fromIntegral (ord '\n'))
      go lineLength (i + 1) j
    go x i j
      | i < m' = do
        pokeElemOff buf i =<< peekElemOff alu j
        go (x - 1) (i + 1) ((j + 1) `rem` l)
      | otherwise = return ()
  go lineLength 0 0

  replicateM_ q (out buf m')
  pokeElemOff buf (r + (r `quot` lineLength)) (fromIntegral (ord '\n'))
  out buf (r + (r `quot` lineLength) + 1)
  free buf
  where
    m = lcm l lineLength
    m' = m + m `quot` lineLength
    (q,r) = quotRem n m

-- One worker: fill rnd from the seed, select into out, write; until n is done.
worker :: Ptr Cumul -> Ptr Word8 -> Str -> Dist -> Int -> Cumul -> IO Cumul
worker rnd outb p0 p1 = loop where
  loop n' s = do
    let n = min bufferSize n'
    s' <- if (n > 0) then prng n 0 s else return s
    if n > 0 then do
      select lineLength 0 0
      out outb (n + n `quot` lineLength)
      loop (n' - n) s'
    else return s'

  prng :: Int -> Int -> Cumul -> IO Cumul
  prng 0 _ s = return s
  prng todo n s = let s' = (ia * s + ic) `rem` im in do
    pokeElemOff rnd n s'
    prng (todo - 1) (n + 1) s'

  select :: Int -> Int -> Int -> IO ()
  select 0 outi rndi = do
    pokeElemOff outb outi (fromIntegral (ord '\n'))
    select lineLength (outi + 1) rndi
  select l outi rndi
    | rndi < bufferSize = do
      rn <- peekElemOff rnd rndi
      c <- lookupCumul rn
      pokeElemOff outb outi c
      select (l - 1) (outi + 1) (rndi + 1)
    | otherwise = return ()

  lookupCumul c = go 0 where
    go i = do
      p <- peekElemOff p1 i
      if c <= p then peekElemOff p0 i else go (i + 1)

printRandomFasta :: Ptr Cumul -> Ptr Word8 -> (Str, Dist) -> Int -> Cumul -> IO Cumul
printRandomFasta rnd outb (p0, p1) n s = do
  s' <- worker rnd outb p0 p1 n s
  when (n `rem` lineLength /= 0) (outString "\n")
  return s'

fasta :: Int -> IO ()
fasta n = do
  outString ">ONE Homo sapiens alu\n"
  aluP <- newArray aluBytes
  printRepeatedFasta (2 * n) (aluP, length aluBytes)
  free aluP

  rndBuf <- callocBytes (bufferSize * 4)
  outBuf <- callocBytes (bufferSize + linesPerBuffer)

  outString ">TWO IUB ambiguity codes\n"
  iub <- cumulativeProbabilities
      [('a', 0.27), ('c', 0.12), ('g', 0.12), ('t', 0.27), ('B', 0.02),
       ('D', 0.02), ('H', 0.02), ('K', 0.02), ('M', 0.02), ('N', 0.02),
       ('R', 0.02), ('S', 0.02), ('V', 0.02), ('W', 0.02), ('Y', 0.02)]
  s <- printRandomFasta rndBuf outBuf iub (3 * n) 42

  outString ">THREE Homo sapiens frequency\n"
  hs <- cumulativeProbabilities
      [('a', 0.3029549426680), ('c', 0.1979883004921),
       ('g', 0.1975473066391), ('t', 0.3015094502008)]
  void $ printRandomFasta rndBuf outBuf hs (5 * n) s
  mapM_ free [fst iub, fst hs]
  mapM_ free [castPtr (snd iub), castPtr (snd hs), castPtr rndBuf, outBuf]
  where
    aluBytes = map (fromIntegral . ord)
      "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGT\
      \CAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGG\
      \CGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGG\
      \CGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAA\
      \AAA" :: [Word8]

    cumulativeProbabilities :: [(Char, Float)] -> IO (Str, Dist)
    cumulativeProbabilities xs = do
        a <- newArray as'
        b <- newArray bs'
        return (a, b)
      where
        as' = map (fromIntegral . ord) as
        bs' = init (map (floor . (* fromIntegral im)) (scanl1 (+) bs)) ++ [im]
        (as, bs) = unzip xs
-- ---- end of the fasta generator

foreign export ccall setup :: Int32 -> IO ()

setup :: Int32 -> IO ()
setup n = do
  (b, _, cap) <- readIORef input
  writeIORef input (b, 0, cap)
  fasta (fromIntegral n)

-- stdin: hGetBuf from the input
inputPos :: IORef Int
inputPos = unsafePerformIO (newIORef 0)
{-# NOINLINE inputPos #-}

getInput :: Ptr Word8 -> Int -> IO Int
getInput dst count = do
  (b, n, _) <- readIORef input
  pos <- readIORef inputPos
  let m = min count (n - pos)
  copyBytes dst (b `plusPtr` pos) m
  writeIORef inputPos (pos + m)
  return m

-- stdout: FNV-1a over what is written
outHash :: IORef Word32
outHash = unsafePerformIO (newIORef 0)
{-# NOINLINE outHash #-}

putOut :: Ptr Word8 -> Int -> IO ()
putOut p len = do
  h0 <- readIORef outHash
  let go !h !i
        | i < len = do
          b <- peekElemOff p i
          go ((h `xor` fromIntegral b) * 16777619) (i + 1)
        | otherwise = return h
  h <- go h0 0
  writeIORef outHash h

data Buf = Buf !Int !Int !(Ptr Word8) 

withBuf run = run . Buf 0 ini =<< mallocBytes ini
  where ini = 1024

newSize len sz
  | len <= sz  = sz
  | otherwise  = newSize len (2 * sz)

{-# INLINE putBuf #-}
putBuf pS lS (Buf lD szD pD) run
  | lD' > szD  = do
    let szD' = newSize lD' szD
    pD' <- reallocBytes pD szD'
    copyArray (pD' +* lD) pS lS
    run (Buf lD' szD' pD')
  | otherwise  = do
    copyArray (pD +* lD) pS lS
    run (Buf lD' szD pD)
  where lD' = lD + lS

findChar p n c zero one = do
    q <- memchr p c (fromIntegral (n :: Int))
    if q == nullPtr then zero else one $! q `minusPtr` p

clearBuf (Buf _ lB pB) = Buf 0 lB pB

-- main, with the buffer freed at the end (bench runs repeatedly)
revcompMain :: IO ()
revcompMain = allocaArray 82 $ \ line ->
  let go !buf = do
        !m <- getInput line 82
        if m == 0 then revcomp buf >> freeBuf buf else do
          findChar line m (c2w '>') 
            (putBuf line m buf go)
            (\ end -> do
              putBuf line end buf revcomp
              putBuf (line +* end) (m - end) (clearBuf buf)
                go)
    in withBuf go
  where freeBuf (Buf _ _ p) = free p

(+*) = advancePtr

{-# INLINE comps #-}
comps = Prelude.zipWith (\ a b -> (fromEnum a, c2w b)) "AaCcGgTtUuMmRrYyKkVvHhDdBb" 
  "TTGGCCAAAAKKYYRRMMBBDDHHVV"

ca :: Ptr Word8
ca = unsafeDupablePerformIO $ do
       !a <- mallocArray 200
       mapM_ (\ i -> pokeByteOff a (fromIntegral i) i ) [0..199::Word8]
       mapM_ (uncurry (pokeByteOff a)) comps
       return a

revcomp (Buf lBuf _ pBuf) = when (lBuf > 0) $ ca `seq`
  findChar pBuf lBuf (c2w '\n') undefined $ \ begin -> let
    begin' = begin + 1
    rc :: Ptr Word8 -> Ptr Word8 -> IO ()
    rc !i !j | i < j = do
      x <- peek i
      if x == c2w '\n' then let !i' = i +* 1 in rc1 j i' =<< peek i'
        else rc1 j i x
    rc i j = when (i == j) (poke i =<< comp =<< peek i)
    
    rc1 !j !i !xi = do
      y <- peek j
      if y == c2w '\n' then let !j' = j +* (-1) in rc2 i xi j' =<< peek j'
        else rc2 i xi j y
    
    comp = peekElemOff ca . fromIntegral
    
    rc2 !i !xi !j !xj = do
      poke j =<< comp xi
      poke i =<< comp xj
      rc (i +* 1) (j +* (-1))
    in do
      putOut pBuf begin'
      rc (pBuf +* begin') (pBuf +* (lBuf - 1))
      putOut (pBuf +* begin') (lBuf - begin - 1)

foreign export ccall bench :: Int32 -> IO Word32

bench :: Int32 -> IO Word32
bench _ = do
  writeIORef outHash 2166136261
  writeIORef inputPos 0
  revcompMain
  h <- readIORef outHash
  h `seq` return h
