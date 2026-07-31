#![no_std]
#![forbid(unsafe_code)]

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! { loop {} }

pub extern "C" fn run(n: i32) -> i32 {
    let mut i = 0i32;
    let mut x = 305_419_896i32;
    while i < n {
        x = x.wrapping_add(i);
        x ^= x << 13;
        x ^= x >> 17;
        i = i.wrapping_add(1);
    }
    x
}

#[used]
static KEEP_RUN: extern "C" fn(i32) -> i32 = run;
