-- BG k-nucleotide GHC #2 (cahu ette), adapted for Wasm:
-- https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/knucleotide-ghc-2.html
-- Changes: single-threaded: Control.Parallel.Strategies (the parallel package)
-- is dropped and threads = [0] (BG: [0 .. 63], 64 strided tables per key), so
-- each count is one table with jumpSize 1; stdin -> the fasta text setup(n)
-- makes; main -> the foreign export bench n (a WASI reactor), which returns the
-- FNV-1a hash of the bytes main printed (printf to a String). hashtables and
-- hashable are not in GHC's wasm package db: they are installed for it with
-- `wasm32-wasi-cabal install --lib hashtables hashable` (program.json passes
-- that package db).

{-# LANGUAGE ScopedTypeVariables #-}
module KNucleotide () where

import Data.Bits
import Data.Char (ord)
import Data.Int (Int32)
import Data.IORef
import Data.List
import Data.Word
import Data.Hashable
import Text.Printf
import System.IO.Unsafe (unsafePerformIO)

import Data.STRef
import Control.Monad
import Control.Monad.ST


import qualified Data.Map.Strict           as M
import qualified Data.HashTable.Class      as HC
import qualified Data.HashTable.ST.Basic   as H
import qualified Data.ByteString.Char8     as B


type HashTable s k v = H.HashTable s k v


{- By using only 2 bits to encode keys, it's important to use a different table
 - for different key sizes. Otherwise, if we encode 'A' as 0x00, "AT" and
 - "AAT" would map to the same bucket in the table.
 -
 - We could use 3 bits per letter to avoid this problem if needed.
 -}
bitsForChar :: Char -> Word64
bitsForChar 'a' = 0
bitsForChar 'A' = 0
bitsForChar 'c' = 1
bitsForChar 'C' = 1
bitsForChar 'g' = 2
bitsForChar 'G' = 2
bitsForChar 't' = 3
bitsForChar 'T' = 3
bitsForChar _   = error "Ay, Caramba!"


charForBits :: Word64 -> Char
charForBits 0 = 'A'
charForBits 1 = 'C'
charForBits 2 = 'G'
charForBits 3 = 'T'
charForBits _ = error "Ay, Caramba!"


packKey :: B.ByteString -> Word64
packKey = go zeroBits
  where
    go k bs = case B.uncons bs of
        Nothing      -> k
        Just (c, cs) -> go (unsafeShiftL k 2 .|. bitsForChar c) cs
{-# INLINE packKey #-}

unpackKey :: Int -> Word64 -> B.ByteString
unpackKey = go []
  where
    go s 0 _ = B.pack s
    go s l i = go (charForBits (i .&. 3) : s) (l-1) (unsafeShiftR i 2)
{-# INLINE unpackKey #-}


updateTable :: (Eq k, Hashable k)
            => HashTable s k (STRef s Int)
            -> (Int -> Int)
            -> k
            -> ST s ()
updateTable t f k = do
    mv <- H.lookup t k
    case mv of
        Nothing -> newSTRef 1 >>= H.insert t k
        Just v  -> modifySTRef' v f
{-# INLINE updateTable #-}


getVal :: (Eq k, Hashable k)
       => HashTable s k (STRef s Int)
       -> k
       -> ST s Int
getVal t k = do
    mv <- H.lookup t k
    case mv of Nothing -> return 0
               Just sv -> readSTRef sv
--{-# INLINE getVal #-}


tableToList :: HashTable s k (STRef s a) -> ST s [(k, a)]
tableToList t = do
    pairs <- HC.toList t
    forM pairs $ \(k, v) -> do
        a <- readSTRef v
        return (k, a)


countOccurrences :: Int -> Int -> B.ByteString -> ST s (HashTable s Word64 (STRef s Int))
countOccurrences jumpSize frameSize input = do
    t <- H.new

    let go bs = unless (B.length bs < frameSize) $ do
            let k = takeFrame bs
            updateTable t (+1) (packKey k)
            go (nextFrame bs)

    go input
    return t

  where
    takeFrame = B.take frameSize
    nextFrame = B.drop jumpSize


extractSequence :: String -> B.ByteString -> B.ByteString
extractSequence s = findSeq
  where
    prefix = B.pack ('>' : s)
    skipSeq =
          B.dropWhile (/= '>')
        . B.drop 1
    takeSeq =
          B.filter    (/= '\n')
        . B.takeWhile (/=  '>') -- extract until next header
        . B.dropWhile (/= '\n') -- skip header
    findSeq str
        | prefix `B.isPrefixOf` str  =  takeSeq str
        | otherwise                  =  findSeq (skipSeq str)



-- BG main, printing into a String.
run :: B.ByteString -> String
run input =
    let s = extractSequence "THREE" input in

    let keys    = ["GGT","GGTA","GGTATT","GGTATTTTAATT","GGTATTTTAATTTATAGT"] in
    let threads = [0] :: [Int] in -- BG: [0 .. 63], one rpar each

    let threadWorkOcc key tid = runST $ do
            t <- countOccurrences (length threads) (B.length key) (B.drop tid s)
            getVal t (packKey key) in

    let calcOcc key = sum $
            map (threadWorkOcc (B.pack key)) threads in

    let threadWorkFreq len tid = runST $ do
            t  <- countOccurrences (length threads) len (B.drop tid s)
            vs <- tableToList t
            return $ map (\(k, v) -> (B.unpack (unpackKey len k), freq v)) vs
          where
            freq v = 100 * fromIntegral v / fromIntegral (B.length s - len + 1) in

    let calcFreq len =
            let l = concat $ map (threadWorkFreq len) threads
                m = foldr (uncurry $ M.insertWith (+)) M.empty l
            in
                M.toList m in

    let resultsOcc = map (\k -> (k, calcOcc k)) keys in

    printFreq (calcFreq 1)
    ++ "\n"
    ++ printFreq (calcFreq 2)
    ++ "\n"
    ++ concatMap (\(k, r) -> printf "%d\t%s\n" r k) resultsOcc

  where

    sortFreq = sortBy
        (\ (k :: String, v :: Double) (k', v') ->
            (compare v' v) `mappend` (compare k k'))

    printFreq :: [(String, Double)] -> String
    printFreq l = concatMap (uncurry (printf "%s %.3f\n")) (sortFreq l)


-- ---- setup(n): BG fasta's output for n (ALU repeated for 2n, IUB random for
-- 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
-- probabilities in double). Untimed.
input :: IORef B.ByteString
input = unsafePerformIO (newIORef B.empty)
{-# NOINLINE input #-}

fasta :: Int -> B.ByteString
fasta n = B.concat $
    [B.pack ">ONE Homo sapiens alu\n"] ++ repeatFasta ++
    [B.pack ">TWO IUB ambiguity codes\n"] ++ iubLines ++
    [B.pack ">THREE Homo sapiens frequency\n"] ++ hsLines
  where
    alu = "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA"
    lines60 [] = []
    lines60 xs = let (a, b) = splitAt 60 xs in B.pack (a ++ "\n") : lines60 b
    repeatFasta = lines60 (take (2 * n) (cycle alu))
    cumul ps = scanl1 (+) ps
    pick cs cum r = let go (c:rest) (p:ps) = if null rest || r < p then c else go rest ps
                        go _ _ = error "pick"
                    in go cs cum
    gen :: String -> [Double] -> Int -> Word32 -> (String, Word32)
    gen cs ps count seed0 = loop count seed0 []
      where
        cum = cumul ps
        loop 0 seed acc = (reverse acc, seed)
        loop k seed acc = let seed' = (seed * 3877 + 29573) `mod` 139968
                              r = fromIntegral seed' / 139968 :: Double
                          in seed' `seq` loop (k - 1) seed' (pick cs cum r : acc)
    (iub, seed1) = gen "acgtBDHKMNRSVWY" [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02] (3 * n) 42
    (hs, _) = gen "acgt" [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008] (5 * n) seed1
    iubLines = lines60 iub
    hsLines = lines60 hs

foreign export ccall setup :: Int32 -> IO ()
setup :: Int32 -> IO ()
setup n = do
    let s = fasta (fromIntegral n)
    B.length s `seq` writeIORef input s

foreign export ccall bench :: Int32 -> IO Word32
bench :: Int32 -> IO Word32
bench _ = do
    s <- readIORef input
    let h = foldl' (\h c -> (h `xor` fromIntegral (ord c)) * 16777619) (2166136261 :: Word32) (run s)
    h `seq` return h
