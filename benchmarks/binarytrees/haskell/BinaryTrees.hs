{-# LANGUAGE BangPatterns #-}
-- | binary-trees, from the Computer Language Benchmarks Game, in Haskell,
-- after ../rust/src/lib.rs: a stretch tree, a long-lived tree, and many
-- short-lived trees of increasing depth. Every node is its own heap object
-- with two strict child fields; 'Nil' is the absent child (a static
-- constructor, like null), so a leaf is @Node Nil Nil@. Trees are built in IO
-- so that GHC cannot share one pure tree across loop iterations: every tree
-- is allocated afresh, as in the other ports, and collected by GHC's GC.
module BinaryTrees () where

import Data.Bits (shiftL)
import Data.Int (Int32, Int64)

data Node = Nil | Node !Node !Node

-- | The number of nodes in the tree.
check :: Node -> Int
check (Node left@Node {} right@Node {}) = 1 + check left + check right
check _ = 1

-- | A perfect tree of the given depth, left subtree built first.
bottomUpTree :: Int -> IO Node
bottomUpTree depth
  | depth > 0 = do
      left <- bottomUpTree (depth - 1)
      right <- bottomUpTree (depth - 1)
      pure $! Node left right
  | otherwise = pure $! Node Nil Nil

minDepth, maxDepth :: Int
minDepth = 4
maxDepth = 14

-- | One run of the benchmark; the sum of every tree's check.
binaryTrees :: IO Int64
binaryTrees = do
  let stretchDepth = maxDepth + 1
  stretch <- bottomUpTree stretchDepth
  let !checksum0 = fromIntegral (check stretch)

  longLived <- bottomUpTree maxDepth

  let depths !depth !checksum
        | depth > maxDepth = pure checksum
        | otherwise = do
            let iterations = (1 :: Int) `shiftL` (maxDepth - depth + minDepth)
                loop !i !c
                  | i == iterations = pure c
                  | otherwise = do
                      t <- bottomUpTree depth
                      loop (i + 1) (c + check t)
            c <- loop 0 0
            depths (depth + 2) (checksum + fromIntegral c)
  checksum1 <- depths minDepth checksum0

  pure $! checksum1 + fromIntegral (check longLived)

bench :: Int32 -> IO Int64
bench iterations = go 0 0
  where
    go :: Int32 -> Int64 -> IO Int64
    go !i !acc
      | i >= iterations = pure acc
      | otherwise = do
          r <- binaryTrees
          go (i + 1) (acc + r)

foreign export ccall bench :: Int32 -> IO Int64
