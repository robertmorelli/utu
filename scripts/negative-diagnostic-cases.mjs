const PRELUDE = `
  struct Point:
    | x : I32
    | y : I32
  struct Label:
    | text : Str
  fn add(a: I32, b: I32) I32 { a + b; }
  fn takes_bool(b: Bool) Bool { b; }
`;

export const negativeDiagnosticCases = [
  ['undefined local', `export lib { fn bad() I32 { missing; } }`, 'unknown-variable', "Unknown variable 'missing'"],
  ['undefined rhs in let', `export lib { fn bad() I32 { let x: I32 = missing; x; } }`, 'unknown-variable', "Unknown variable 'missing'"],
  ['undefined rhs in assign', `export lib { fn bad() I32 { let x: I32 = 0; x = missing; x; } }`, 'unknown-variable', "Unknown variable 'missing'"],
  ['unknown type in param', `export lib { fn bad(x: Nope) I32 { 0; } }`, 'unknown-type', "Unknown type 'Nope'"],
  ['unknown type in return', `export lib { fn bad() Nope { 0; } }`, 'unknown-type', "Unknown type 'Nope'"],
  ['unknown type in struct field', `struct Box:\n  | value : Nope\nexport lib { fn bad() I32 { 0; } }`, 'unknown-type', "Unknown type 'Nope'"],
  ['unknown field', `${PRELUDE} export lib { fn bad(p: Point) I32 { p.z; } }`, 'unknown-field', "Unknown field 'z'"],
  ['unknown method', `${PRELUDE} export lib { fn bad(p: Point) I32 { p.len(); } }`, 'unknown-method', "Unknown method 'Point.len'"],
  ['data field is not callable method', `${PRELUDE} export lib { fn bad(p: Point) I32 { p.y(); } }`, 'unknown-method', "Unknown method 'Point.y'"],
  ['unknown static method', `${PRELUDE} export lib { fn bad() I32 { Point.origin(); } }`, 'unknown-method', "Unknown method 'Point.origin'"],
  ['free call too few args', `${PRELUDE} export lib { fn bad() I32 { add(1); } }`, 'wrong-arity', 'Wrong arity: expected 2, got 1'],
  ['free call too many args', `${PRELUDE} export lib { fn bad() I32 { add(1, 2, 3); } }`, 'wrong-arity', 'Wrong arity: expected 2, got 3'],
  ['static call too few args', `fn Box.make(a: I32, b: I32) I32 { a + b; }\nexport lib { fn bad() I32 { Box.make(1); } }`, 'wrong-arity', 'Wrong arity: expected 2, got 1'],
  ['call arg type mismatch', `${PRELUDE} export lib { fn bad() I32 { add(true, 1); } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['second call arg type mismatch', `${PRELUDE} export lib { fn bad() I32 { add(1, false); } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['Bool call arg type mismatch', `${PRELUDE} export lib { fn bad() Bool { takes_bool(1); } }`, 'type-mismatch', 'Type mismatch: expected Bool, got I32'],
  ['let type mismatch', `export lib { fn bad() I32 { let x: I32 = true; x; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['global type mismatch', `let x: I32 = true;\nexport lib { fn bad() I32 { x; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['return type mismatch', `export lib { fn bad() I32 { true; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['if condition type mismatch', `export lib { fn bad() I32 { if 1 { 2; } else { 3; }; } }`, 'type-mismatch', 'Type mismatch: expected Bool, got I32'],
  ['while condition type mismatch', `export lib { fn bad() I32 { let x: I32 = 0; while (1) { x = x + 1; }; x; } }`, 'type-mismatch', 'Type mismatch: expected Bool, got I32'],
  ['if branch type mismatch', `export lib { fn bad() I32 { if true { 1; } else { false; }; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['match arm type mismatch', `export lib { fn bad(x: I32) I32 { match x { 0 => 1, 1 => false, ~> 2, }; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['enum alt missing variant', `enum Shape:\n  | Circle { radius: I32 }\n  | Rect { width: I32 }\nexport lib {\n  fn bad(s: Shape) I32 {\n    alt s {\n      Circle => 1,\n    };\n  }\n}`, 'non-exhaustive-match', "Missing variant 'Rect' in alt over enum Shape"],
  ['integer match missing default', `export lib { fn bad(x: I32) I32 { match x { 0 => 1, 1 => 2, }; } }`, 'non-exhaustive-match', 'Match over I32 requires a default arm'],
  ['Bool match missing arm', `export lib { fn bad(flag: Bool) I32 { match flag { true => 1, }; } }`, 'non-exhaustive-match', "Missing Bool case 'false' in match"],
  ['orelse receiver must be nullable', `export lib { fn bad() I32 { 1 orelse 2; } }`, 'type-mismatch', 'Type mismatch: expected nullable, got I32'],
  ['orelse fallback type mismatch', `${PRELUDE} export lib { fn bad(p: ?Point) Point { p orelse false; } }`, 'type-mismatch', 'Type mismatch: expected Point, got Bool'],
  ['assign type mismatch', `export lib { fn bad() I32 { let x: I32 = 0; x = true; x; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['field assign type mismatch', `${PRELUDE} export lib { fn bad(p: Point) I32 { p.x = false; p.x; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['struct init missing field', `${PRELUDE} export lib { fn bad() Point { Point { x: 1 }; } }`, 'missing-field', "Missing field 'y' for Point"],
  ['struct init duplicate field', `${PRELUDE} export lib { fn bad() Point { Point { x: 1, x: 2, y: 3 }; } }`, 'duplicate-field', "Duplicate field 'x'"],
  ['struct init field type mismatch', `${PRELUDE} export lib { fn bad() Point { Point { x: true, y: 3 }; } }`, 'type-mismatch', 'Type mismatch: expected I32, got Bool'],
  ['nullable field without promote', `${PRELUDE} export lib { fn bad(p: ?Point) I32 { p.x; } }`, 'nullable-access', "Cannot access field 'x' on nullable ?Point"],
  ['nullable method without promote', `struct Box:\n  | x : I32\nfn Box.get |b| () I32 { b.x; }\nexport lib { fn bad(b: ?Box) I32 { b.get(); } }`, 'nullable-access', "Cannot access field 'get' on nullable ?Box"],
  ['assign global immutable', `let g: I32 = 1;\nexport lib { fn bad() I32 { g = 2; g; } }`, 'assignment-to-immutable', "Cannot assign to immutable 'g'"],
  ['assign function immutable', `fn f() I32 { 1; }\nexport lib { fn bad() I32 { f = 2; 0; } }`, 'assignment-to-immutable', "Cannot assign to immutable 'f'"],
  ['es dsl requires typed binding', `export lib { fn bad() I32 { @es/\\41\\/; } }`, 'invalid-dsl-usage', '@es DSL must appear on the right-hand side of a typed let binding'],
  ['invalid assignment target parse error', `export lib { fn bad() I32 { let x: I32 = 1; (x + 1) = 2; x; } }`, 'parse-error', 'Parse error'],
  ['direct recursive struct', `struct Node:\n  | next : Node\nexport lib { fn bad() I32 { 0; } }`, 'recursive-type', "Recursive type 'Node'"],
  ['indirect recursive struct', `struct A:\n  | b : B\nstruct B:\n  | a : A\nexport lib { fn bad() I32 { 0; } }`, 'recursive-type', "Recursive type 'A'"],
  ['nullable recursive struct is allowed except missing init field', `struct Node:\n  | next : ?Node\nexport lib { fn bad() Node { Node { }; } }`, 'missing-field', "Missing field 'next' for Node"],
];
