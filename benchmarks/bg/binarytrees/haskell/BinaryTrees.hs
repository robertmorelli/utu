{-# LANGUAGE BangPatterns #-}
-- BG binary-trees GHC #4 (Don Stewart; Roman Kashitsyn, Artem Pelenitsyn; Izaak
-- Weiss; Jaro Reinders), adapted for Wasm:
-- https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-ghc-4.html
-- Changes: single-threaded: Control.Parallel.Strategies (the parallel package,
-- not in the Wasm GHC's package db) is dropped, so checkPar4/makePar4/makePar2
-- compute the same subtrees without `using` and `vs` is the plain list; the
-- long-lived tree stays in a compact region (GHC.Compact, ghc-compact). main ->
-- the foreign export bench n (a WASI reactor), which returns the FNV-1a hash of
-- the bytes main printed (printf to a String in place of printf to stdout).

--
-- The Computer Language Benchmarks Game
-- https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
--
-- Contributed by Don Stewart
-- Basic parallelization by Roman Kashitsyn and Artem Pelenitsyn
-- Tail call optimizations by Izaak Weiss
-- Compact region optimization by Jaro Reinders
--

module BinaryTrees () where

import Data.Bits
import Data.Char (ord)
import Data.Int (Int32)
import Data.Word (Word32)
import Text.Printf
import GHC.Compact

--
-- an artificially strict tree. 
--
-- normally you would ensure the branches are lazy, but this benchmark
-- requires strict allocation.
--
data Tree = Nil | Node !Tree !Tree

minN = 4

io :: String -> Int -> Int -> String
io s n t = printf "%s of depth %d\t check: %d\n" s n t

fnv :: Word32 -> String -> Word32
fnv = foldl (\h c -> (h `xor` fromIntegral (ord c)) * 16777619)

bench :: Int32 -> IO Word32
bench n32 = do
    let n = fromIntegral n32 :: Int
    let maxN     = max (minN + 2) n
        stretchN = maxN + 1

    -- stretch memory tree
    let c = checkPar4 (makePar4 stretchN)
    let !h0 = fnv 2166136261 (io "stretch tree" stretchN c)

    -- allocate a long lived tree (in a compact region)
    long <- compact (makePar2 maxN)

    -- allocate, walk, and deallocate many bottom-up binary trees
    let vs = depth minN maxN
    let !h1 = foldl (\h (m,d,i) -> fnv h (io (show m ++ "\t trees") d i)) h0 vs

    -- confirm the the long-lived binary tree still exists
    let !h2 = fnv h1 (io "long lived tree" maxN (check (getCompact long)))
    return h2

foreign export ccall bench :: Int32 -> IO Word32

-- generate trees of depth @d@, @d+1@... until @m@
depth :: Int -> Int -> [(Int, Int, Int)]
depth d m
    | d <= m    = (n, d, sumT d n 0) : depth (d+2) m
    | otherwise = []
  where n = 1 `shiftL` (m - d + minN)

-- allocate and check @i@ trees of depth @d@
sumT :: Int -> Int -> Int -> Int
sumT d 0 t = t
sumT d i t = sumT d (i-1) (t + a)
  where a = check (make d)

-- traverse the tree, counting up the nodes
check :: Tree -> Int
check t = tailCheck t 0

tailCheck :: Tree -> Int -> Int
tailCheck Nil        !a = a
tailCheck (Node l r) !a = tailCheck l $ tailCheck r $ a + 1

-- traverse and count nodes (4 subtrees; in parallel on BG)
checkPar4 :: Tree -> Int
checkPar4 (Node (Node ll lr) (Node rl rr)) = all + alr + arl + arr + 3 where
  all = tailCheck ll 0
  alr = tailCheck lr 0
  arl = tailCheck rl 0
  arr = tailCheck rr 0

-- build a tree
make :: Int -> Tree
make d =
  if d < 10 then make' d else makePar2 d

make' :: Int -> Tree
make' 0 = Node Nil Nil
make' d = Node (make' (d - 1)) (make' (d - 1))

-- build a tree (4 subtrees; in parallel on BG)
makePar4 :: Int -> Tree
makePar4 d = Node (Node ll lr) (Node rl rr) where
  !d' = d - 2
  ll = make' d'
  lr = make' d'
  rl = make' d'
  rr = make' d'

-- build a tree (2 subtrees; in parallel on BG)
makePar2 :: Int -> Tree
makePar2 d = Node l r where
  !d' = d - 1
  l = make' d'
  r = make' d'
