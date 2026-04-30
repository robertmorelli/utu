export function registerIrStructureTests({ test, assertThrows }) {
  test('debug assertions: structural validator rejects malformed literal children', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const doc = compiler.parseSource(`export lib { fn answer() i32 { 42; } }`);
    doc.querySelector('ir-lit').appendChild(doc.createElement('ir-ident'));
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test' }),
      'ir-lit must not have element children',
    );
  });

  test('debug assertions: structural validator rejects malformed call shape', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const doc = compiler.parseSource(`export lib { fn caller() i32 { 1; } }`);
    const call = doc.createElement('ir-call');
    const callee = doc.createElement('ir-ident');
    callee.dataset.bindingId = doc.querySelector('ir-fn').id;
    call.appendChild(callee);
    call.appendChild(doc.createElement('ir-arg-list'));
    call.appendChild(doc.createElement('ir-arg-list'));
    doc.body.firstChild.appendChild(call);
    assertThrows(
      () => validateIrStructure(doc, { phase: 'resolveMethods' }),
      'ir-call must have exactly callee + ir-arg-list children',
    );
  });

  test('debug assertions: structural validator rejects unbound identifiers', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const doc = compiler.parseSource(`export lib { fn answer(a: i32) i32 { a; } }`);
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test', requireBindings: true }),
      'ir-ident must have data-binding-id',
    );
  });

  test('debug assertions: structural validator rejects unresolved data-type', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const doc = compiler.parseSource(`export lib { fn answer() i32 { 42; } }`);
    const typeIndex = linkTypeDecls(doc);
    doc.querySelector('ir-lit').dataset.type = 'NoSuchType';
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test', typeIndex }),
      'data-type "NoSuchType" does not resolve',
    );
  });

  test('debug assertions: structural validator rejects scalar intrinsic arity mismatch', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const doc = compiler.parseSource(`export lib { fn answer() i32 { 1; } }`);
    const typeDef = doc.createElement('ir-type-def');
    const scalar = doc.createElement('ir-wasm-scalar');
    const op = doc.createElement('ir-i32-clz');
    typeDef.setAttribute('name', 'i32');
    scalar.setAttribute('kind', 'i32');
    typeDef.appendChild(scalar);
    op.appendChild(doc.createElement('ir-ident'));
    op.appendChild(doc.createElement('ir-ident'));
    doc.body.firstChild.appendChild(typeDef);
    doc.body.firstChild.appendChild(op);
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test', typeIndex: linkTypeDecls(doc) }),
      '<ir-i32-clz> expects 1 operand children, got 2',
    );
  });
}
