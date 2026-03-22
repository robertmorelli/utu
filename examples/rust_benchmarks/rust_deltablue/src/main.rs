use std::hint::black_box;

fn main() {
    let mut args = std::env::args().skip(1);
    let Some(case) = args.next() else {
        usage();
        std::process::exit(1);
    };
    let Some(iterations_arg) = args.next() else {
        usage();
        std::process::exit(1);
    };
    let iterations: i32 = match iterations_arg.parse() {
        Ok(value) if value > 0 => value,
        _ => {
            usage();
            std::process::exit(1);
        }
    };

    let result = match case.as_str() {
        "chain" => rust_deltablue::bench_chain(iterations),
        "projection" => rust_deltablue::bench_projection(iterations),
        "check" => rust_deltablue::run_check(),
        _ => {
            usage();
            std::process::exit(1);
        }
    };

    black_box(result);
}

fn usage() {
    eprintln!("Usage: rust_deltablue <chain|projection|check> <iterations>");
}
