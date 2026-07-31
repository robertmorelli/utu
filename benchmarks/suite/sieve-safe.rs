#![no_std]
#![forbid(unsafe_code)]

const CAPACITY: usize = 1_000_000;

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! { loop {} }

pub extern "C" fn run(n: i32) -> i32 {
    let n = (n.max(0) as usize).min(CAPACITY);
    // Keeping the workspace in this invocation's stack frame provides exclusive
    // access without a mutable static or a raw-pointer-to-slice conversion.
    let mut flags = [0u8; CAPACITY];
    flags[..n].fill(1);
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
    flags[..n].iter().map(|&value| value as i32).sum()
}

#[used]
static KEEP_RUN: extern "C" fn(i32) -> i32 = run;
