#![no_std]

use core::ptr::{addr_of, addr_of_mut};

const INPUT_CAPACITY: usize = 1_048_576;
static mut INPUT: [u8; INPUT_CAPACITY] = [0; INPUT_CAPACITY];

#[panic_handler]
fn panic(_: &core::panic::PanicInfo<'_>) -> ! { loop {} }

#[unsafe(no_mangle)]
pub extern "C" fn input_ptr() -> i32 {
    addr_of_mut!(INPUT).cast::<u8>() as usize as i32
}

fn space(c: u8) -> bool { matches!(c, 32 | 9 | 10 | 13) }
fn digit(c: u8) -> bool { c.is_ascii_digit() }
fn alpha(c: u8) -> bool { c.is_ascii_alphabetic() || c == b'_' }
fn word(c: u8) -> bool { alpha(c) || digit(c) }
fn mix(hash: i32, value: i32) -> i32 { (hash ^ value).wrapping_mul(16_777_619) }

fn hash_forward(text: &[u8]) -> i32 {
    let mut hash = 305_419_896i32;
    for &c in text { hash = mix(hash, c as i32); }
    hash
}
fn hash_stride(text: &[u8]) -> i32 {
    let mut hash = 18_652_613i32;
    let mut i = 0usize;
    while i < text.len() {
        hash = mix(hash, (text[i] as i32).wrapping_add(i as i32));
        i += 7;
    }
    hash
}
fn count_lines(text: &[u8]) -> i32 { 1 + text.iter().filter(|&&c| c == b'\n').count() as i32 }
fn count_words(text: &[u8]) -> i32 {
    let mut count = 0i32;
    let mut inside = false;
    for &c in text {
        let current = word(c);
        if current && !inside { count += 1; }
        inside = current;
    }
    count
}
fn longest_word(text: &[u8]) -> i32 {
    let mut longest = 0i32;
    let mut current = 0i32;
    for &c in text {
        if word(c) {
            current += 1;
            if current > longest { longest = current; }
        } else { current = 0; }
    }
    longest
}
fn count_numbers(text: &[u8]) -> i32 {
    let mut count = 0i32;
    let mut inside = false;
    for &c in text {
        let current = digit(c);
        if current && !inside { count += 1; }
        inside = current;
    }
    count
}
fn sum_numbers(text: &[u8]) -> i32 {
    let mut total = 0i32;
    let mut value = 0i32;
    let mut inside = false;
    for &c in text {
        if digit(c) {
            value = value.wrapping_mul(10).wrapping_add(c as i32 - 48);
            inside = true;
        } else {
            if inside { total = total.wrapping_add(value); }
            value = 0;
            inside = false;
        }
    }
    if inside { total = total.wrapping_add(value); }
    total
}
fn count_strings(text: &[u8]) -> i32 {
    let mut count = 0i32;
    let mut quoted = false;
    let mut escaped = false;
    for &c in text {
        if quoted {
            if escaped { escaped = false; }
            else {
                if c == b'\\' { escaped = true; }
                if c == b'"' { quoted = false; }
            }
        } else if c == b'"' {
            quoted = true;
            count += 1;
        }
    }
    count
}
fn count_comments(text: &[u8]) -> i32 {
    let mut count = 0i32;
    for pair in text.windows(2) {
        if pair[0] == b'/' && (pair[1] == b'/' || pair[1] == b'*') { count += 1; }
    }
    count
}
fn bracket_score(text: &[u8]) -> i32 {
    let (mut round, mut square, mut curly, mut penalty) = (0i32, 0i32, 0i32, 0i32);
    for &c in text {
        if c == b'(' { round += 1; }
        if c == b')' { round -= 1; if round < 0 { penalty += 1; round = 0; } }
        if c == b'[' { square += 1; }
        if c == b']' { square -= 1; if square < 0 { penalty += 1; square = 0; } }
        if c == b'{' { curly += 1; }
        if c == b'}' { curly -= 1; if curly < 0 { penalty += 1; curly = 0; } }
    }
    round * 3 + square * 5 + curly * 7 + penalty * 11
}
fn count_operators(text: &[u8]) -> i32 {
    text.iter().filter(|&&c| matches!(c, b'+' | b'-' | b'*' | b'/' | b'=' | b'<' | b'>')).count() as i32
}
fn count_patterns(text: &[u8]) -> i32 {
    let mut count = 0i32;
    for triple in text.windows(3) {
        let (a, b, c) = (triple[0], triple[1], triple[2]);
        if a == b'l' && b == b'e' && c == b't' { count += 3; }
        if a == b'f' && b == b'n' && space(c) { count += 5; }
        if a == b'i' && b == b'f' && space(c) { count += 7; }
        if a == b'f' && b == b'o' && c == b'r' { count += 11; }
    }
    count
}
fn histogram_score(text: &[u8]) -> i32 {
    let mut bins = [0i32; 128];
    for &c in text { bins[(c & 127) as usize] += 1; }
    let mut score = 0i32;
    for (i, &count) in bins.iter().enumerate() { score = mix(score, count + i as i32); }
    score
}
fn transition_score(text: &[u8]) -> i32 {
    let mut score = 0i32;
    let mut previous = 0i32;
    for (i, &byte) in text.iter().enumerate() {
        let c = byte as i32;
        score = score.wrapping_add((previous ^ c).wrapping_mul((i as i32) & 15));
        previous = c;
    }
    score
}

struct Report {
    hash: i32, stride_hash: i32, lines: i32, words: i32, longest: i32,
    numbers: i32, number_sum: i32, strings: i32, comments: i32, brackets: i32,
    operators: i32, patterns: i32, histogram: i32, transitions: i32,
}
fn finish(report: Report) -> i32 {
    let mut result = report.hash;
    for value in [report.stride_hash, report.lines, report.words, report.longest,
        report.numbers, report.number_sum, report.strings, report.comments,
        report.brackets, report.operators, report.patterns, report.histogram,
        report.transitions] { result = mix(result, value); }
    result
}

#[unsafe(no_mangle)]
pub extern "C" fn run(length: i32) -> i32 {
    let length = (length.max(0) as usize).min(INPUT_CAPACITY);
    let text = unsafe { core::slice::from_raw_parts(addr_of!(INPUT).cast::<u8>(), length) };
    finish(Report {
        hash: hash_forward(text), stride_hash: hash_stride(text), lines: count_lines(text),
        words: count_words(text), longest: longest_word(text), numbers: count_numbers(text),
        number_sum: sum_numbers(text), strings: count_strings(text), comments: count_comments(text),
        brackets: bracket_score(text), operators: count_operators(text), patterns: count_patterns(text),
        histogram: histogram_score(text), transitions: transition_score(text),
    })
}
