const PRELUDE = `
  struct Point:
    | x : I32
    | y : I32
  struct Label:
    | text : Str
  fn add(a: I32, b: I32) I32 { return a + b; }
  fn takes_bool(b: Bool) Bool { return b; }
`;

export const negativeDiagnosticCases = [
  ['undefined local', `lib { fn bad() I32 { return missing; } }`, 'unknown-variable', 'Unknown variable missing'],
  ['undefined rhs in let', `lib { fn bad() I32 { let x: I32 = missing; return x; } }`, 'unknown-variable', 'Unknown variable missing'],
  ['undefined rhs in assign', `lib { fn bad() I32 { let x: I32 = 0; x = missing; return x; } }`, 'unknown-variable', 'Unknown variable missing'],
  ['unknown type in param', `lib { fn bad(x: Nope) I32 { return 0; } }`, 'unknown-type', 'Unknown type Nope'],
  ['unknown type in return', `lib { fn bad() Nope { return 0; } }`, 'unknown-type', 'Unknown type Nope'],
  ['unknown type in struct field', `struct Box:
  | value : Nope
lib { fn bad() I32 { return 0; } }`, 'unknown-type', 'Unknown type Nope'],
  ['unknown field', `${PRELUDE} lib { fn bad(p: Point) I32 { return p.z; } }`, 'unknown-field', 'Point has no field z'],
  ['unknown method', `${PRELUDE} lib { fn bad(p: Point) I32 { return p.len(); } }`, 'unknown-method', 'No method Point.len'],
  ['data field is not callable method', `${PRELUDE} lib { fn bad(p: Point) I32 { return p.y(); } }`, 'unknown-method', 'No method Point.y'],
  ['unknown static method', `${PRELUDE} lib { fn bad() I32 { return Point.origin(); } }`, 'unknown-method', 'No method Point.origin'],
  ['free call too few args', `${PRELUDE} lib { fn bad() I32 { return add(1); } }`, 'wrong-arity', 'add takes 2, given 1'],
  ['free call too many args', `${PRELUDE} lib { fn bad() I32 { return add(1, 2, 3); } }`, 'wrong-arity', 'add takes 2, given 3'],
  ['static call too few args', `fn Box.make(a: I32, b: I32) I32 { return a + b; }
lib { fn bad() I32 { return Box.make(1); } }`, 'wrong-arity', 'Takes 2, given 1'],
  ['call arg type mismatch', `${PRELUDE} lib { fn bad() I32 { return add(true, 1); } }`, 'type-mismatch', 'add takes I32, got Bool'],
  ['second call arg type mismatch', `${PRELUDE} lib { fn bad() I32 { return add(1, false); } }`, 'type-mismatch', 'add takes I32, got Bool'],
  ['Bool call arg type mismatch', `${PRELUDE} lib { fn bad() Bool { return takes_bool(1); } }`, 'type-mismatch', 'takes_bool takes Bool, got I32'],
  ['let type mismatch', `lib { fn bad() I32 { let x: I32 = true; return x; } }`, 'type-mismatch', 'x is I32, got Bool'],
  ['global type mismatch', `let x: I32 = true;
lib { fn bad() I32 { return x; } }`, 'type-mismatch', 'x is I32, got Bool'],
  ['return type mismatch', `lib { fn bad() I32 { return true; } }`, 'type-mismatch', 'bad returns I32, got Bool'],
  ['if condition type mismatch', `lib { fn bad() I32 { return if 1 { 2; } else { 3; }; } }`, 'type-mismatch', 'Condition is I32, not Bool'],
  ['while condition type mismatch', `lib { fn bad() I32 { let x: I32 = 0; while (1) { x = x + 1; }; return x; } }`, 'type-mismatch', 'Condition is I32, not Bool'],
  ['if branch type mismatch', `lib { fn bad() I32 { return if true { 1; } else { false; }; } }`, 'type-mismatch', 'Expected I32, got Bool'],
  ['match arm type mismatch', `lib { fn bad(x: I32) I32 { return match x { 0 => 1, 1 => false, ~> 2, }; } }`, 'type-mismatch', 'Expected I32, got Bool'],
  ['enum alt missing variant', `enum Shape:
  | Circle { radius: I32 }
  | Rect { width: I32 }
lib {
  fn bad(s: Shape) I32 {
    return alt s {
      Circle => 1,
    };
  }
}`, 'non-exhaustive-match', 'alt misses Shape.Rect'],
  ['integer match missing default', `lib { fn bad(x: I32) I32 { return match x { 0 => 1, 1 => 2, }; } }`, 'non-exhaustive-match', 'match over I32 needs a default arm'],
  ['Bool match missing arm', `lib { fn bad(flag: Bool) I32 { return match flag { true => 1, }; } }`, 'non-exhaustive-match', 'match misses false'],
  ['orelse receiver must be nullable', `lib { fn bad() I32 { return 1 orelse 2; } }`, 'type-mismatch', 'Expected nullable, got I32'],
  ['orelse fallback type mismatch', `${PRELUDE} lib { fn bad(p: ?Point) Point { return p orelse false; } }`, 'type-mismatch', 'Expected Point, got Bool'],
  ['assign type mismatch', `lib { fn bad() I32 { let x: I32 = 0; x = true; return x; } }`, 'type-mismatch', 'x is I32, got Bool'],
  ['downstream errors fold under their cause', `lib { fn bad() Void { let a = 1 + "x"; let b: F64 = a; let c: Str = a; } }`, 'type-mismatch', 'No + for I32 and Str'],
  ['field assign type mismatch', `${PRELUDE} lib { fn bad(p: Point) I32 { p.x = false; return p.x; } }`, 'type-mismatch', 'Field x is I32, got Bool'],
  ['struct init missing field', `${PRELUDE} lib { fn bad() Point { return Point { x: 1 }; } }`, 'missing-field', 'Point needs a value for y'],
  ['struct init duplicate field', `${PRELUDE} lib { fn bad() Point { return Point { x: 1, x: 2, y: 3 }; } }`, 'duplicate-field', 'Duplicate field x'],
  ['struct init field type mismatch', `${PRELUDE} lib { fn bad() Point { return Point { x: true, y: 3 }; } }`, 'type-mismatch', 'Field x is I32, got Bool'],
  ['nullable field without promote', `${PRELUDE} lib { fn bad(p: ?Point) I32 { return p.x; } }`, 'nullable-access', '.x on nullable ?Point'],
  ['nullable method without promote', `struct Box:
  | x : I32
fn Box.get |b| () I32 { return b.x; }
lib { fn bad(b: ?Box) I32 { return b.get(); } }`, 'nullable-access', '.get on nullable ?Box'],
  ['assign es global immutable', `let g: I32 = @es/\\1\\/;
lib { fn bad() I32 { g = 2; return g; } }`, 'assignment-to-immutable', 'g is immutable'],
  ['assign function immutable', `fn f() I32 { return 1; }
lib { fn bad() I32 { f = 2; return 0; } }`, 'assignment-to-immutable', 'f is immutable'],
  ['es dsl requires typed binding', `lib { fn bad() I32 { return @es/\\41\\/; } }`, 'invalid-dsl-usage', '@es needs a typed let'],
  ['invalid assignment target parse error', `lib { fn bad() I32 { let x: I32 = 1; (x + 1) = 2; x; } }`, 'parse-error', "Expected ';', got '='"],
  ['direct recursive struct', `struct Node:
  | next : Node
lib { fn bad() I32 { return 0; } }`, 'recursive-type', 'Node contains itself; make the field nullable'],
  ['indirect recursive struct', `struct A:
  | b : B
struct B:
  | a : A
lib { fn bad() I32 { return 0; } }`, 'recursive-type', 'A contains itself; make the field nullable'],
  ['nullable recursive struct is allowed except missing init field', `struct Node:
  | next : ?Node
lib { fn bad() Node { return Node { }; } }`, 'missing-field', 'Node needs a value for next'],
  ['module function called as a method', `lib { fn bad(x: F64) F64 { return x.sqrt(); } }`, 'unknown-method', 'F64.sqrt is a function, not a method: F64.sqrt(value)'],
  ['nominal Externref types do not mix', `mod Document { type & = @ir/\\ <ir-wasm-ref type-repr="wasm-externref"/> \\/ }
mod Element { type & = @ir/\\ <ir-wasm-ref type-repr="wasm-externref"/> \\/ }
lib { fn bad(element: Element) Document { let doc: Document = element; return doc; } }`, 'type-mismatch', 'doc is Document, got Element'],
  ['cl never decays to fun', `lib { fn bad() I32 { let g: fun(I32) I32 = cl(x) { return x * 2; }; return 1; } }`, 'type-mismatch', 'g is fun(I32) I32, got cl(I32) I32'],
  ['an int literal does not adopt Bool', `lib { fn bad() Bool { let b: Bool = 1; return b; } }`, 'type-mismatch', 'b is Bool, got I32'],
  ['break outside a loop', `lib { fn run() I32 { break; return 1; } }`, 'invalid-break', 'break outside a loop'],
];
