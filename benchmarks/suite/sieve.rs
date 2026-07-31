#![no_std]

use core::ptr::addr_of_mut;

const CAPACITY: usize = 1_000_000;
static mut FLAGS: [u8; CAPACITY] = [0; CAPACITY];

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! { loop {} }

#[unsafe(no_mangle)]
pub extern "C" fn run(n: i32) -> i32 {
    let n = (n.max(0) as usize).min(CAPACITY);
    let flags = unsafe { core::slice::from_raw_parts_mut(addr_of_mut!(FLAGS).cast::<u8>(), n) };
    flags.fill(1);
    if n > 0 { flags[0] = 0; }
    if n > 1 { flags[1] = 0; }
    let mut p = 2usize;
    while p * p < n {
        if flags[p] != 0 {
            let mut j = p * p;
            while j < n {
                flags[j] = 0;
                j += p;
            }
        }
        p += 1;
    }
    flags.iter().map(|&value| value as i32).sum()
}
