#![no_std]

use core::ptr::{addr_of, addr_of_mut, copy, copy_nonoverlapping};

const BASE_CAPACITY: usize = 131_072;
const PIECE_CAPACITY: usize = 4096;
const OUTPUT_CAPACITY: usize = 262_144;
static mut BASE: [u8; BASE_CAPACITY] = [0; BASE_CAPACITY];
static mut PIECE: [u8; PIECE_CAPACITY] = [0; PIECE_CAPACITY];
static mut OUTPUT: [u8; OUTPUT_CAPACITY] = [0; OUTPUT_CAPACITY];

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! { loop {} }

#[unsafe(no_mangle)]
pub extern "C" fn base_ptr() -> i32 {
    addr_of_mut!(BASE).cast::<u8>() as usize as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn piece_ptr() -> i32 {
    addr_of_mut!(PIECE).cast::<u8>() as usize as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn run(base_len: i32, piece_len: i32, repeats: i32) -> i64 {
    let base_len = (base_len.max(0) as usize).min(BASE_CAPACITY);
    let piece_len = (piece_len.max(0) as usize).min(PIECE_CAPACITY);
    let count = repeats.max(0) as usize;
    unsafe {
        let base = addr_of!(BASE).cast::<u8>();
        let piece = addr_of!(PIECE).cast::<u8>();
        let output = addr_of_mut!(OUTPUT).cast::<u8>();
        copy_nonoverlapping(base, output, base_len);
        let mut len = base_len;
        let mut iteration = 0usize;
        while iteration < count && len + piece_len <= OUTPUT_CAPACITY {
            let middle = len / 2;
            copy(output.add(middle), output.add(middle + piece_len), len - middle);
            copy_nonoverlapping(piece, output.add(middle), piece_len);
            len += piece_len;
            iteration += 1;
        }
        ((output as usize as i64) << 32) | len as i64
    }
}
