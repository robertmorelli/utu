# Runtime and CLI-misuse errors

The `.utu` files here compile and then go wrong when run (`utu run FILE`, or
`utu test FILE` for 40–48). The cases below are misuses of the CLI itself, so
they are shell commands, not programs. Run them from the repository root.
`R=examples/error_demo/runtime`.

Every usage error prints the same 17-line usage text, to stdout. It is shown
once here and written `<usage>` after that.

## No arguments / --help

    $ node cli/utu.mjs
    stdout: <usage>    (usage: utu <command> <file.utu> [options] ... stage 0's IR and graphs)
    exit 0

`--help` and `-h` print the same, exit 0. Bare `utu` is a misuse but exits 0.

## Unknown command

    $ node cli/utu.mjs frobnicate $R/56_main_void_ok.utu
    stderr: unknown command: frobnicate
    stdout: <usage>
    exit 1

    $ node cli/utu.mjs runn $R/56_main_void_ok.utu        # a typo of run
    stderr: unknown command: runn
    stdout: <usage>
    exit 1                                                 # no "did you mean run?"

    $ node cli/utu.mjs $R/56_main_void_ok.utu              # forgot the command
    stderr: unknown command: examples/error_demo/runtime/56_main_void_ok.utu
    stdout: <usage>
    exit 1

## Missing file argument

    $ node cli/utu.mjs run
    stderr: missing file
    stdout: <usage>
    exit 1

## File that does not exist

    $ node cli/utu.mjs run $R/does_not_exist.utu
    stderr: examples/error_demo/runtime/does_not_exist.utu: file not found
    exit 1

## A directory instead of a file

    $ node cli/utu.mjs run $R               # also $R/57_a_directory.utu, a directory named like a file
    stderr: Error: EISDIR: illegal operation on a directory, read
                at Object.readFileSync (node:fs:436:20)
                at Object.readFile (.../src/selfhost/node.js:140:32)
                at readFile (.../src/selfhost/compiler.js:83:54)
                at loadProgram (.../src/selfhost/compiler.js:90:43)
                at compile (.../src/selfhost/compiler.js:57:23)
                at compileFile (.../src/selfhost/node.js:155:10)
                at buildOrExit (.../cli/utu.mjs:73:24)
                at Object.run (.../cli/utu.mjs:98:32)
                at main (.../cli/utu.mjs:56:26)
    exit 1

## Options before the file

    $ node cli/utu.mjs run -O fast $R/56_main_void_ok.utu
    stdout: 42
    exit 0                                                 # options go anywhere

## Bad -O flag (and other unknown flags)

    $ node cli/utu.mjs run $R/56_main_void_ok.utu -O9      # also -O2, -O, --fast
    stdout: 42
    exit 0                                                 # silently ignored: built at -Oz

## Extra file argument

    $ node cli/utu.mjs check $R/56_main_void_ok.utu extra_arg.utu
    stderr: ERROR  Extra argument extra_arg.utu
    exit 1

    $ node cli/utu.mjs run $R/56_main_void_ok.utu -o out
    stderr: ERROR  -o is only for build and build-exe
    exit 1

## Not a utu file

    $ node cli/utu.mjs check package.json
    stderr: package.json:1:1: error: Syntax error: unexpected '{'
             1 | {
               | ^
    exit 1

    $ node cli/utu.mjs check /usr/bin/true
    stderr: /usr/bin/true:1:1: error: Syntax error: unexpected character '\xcf'
             1 | <several KB of binary dumped to the terminal>
    exit 1

## Empty file

    $ : > empty.utu
    $ node cli/utu.mjs check empty.utu     -> stdout: ok, exit 0
    $ node cli/utu.mjs run empty.utu       -> stderr: empty.utu: no `export main`, exit 1

## run on a file without export main

    $ node cli/utu.mjs run $R/50_no_main.utu               # has `export lib { ... }`
    stderr: examples/error_demo/runtime/50_no_main.utu: no `export main`
    exit 1

    $ node cli/utu.mjs run $R/51_main_not_exported.utu     # `fn main() I32`, no export
    stderr: examples/error_demo/runtime/51_main_not_exported.utu: no `export main`
    exit 1

`check` says `ok` (exit 0) for both.

## test on a file with no tests

    $ node cli/utu.mjs test $R/56_main_void_ok.utu
    stdout: 0 passed, 0 failed
    exit 0

## build: output directory not writable

    $ mkdir ro && chmod 555 ro
    $ node cli/utu.mjs build $R/56_main_void_ok.utu -o ro
    stderr: ✘ [ERROR] Failed to write to output file: open .../ro/56_main_void_ok.mjs: permission denied

            Error: Build failed with 1 error:
            error: Failed to write to output file: open .../ro/56_main_void_ok.mjs: permission denied
                at failureErrorWithLog (.../node_modules/esbuild/lib/main.js:1748:15)
                ... 10 more esbuild/node frames
    exit 1

## build: output directory cannot be created

    $ node cli/utu.mjs build $R/56_main_void_ok.utu -o /nonexistent_root_dir/out
    stderr: Error: ENOENT: no such file or directory, mkdir '/nonexistent_root_dir'
                at async Object.mkdir (node:internal/fs/promises:856:10)
                at async Object.build (.../cli/utu.mjs:132:3)
                at async main (.../cli/utu.mjs:56:3)
    exit 1

## build: -o names an existing file

    $ node cli/utu.mjs build $R/56_main_void_ok.utu -o $R/56_main_void_ok.utu
    stderr: Error: EEXIST: file already exists, mkdir '/Users/.../56_main_void_ok.utu'
                at async Object.mkdir (node:internal/fs/promises:856:10)
                at async Object.build (.../cli/utu.mjs:132:3)
                at async main (.../cli/utu.mjs:56:3)
    exit 1

## build: -o with no value

    $ node cli/utu.mjs build $R/56_main_void_ok.utu -o
    stderr: ERROR  -o needs a directory
    exit 1

## check on a file with several errors

    $ node cli/utu.mjs check $R/53_multiple_errors_check.utu
    stderr: three diagnostics in file order (6:18 type mismatch, 7:20 type mismatch,
            8:5 Unknown variable 'missing_function'), each with a code frame
    exit 1                                                 # no "3 errors" summary line

## A syntax error passed to run

    $ node cli/utu.mjs run $R/52_syntax_error_run.utu
    stderr: examples/error_demo/runtime/52_syntax_error_run.utu:5:5: error: Syntax error: expected ';', got 'x'
             4 |     let x = 40
             5 |     x + 2;
               |     ^
    exit 1
