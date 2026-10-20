{-# LANGUAGE BangPatterns #-}
-- | N-body, the Jovian-planets simulation of the Computer Language Benchmarks
-- Game, as Are We Fast Yet's NBody has it, in Haskell, after
-- ../rust/src/lib.rs: five bodies of seven mutable f64 fields in an array,
-- a symplectic-Euler step that updates each pair once, and the system's
-- energy. Every port runs the same floating-point operations in the same
-- order, so their checksums agree bit for bit.
--
-- A body's fields are unboxed 'Double's in a bounds-checked 'IOUArray',
-- indexed by the field names below (Haskell has no unboxed mutable record
-- fields); the five bodies sit in an immutable boxed 'Array'.
module NBody () where

import Control.Monad (forM_, replicateM_)
import Data.Array (Array, bounds, listArray, (!))
import Data.Array.IO (IOUArray, newListArray, readArray, writeArray)
import Data.Int (Int32, Int64)

piD, solarMass, daysPerYear :: Double
piD = 3.141592653589793
solarMass = 4.0 * piD * piD
daysPerYear = 365.24

-- | A body: x, y, z, vx, vy, vz, mass.
newtype Body = Body (IOUArray Int Double)

x, y, z, vx, vy, vz, mass :: Int
x = 0
y = 1
z = 2
vx = 3
vy = 4
vz = 5
mass = 6

get :: Body -> Int -> IO Double
get (Body fields) = readArray fields

set :: Body -> Int -> Double -> IO ()
set (Body fields) = writeArray fields

newBody :: Double -> Double -> Double -> Double -> Double -> Double -> Double -> IO Body
newBody bx by bz bvx bvy bvz bmass =
  Body
    <$> newListArray
      (0, 6)
      [bx, by, bz, bvx * daysPerYear, bvy * daysPerYear, bvz * daysPerYear, bmass * solarMass]

offsetMomentum :: Body -> Double -> Double -> Double -> IO ()
offsetMomentum b px py pz = do
  set b vx (0.0 - px / solarMass)
  set b vy (0.0 - py / solarMass)
  set b vz (0.0 - pz / solarMass)

jupiter, saturn, uranus, neptune, sun :: IO Body
jupiter =
  newBody
    4.84143144246472090e+00
    (-1.16032004402742839e+00)
    (-1.03622044471123109e-01)
    1.66007664274403694e-03
    7.69901118419740425e-03
    (-6.90460016972063023e-05)
    9.54791938424326609e-04
saturn =
  newBody
    8.34336671824457987e+00
    4.12479856412430479e+00
    (-4.03523417114321381e-01)
    (-2.76742510726862411e-03)
    4.99852801234917238e-03
    2.30417297573763929e-05
    2.85885980666130812e-04
uranus =
  newBody
    1.28943695621391310e+01
    (-1.51111514016986312e+01)
    (-2.23307578892655734e-01)
    2.96460137564761618e-03
    2.37847173959480950e-03
    (-2.96589568540237556e-05)
    4.36624404335156298e-05
neptune =
  newBody
    1.53796971148509165e+01
    (-2.59193146099879641e+01)
    1.79258772950371181e-01
    2.68067772490389322e-03
    1.62824170038242295e-03
    (-9.51592254519715870e-05)
    5.15138902046611451e-05
sun = newBody 0.0 0.0 0.0 0.0 0.0 0.0 1.0

-- | The five bodies, with the Sun's velocity set so the total momentum is
-- zero.
createBodies :: IO (Array Int Body)
createBodies = do
  bs <- sequence [sun, jupiter, saturn, uranus, neptune]
  let bodies = listArray (0, length bs - 1) bs
      go [] !px !py !pz = pure (px, py, pz)
      go (b : rest) !px !py !pz = do
        m <- get b mass
        bvx <- get b vx
        bvy <- get b vy
        bvz <- get b vz
        go rest (px + bvx * m) (py + bvy * m) (pz + bvz * m)
  (px, py, pz) <- go bs 0.0 0.0 0.0
  offsetMomentum (bodies ! 0) px py pz
  pure bodies

advance :: Array Int Body -> Double -> IO ()
advance bodies dt = do
  let n = rangeSize' (bounds bodies)
  forM_ [0 .. n - 1] $ \i -> do
    let ib = bodies ! i
    forM_ [i + 1 .. n - 1] $ \j -> do
      let jb = bodies ! j
      ix <- get ib x
      iy <- get ib y
      iz <- get ib z
      jx <- get jb x
      jy <- get jb y
      jz <- get jb z
      let dx = ix - jx
          dy = iy - jy
          dz = iz - jz
          dSquared = dx * dx + dy * dy + dz * dz
          distance = sqrt dSquared
          mag = dt / (dSquared * distance)
      jm <- get jb mass
      get ib vx >>= \v -> set ib vx (v - dx * jm * mag)
      get ib vy >>= \v -> set ib vy (v - dy * jm * mag)
      get ib vz >>= \v -> set ib vz (v - dz * jm * mag)
      im <- get ib mass
      get jb vx >>= \v -> set jb vx (v + dx * im * mag)
      get jb vy >>= \v -> set jb vy (v + dy * im * mag)
      get jb vz >>= \v -> set jb vz (v + dz * im * mag)
  forM_ [0 .. n - 1] $ \i -> do
    let b = bodies ! i
    bvx <- get b vx
    get b x >>= \p -> set b x (p + dt * bvx)
    bvy <- get b vy
    get b y >>= \p -> set b y (p + dt * bvy)
    bvz <- get b vz
    get b z >>= \p -> set b z (p + dt * bvz)

energy :: Array Int Body -> IO Double
energy bodies = do
  let n = rangeSize' (bounds bodies)
      outer !i !e
        | i == n = pure e
        | otherwise = do
            let ib = bodies ! i
            im <- get ib mass
            ivx <- get ib vx
            ivy <- get ib vy
            ivz <- get ib vz
            let e' = e + 0.5 * im * (ivx * ivx + ivy * ivy + ivz * ivz)
                inner !j !acc
                  | j == n = pure acc
                  | otherwise = do
                      let jb = bodies ! j
                      ix <- get ib x
                      iy <- get ib y
                      iz <- get ib z
                      jx <- get jb x
                      jy <- get jb y
                      jz <- get jb z
                      let dx = ix - jx
                          dy = iy - jy
                          dz = iz - jz
                          distance = sqrt (dx * dx + dy * dy + dz * dz)
                      jm <- get jb mass
                      inner (j + 1) (acc - im * jm / distance)
            inner (i + 1) e' >>= outer (i + 1)
  outer 0 0.0

rangeSize' :: (Int, Int) -> Int
rangeSize' (lo, hi) = hi - lo + 1

-- | One run: a fresh system advanced the given number of steps; its energy
-- in nano-units, rounded half up.
run :: Int -> IO Int64
run steps = do
  bodies <- createBodies
  replicateM_ steps (advance bodies 0.01)
  e <- energy bodies
  pure (floor (e * 1.0e9 + 0.5))

bench :: Int32 -> IO Int64
bench iterations = go 0 0
  where
    go :: Int32 -> Int64 -> IO Int64
    go !i !acc
      | i >= iterations = pure acc
      | otherwise = do
          r <- run 20000
          go (i + 1) (acc + r)

foreign export ccall bench :: Int32 -> IO Int64
