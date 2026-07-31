#![no_std]
#![forbid(unsafe_code)]

use core::sync::atomic::AtomicU8;
use core::sync::atomic::Ordering;

const BASE_CAPACITY: usize = 131_072;
const PIECE_CAPACITY: usize = 4096;
const OUTPUT_CAPACITY: usize = 262_144;
static BASE: [AtomicU8; BASE_CAPACITY] = [const { AtomicU8::new(0) }; BASE_CAPACITY];
static PIECE: [AtomicU8; PIECE_CAPACITY] = [const { AtomicU8::new(0) }; PIECE_CAPACITY];
static OUTPUT: [AtomicU8; OUTPUT_CAPACITY] = [const { AtomicU8::new(0) }; OUTPUT_CAPACITY];

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! { loop {} }

pub extern "C" fn base_ptr() -> i32 { BASE.as_ptr() as usize as i32 }
pub extern "C" fn piece_ptr() -> i32 { PIECE.as_ptr() as usize as i32 }

pub extern "C" fn run(base_len: i32, piece_len: i32, repeats: i32) -> i64 {
    let base_len = (base_len.max(0) as usize).min(BASE_CAPACITY);
    let piece_len = (piece_len.max(0) as usize).min(PIECE_CAPACITY);
    let count = repeats.max(0) as usize;
    for (target, source) in OUTPUT[..base_len].iter().zip(BASE[..base_len].iter()) {
        target.store(source.load(Ordering::Relaxed), Ordering::Relaxed);
    }
    let mut piece = [0u8; PIECE_CAPACITY];
    for (target, source) in piece[..piece_len].iter_mut().zip(PIECE[..piece_len].iter()) {
        *target = source.load(Ordering::Relaxed);
    }
    let mut len = base_len;
    let mut iteration = 0usize;
    while iteration < count && len + piece_len <= OUTPUT_CAPACITY {
        let middle = len / 2;
        let mut source = len;
        while source > middle {
            source -= 1;
            let value = OUTPUT[source].load(Ordering::Relaxed);
            OUTPUT[source + piece_len].store(value, Ordering::Relaxed);
        }
        for (target, &value) in OUTPUT[middle..middle + piece_len].iter().zip(piece[..piece_len].iter()) {
            target.store(value, Ordering::Relaxed);
        }
        len += piece_len;
        iteration += 1;
    }
    ((OUTPUT.as_ptr() as usize as i64) << 32) | len as i64
}

#[used]
static KEEP_BASE_PTR: extern "C" fn() -> i32 = base_ptr;
#[used]
static KEEP_PIECE_PTR: extern "C" fn() -> i32 = piece_ptr;
#[used]
static KEEP_RUN: extern "C" fn(i32, i32, i32) -> i64 = run;
