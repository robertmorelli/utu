-- BG regex-redux GHC #3 (Jaro Reinders, after gcc #5), adapted:
-- https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/regexredux-ghc-3.html
-- Changes: main -> the foreign exports setup n (the fasta text, untimed) and
-- bench n (a WASI reactor), which returns FNV-1a 32 of the bytes BG prints.
-- PCRE2 (vendored, ../pcre2, compiled by GHC's wasi-sdk clang from
-- pcre2_lib.c beside this file) has no JIT on Wasm: pcre2_jit_compile, the
-- JIT stack and the capi import of PCRE2_JIT_COMPLETE are gone and
-- pcre2_jit_match is pcre2_match. Data.Vector.Storable (the vector package) is
-- not among the GHC wasm toolchain's packages, so the GrowString is a raw
-- buffer (Ptr Word8, capacity, size) grown with reallocBytes, copied with
-- copyBytes. Single-threaded (forkOn/forkIO and the MVars run in order).

-- The Computer Language Benchmarks Game
-- https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
--
-- contributed by Jaro Reinders
--
-- adapted from the C implementation that was:
--   contributed by Jeremy Zerfas
--   modified by Zoltan Herczeg

{-# LANGUAGE BangPatterns #-}
module RegexRedux () where

import Foreign.C.Types
import Foreign.C.String
import Foreign.Ptr
import Foreign.Marshal.Alloc
import Foreign.Marshal.Utils (copyBytes)
import Data.Word
import Data.Int
import Data.Bits
import Data.IORef
import Control.Monad
import Foreign.Storable
import Data.Foldable
import Data.Char
import System.IO.Unsafe (unsafePerformIO)

-- first some foreign imports (Haskell does not have a proper pcre2 binding!)

foreign import ccall "pcre2.h pcre2_get_ovector_pointer_8"
  c_pcre2_get_ovector_pointer :: Ptr MatchData -> IO (Ptr CSize)

foreign import ccall "pcre2.h pcre2_compile_8"
  c_pcre2_compile :: Ptr CChar -> CSize -> CInt -> Ptr CInt -> Ptr CSize
    -> Ptr () -> IO (Ptr Code)

-- This one is marked unsafe for extra performance.
-- See https://wiki.haskell.org/Performance/FFI
foreign import ccall unsafe "pcre2.h pcre2_match_8"
  c_pcre2_match :: Ptr Code -> Ptr CChar -> CSize -> CSize -> CUInt
    -> Ptr MatchData -> Ptr MatchContext -> IO CInt

foreign import ccall "pcre2.h pcre2_code_free_8"
  c_pcre2_code_free :: Ptr Code -> IO ()

foreign import ccall "pcre2.h pcre2_match_context_create_8"
  c_pcre2_match_context_create :: Ptr GeneralContext -> IO (Ptr MatchContext)

foreign import ccall "pcre2.h pcre2_match_data_create_8"
  c_pcre2_match_data_create :: CUInt -> Ptr GeneralContext
    -> IO (Ptr MatchData)

foreign import ccall "pcre2.h pcre2_match_context_free_8"
  c_pcre2_match_context_free :: Ptr MatchContext -> IO ()

foreign import ccall "pcre2.h pcre2_match_data_free_8"
  c_pcre2_match_data_free :: Ptr MatchData -> IO ()

data MatchData
data MatchContext
data Code
data GeneralContext

-- (BG: an IOVector Word8 and a size.)
data GrowString = GrowString
  {-# UNPACK #-} !(Ptr Word8)
  {-# UNPACK #-} !Int -- capacity
  {-# UNPACK #-} !Int -- size

newGrowString :: Int -> IO GrowString
newGrowString cap = (\p -> GrowString p cap 0) <$> mallocBytes cap

-- (BG: M.grow dat (M.length dat).)
growString :: GrowString -> IO GrowString
growString (GrowString dat cap siz) = do
  dat' <- reallocBytes dat (cap * 2)
  return (GrowString dat' (cap * 2) siz)

-- A pattern or replacement: bytes and length.
type Bytes = (Ptr CChar, Int)

-- Function for searching a srcString for a pattern, replacing it with some
-- specified replacement, and storing the result in dstString.
--
-- dstString might be reallocated so this function returns a new GrowString.
replace :: Bytes -> Bytes -> (Ptr Word8, Int)
  -> GrowString -> Ptr MatchContext -> Ptr MatchData -> IO GrowString
replace (!patternPtr, !patternLen) (!replacementPtr, !replacementSize) (!srcPtr, !srcStringLen) !dstString !mcontext !mdata =
  alloca $ \errorCode -> alloca $ \errorOffset -> do
    match <- c_pcre2_get_ovector_pointer mdata

    -- Compile and study pattern.
    regex <- c_pcre2_compile patternPtr (fromIntegral patternLen) 0 errorCode
      errorOffset nullPtr

    -- Find each match of the pattern in srcString and append the characters
    -- preceding each match and the replacement text to dstString.
    let
      go !pos !dstString = do
        !x <- c_pcre2_match regex (castPtr srcPtr)
            (fromIntegral srcStringLen) (fromIntegral pos) 0 mdata mcontext
        if (x >= 0) then do
          !match0 <- fromIntegral <$> peekElemOff match 0

          -- Allocate more memory for dstString if there is not enough space
          -- for the characters preceding the match and the replacement text.
          let
            growLoop str@(GrowString _ !cap !siz)
              | siz + match0 - pos + replacementSize > cap =
                growString str >>= growLoop
              | otherwise = return str
          (GrowString dat cap siz) <- growLoop dstString

          -- Append the characters preceding the match and the replacement text
          -- to dstString and update the size of dstString.
          let
            !siz' = siz + match0 - pos
            !siz'' = siz' + replacementSize
          copyBytes (dat `plusPtr` siz) (srcPtr `plusPtr` pos) (match0 - pos)
          copyBytes (dat `plusPtr` siz') (castPtr replacementPtr) replacementSize

          -- Find the new pos to continue after the current match.
          !pos' <- fromIntegral <$> peekElemOff match 1

          go pos' (GrowString dat cap siz'')
        else return (pos, dstString)
    (!pos, !dstString') <- go 0 dstString

    c_pcre2_code_free regex

    -- Allocate more memory for dstString if there is not enough space for the
    -- characters following the last match (or the entire srcString if there
    -- was no match).
    let
      growLoop str@(GrowString _ !cap !siz)
        | siz + srcStringLen - pos > cap = growString str >>= growLoop
        | otherwise = return str
    (GrowString dat cap siz) <- growLoop dstString'

    -- Append the characters following the last match (or the entire srcString
    -- if there was no match) to dstString and update the size of dstString.
    copyBytes (dat `plusPtr` siz) (srcPtr `plusPtr` pos) (srcStringLen - pos)

    return (GrowString dat cap (siz + srcStringLen - pos))

run :: (Ptr Word8, Int) -> IO String
run (inputPtr, inputSiz) = do
  let
    countInfo =
      [ "agggtaaa|tttaccct"
      , "[cgt]gggtaaa|tttaccc[acg]"
      , "a[act]ggtaaa|tttacc[agt]t"
      , "ag[act]gtaaa|tttac[agt]ct"
      , "agg[act]taaa|ttta[agt]cct"
      , "aggg[acg]aaa|ttt[cgt]ccct"
      , "agggt[cgt]aa|tt[acg]accct"
      , "agggta[cgt]a|t[acg]taccct"
      , "agggtaa[cgt]|[acg]ttaccct"
      ]
    replaceInfo =
      [ ("tHa[Nt]", "<4>")
      , ("aND|caN|Ha[DS]|WaS", "<3>")
      , ("a[NSt]|BY", "<2>")
      , ("<[^>]*>", "|")
      , ("\\|[^|][^|]*\\|", "-")
      ]

  sequences <- newGrowString 16384

  let
    threadInit = do
      mcontext <- c_pcre2_match_context_create nullPtr
      mdata <- c_pcre2_match_data_create 16 nullPtr
      return (mcontext, mdata)
  (mcontext, mdata) <- threadInit

  -- Find all sequence descriptions and new lines in input, replace them with
  -- empty strings, and store the result in the sequences string.
  sequences'@(GrowString seqDat seqCap seqSiz) <-
    withCAStringLen ">.*\n|\n" $ \pat -> withCAStringLen "" $ \rep ->
      replace pat rep (inputPtr, inputSiz) sequences mcontext mdata

  -- Work on performing all the replacements serially.
  -- (BG: on a thread forked to capability 0.)
  prereplaceString <- do
    p <- mallocBytes seqCap
    copyBytes p seqDat seqSiz
    return (GrowString p seqCap seqSiz)
  postreplaceString <- newGrowString seqCap

  -- Iterate through all the replacement patterns and their replacements in
  -- replaceInfo
  let
    cons (pre@(GrowString dat cap siz), post) (a, b) = do
      post' <- withCAStringLen a $ \pat -> withCAStringLen b $ \rep ->
        replace pat rep (dat, siz) post mcontext mdata
      let pre' = (GrowString dat cap 0)
      -- Swap pre and post in the next iteration.
      return (post', pre')
  -- If any replacements were made, they'll be in the fst element of the
  -- tuple instead of the second because of the swap done at the end of each
  -- iteration.
  (GrowString d1 _ !siz, GrowString d2 _ _) <- foldlM cons
    (prereplaceString, postreplaceString) replaceInfo
  free d1
  free d2

  c_pcre2_match_context_free mcontext
  c_pcre2_match_data_free mdata

  -- Iterate through all the count patterns in countInfo.
  -- (BG: each on its own thread, printing in order.)
  counts <- forM countInfo $ \pattern -> do
      (mcontext, mdata) <- threadInit
      match <- c_pcre2_get_ovector_pointer mdata

      -- Compile and study pattern.
      regex <- alloca $ \errorCode -> alloca $ \errorOffset ->
        withCAStringLen pattern $ \(patternPtr, patternLen) -> c_pcre2_compile
          patternPtr (fromIntegral patternLen) 0 errorCode
          errorOffset nullPtr

      -- Find each match of the pattern in the sequences string and increment
      -- count for each match.
      let
        go :: Int -> CSize -> IO Int
        go !count !pos = do
          x <- c_pcre2_match regex
            (castPtr seqDat) (fromIntegral seqSiz) pos 0 mdata mcontext
          if x >= 0 then do
            -- Find the new pos to continue searching after the current match.
            pos' <- peekElemOff match 1
            go (count + 1) pos'
          else return count
      count <- go 0 0

      c_pcre2_code_free regex

      c_pcre2_match_context_free mcontext
      c_pcre2_match_data_free mdata

      -- Print the count for each pattern in the correct order.
      return (pattern ++ " " ++ show count ++ "\n")

  free seqDat

  -- Print the size of the original input, the size of the input without the
  -- sequence descriptions & new lines, and the size after having made all the
  -- replacements.
  return (concat counts ++ "\n" ++ show inputSiz ++ "\n" ++ show seqSiz ++ "\n" ++ show siz ++ "\n")

-- ---- setup n: BG fasta's output for n (ALU repeated for 2n, IUB random for
-- 3n, Homo sapiens random for 5n, lines of 60; LCG seed 42, cumulative
-- probabilities in double). Untimed.
{-# NOINLINE inputRef #-}
inputRef :: IORef (Ptr Word8, Int)
inputRef = unsafePerformIO (newIORef (nullPtr, 0))

fasta :: Int -> IO (Ptr Word8, Int)
fasta n = do
  let size = 22 + 2 * n + (2 * n + 59) `div` 60 + 25 + 3 * n + (3 * n + 59) `div` 60 + 31 + 5 * n + (5 * n + 59) `div` 60
  buf <- mallocBytes size
  pos <- newIORef 0
  let put c = do { p <- readIORef pos; pokeByteOff buf p (c :: Word8); writeIORef pos (p + 1) }
      puts = mapM_ (put . fromIntegral . ord)
      alu = map (fromIntegral . ord) "GGCCGGGCGCGGTGGCTCACGCCTGTAATCCCAGCACTTTGGGAGGCCGAGGCGGGCGGATCACCTGAGGTCAGGAGTTCGAGACCAGCCTGGCCAACATGGTGAAACCCCGTCTCTACTAAAAATACAAAAATTAGCCGGGCGTGGTGGCGCGCGCCTGTAATCCCAGCTACTCGGGAGGCTGAGGCAGGAGAATCGCTTGAACCCGGGAGGCGGAGGTTGCAGTGAGCCGAGATCGCGCCACTGCACTCCAGCCTGGGCGACAGAGCGAGACTCCGTCTCAAAAA" :: [Word8]
      lines60 count gen = forM_ [0, 60 .. count - 1] $ \start -> do
        forM_ [start .. min count (start + 60) - 1] gen
        put 10
  puts ">ONE Homo sapiens alu\n"
  let aluLen = length alu
      aluArr = alu
  aluBuf <- mallocBytes aluLen :: IO (Ptr Word8)
  forM_ (zip [0 ..] aluArr) $ \(i, c) -> pokeByteOff aluBuf i c
  lines60 (2 * n) $ \i -> peekByteOff aluBuf (i `mod` aluLen) >>= put
  free aluBuf
  seed <- newIORef (42 :: Int)
  let random chars probs count = do
        let cum = scanl1 (+) probs :: [Double]
            pick r = go (zip chars cum)
              where go [(c, _)] = c
                    go ((c, p) : rest) = if r >= p then go rest else c
                    go [] = error "empty"
        lines60 count $ \_ -> do
          s <- readIORef seed
          let s' = (s * 3877 + 29573) `mod` 139968
          writeIORef seed s'
          put (fromIntegral (ord (pick (fromIntegral s' / 139968.0))))
  puts ">TWO IUB ambiguity codes\n"
  random "acgtBDHKMNRSVWY" [0.27, 0.12, 0.12, 0.27, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02] (3 * n)
  puts ">THREE Homo sapiens frequency\n"
  random "acgt" [0.3029549426680, 0.1979883004921, 0.1975473066391, 0.3015094502008] (5 * n)
  p <- readIORef pos
  return (buf, p)

setup :: Int32 -> IO ()
setup n = do
  (old, _) <- readIORef inputRef
  when (old /= nullPtr) (free old)
  fasta (fromIntegral n) >>= writeIORef inputRef

fnv :: Word32 -> String -> Word32
fnv = foldl (\h c -> (h `xor` fromIntegral (ord c)) * 16777619)

bench :: Int32 -> IO Word32
bench _ = do
  input <- readIORef inputRef
  out <- run input
  let !h = fnv 2166136261 out
  return h

foreign export ccall setup :: Int32 -> IO ()
foreign export ccall bench :: Int32 -> IO Word32
