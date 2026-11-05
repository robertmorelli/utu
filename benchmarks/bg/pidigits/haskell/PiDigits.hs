-- BG pidigits GHC #6, adapted for Wasm:
-- https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/pidigits-ghc-6.html
-- Changes: main -> the foreign export bench n (a WASI reactor) returning the
-- FNV-1a hash of the bytes main printed: each putStr/putStrLn becomes the same
-- text appended to a String, folded strictly. -fno-full-laziness: else GHC floats
-- the digit stream (0 # (1,0,1), which does not depend on n) to a top-level CAF,
-- and every call after the first reuses the memoized digits. The last line's
-- padding is k+1 spaces (GHC #6 has k: one short when n is not a multiple of
-- 10; BG's n is), so n = 27 prints BG's reference output like the other ports. Integer is GHC's own (ghc-bignum;
-- the wasm GHC uses its native Haskell backend, not GMP).

-- The Computer Language Benchmarks Game
-- https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
-- contributed by Bryan O'Sullivan
-- modified by Eugene Kirpichov: pidgits only generates
-- the result string instead of printing it. For some
-- reason, this gives a speedup.
-- modified by W. Gordon Goodsman to do two divisions
-- as per the new task requirements.
-- further modified by W. Gordon Goodsman to reduce the memory leak
-- caused by excess laziness in computing the output string before output.

{-# OPTIONS_GHC -fno-full-laziness #-}
module PiDigits () where

import Data.Bits (xor)
import Data.Char (ord)
import Data.Int (Int32)
import Data.List (foldl')
import Data.Word (Word32)

fnv :: Word32 -> String -> Word32
fnv = foldl' (\h c -> (h `xor` fromIntegral (ord c)) * 16777619)

pidgits :: Int -> String
pidgits n = (1,9) % (0 # (1,0,1)) where
 (i,k)%(d:ds')
  | i <= n = show d ++
               (if k<=0 then "\t:" ++ show i ++ "\n" else "") ++ (j,m)%ds'
  | True = if k<9 then replicate (k+1) ' ' ++ "\t:" ++ show n ++ "\n"
           else ""
  where j = i + 1; m = if k<=0 then 9 else k - 1
 j # s | n>a || q/=r = k # t
       | True = q : k # (n*10,(a-(q*d))*10,d) -- inline eliminateDigit
  where k = j+1; t@(n,a,d)=k&s; q=3$t; r=4$t -- two calls to extractDigit
 c$(n,a,d) = (c*n+a)`div`d -- extractDigit
 j&(n,a,d) = (n*j,(a+n*2)*y,d*y) where y=(j*2+1) -- nextDigit

bench :: Int32 -> IO Word32
bench n32 = do
    let h = fnv 2166136261 (pidgits (fromIntegral n32))
    h `seq` return h

foreign export ccall bench :: Int32 -> IO Word32
