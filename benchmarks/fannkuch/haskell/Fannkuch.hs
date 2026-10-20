{-# LANGUAGE BangPatterns #-}
-- | fannkuch-redux from the Computer Language Benchmarks Game, after its
-- single-threaded C program, in Haskell, after ../rust/src/lib.rs: three
-- bounds-checked 'IOUArray's of 'Int32' (perm, perm1, count), permutations
-- generated in place with the count array, each one flipped (prefix reversal)
-- until its first element is 0. The scalar locals the other ports reassign
-- (r, flips, maxFlips, checksum, permCount) are strict loop arguments.
module Fannkuch () where

import Control.Monad (forM_)
import Data.Array.IO (IOUArray, newArray, newListArray, readArray, writeArray)
import Data.Bits (shiftR)
import Data.Int (Int32, Int64)

-- | checksum * 1000 + maxFlips for all permutations of 0..n-1.
fannkuch :: Int -> IO Int64
fannkuch n = do
  perm <- newArray (0, n - 1) 0 :: IO (IOUArray Int Int32)
  perm1 <- newListArray (0, n - 1) [0 .. fromIntegral n - 1] :: IO (IOUArray Int Int32)
  count <- newArray (0, n - 1) 0 :: IO (IOUArray Int Int32)
  let permutation :: Int -> Int32 -> Int32 -> Int32 -> IO Int64
      permutation !r0 !maxFlips !checksum !permCount = do
        let fill !r
              | r == 1 = pure r
              | otherwise = do
                  writeArray count (r - 1) (fromIntegral r)
                  fill (r - 1)
        r <- fill r0
        forM_ [0 .. n - 1] $ \i -> readArray perm1 i >>= writeArray perm i
        let flipping !flips = do
              k <- fromIntegral <$> readArray perm 0
              if k == 0
                then pure flips
                else do
                  let k2 = (k + 1) `shiftR` 1
                  forM_ [0 .. k2 - 1] $ \i -> do
                    a <- readArray perm i
                    b <- readArray perm (k - i)
                    writeArray perm i b
                    writeArray perm (k - i) a
                  flipping (flips + 1)
        flips <- flipping 0
        let maxFlips' = max maxFlips flips
            checksum'
              | permCount `rem` 2 == 0 = checksum + flips
              | otherwise = checksum - flips
            -- The next permutation: rotate the first r + 1 elements left
            -- until a count stays positive.
            next !r'
              | r' == n = pure (fromIntegral checksum' * 1000 + fromIntegral maxFlips')
              | otherwise = do
                  perm0 <- readArray perm1 0
                  forM_ [0 .. r' - 1] $ \i -> readArray perm1 (i + 1) >>= writeArray perm1 i
                  writeArray perm1 r' perm0
                  c <- subtract 1 <$> readArray count r'
                  writeArray count r' c
                  if c > 0
                    then permutation r' maxFlips' checksum' (permCount + 1)
                    else next (r' + 1)
        next r
  permutation n 0 0 0

bench :: Int32 -> IO Int64
bench iterations = go 0 0
  where
    go :: Int32 -> Int64 -> IO Int64
    go !i !acc
      | i >= iterations = pure acc
      | otherwise = do
          r <- fannkuch 9
          go (i + 1) (acc + r)

foreign export ccall bench :: Int32 -> IO Int64
