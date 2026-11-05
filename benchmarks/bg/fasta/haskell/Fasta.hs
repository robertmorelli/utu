-- BG fasta GHC #6 (Jaro Reinders), adapted for Wasm:
-- https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fasta-ghc-6.html
-- Changes: massiv is not in GHC's wasm package set, so its arrays are the
-- Foreign buffers they wrap (A.P/A.S arrays -> Ptr, unsafeWrite/unsafeIndex/
-- unsafeRead -> pokeElemOff/peekElemOff). Single-threaded: the 4 forkIO workers
-- taking turns through MVars become one worker loop over one rnd/out buffer pair
-- (same prng, select and lookupCumul, same bufferSize blocks). c_write 1 -> out,
-- the output sink (here: FNV-1a over the bytes in an IORef); main -> fasta n
-- and the foreign export bench (a WASI reactor). Programs that read fasta's
-- output copy the block between the "fasta generator" markers and make out append
-- (scratchpad fasta-input.md).

-- The Computer Language Benchmarks Game
-- https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
--
-- Contributed by Jaro Reinders

{-# LANGUAGE BangPatterns #-}
module Fasta () where

import Data.Bits (xor)
import Data.Char
import Data.Int (Int32)
import Data.IORef
import Data.Word
import Control.Monad
import Foreign.Marshal.Alloc
import Foreign.Marshal.Array
import Foreign.Ptr
import Foreign.Storable
import System.IO.Unsafe

-- ---- output sink: what BG writes to stdout goes here
fnvHash :: IORef Word32
fnvHash = unsafePerformIO (newIORef 0)
{-# NOINLINE fnvHash #-}

out :: Ptr Word8 -> Int -> IO ()
out p len = do
  h0 <- readIORef fnvHash
  let go !h !i
        | i < len = do
          b <- peekElemOff p i
          go ((h `xor` fromIntegral b) * 16777619) (i + 1)
        | otherwise = return h
  h <- go h0 0
  writeIORef fnvHash h

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

foreign export ccall bench :: Int32 -> IO Word32

bench :: Int32 -> IO Word32
bench n = do
  writeIORef fnvHash 2166136261
  fasta (fromIntegral n)
  h <- readIORef fnvHash
  h `seq` return h
