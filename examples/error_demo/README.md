# Error and blame-chain demos

These programs are **intentionally invalid**. Open them in VS Code to exercise
UTU diagnostics, rich hovers, and **UTU: Open Semantic X-Ray**.

| file | expected behavior |
|---|---|
| `01_argument_blame.utu` | argument use connects its actual local declaration to the parameter imposing `I64` |
| `02_return_blame.utu` | returned `Bool` connects the local declaration to the function's `I32` return annotation |
| `03_branch_confluence.utu` | incompatible branches connect the first branch's `I32` authority to the later `Bool` branch |
| `04_field_assignment_blame.utu` | assigned value connects its `Bool` declaration to the field's `I32` declaration |
| `05_whole_file_recovery.utu` | three independent type mismatches and one unknown name are reported together without cascades |

For the clearest demo, hover the underlined expression and open Semantic X-Ray.
The examples conformance suite intentionally excludes this directory because
its purpose is to contain compiler errors.
