export function registerIrStructureTests({ test, assertThrows }) {
  test('debug assertions: structural validator rejects malformed literal children', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const doc = compiler.parseSource(`export lib { fn answer() I32 { 42; } }`);
    doc.querySelector('ir-lit').appendChild(doc.createElement('ir-ident'));
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test' }),
      'ir-lit must not have element children',
    );
  });

  test('debug assertions: structural validator rejects malformed call shape', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const doc = compiler.parseSource(`export lib { fn caller() I32 { 1; } }`);
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
    const doc = compiler.parseSource(`export lib { fn answer(a: I32) I32 { a; } }`);
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test', requireBindings: true }),
      'ir-ident must have data-binding-id',
    );
  });

  test('debug assertions: structural validator rejects unresolved data-type-name', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const doc = compiler.parseSource(`export lib { fn answer() I32 { 42; } }`);
    const typeIndex = linkTypeDecls(doc);
    doc.querySelector('ir-lit').dataset['typeName'] = 'NoSuchType';
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test', typeIndex }),
      'data-type-name "NoSuchType" does not resolve',
    );
  });

  test('debug assertions: structural validator rejects scalar intrinsic arity mismatch', async ({ compiler }) => {
    const { validateIrStructure } = await import('../src/compiler/validate-ir-structure.js');
    const { linkTypeDecls } = await import('../src/compiler/link-type-decls.js');
    const doc = compiler.parseSource(`export lib { fn answer() I32 { 1; } }`);
    const typeDef = doc.createElement('ir-type-def');
    const scalar = doc.createElement('ir-wasm-scalar');
    const op = doc.createElement('ir-i32-clz');
    typeDef.setAttribute('name', 'I32');
    typeDef.dataset.sourceFile = '<test>';
    typeDef.dataset.row = '1';
    typeDef.dataset.col = '1';
    typeDef.dataset.endRow = '1';
    typeDef.dataset.endCol = '1';
    scalar.dataset.sourceFile = '<test>';
    scalar.dataset.row = '1';
    scalar.dataset.col = '1';
    scalar.dataset.endRow = '1';
    scalar.dataset.endCol = '1';
    scalar.setAttribute('type-repr', 'wasm-i32');
    typeDef.appendChild(scalar);
    op.dataset.sourceFile = '<test>';
    op.dataset.row = '1';
    op.dataset.col = '1';
    op.dataset.endRow = '1';
    op.dataset.endCol = '1';
    const badA = doc.createElement('ir-ident');
    badA.dataset.sourceFile = '<test>';
    badA.dataset.row = '1';
    badA.dataset.col = '1';
    badA.dataset.endRow = '1';
    badA.dataset.endCol = '1';
    const badB = doc.createElement('ir-ident');
    badB.dataset.sourceFile = '<test>';
    badB.dataset.row = '1';
    badB.dataset.col = '1';
    badB.dataset.endRow = '1';
    badB.dataset.endCol = '1';
    op.appendChild(badA);
    op.appendChild(badB);
    doc.body.firstChild.appendChild(typeDef);
    doc.body.firstChild.appendChild(op);
    assertThrows(
      () => validateIrStructure(doc, { phase: 'test', typeIndex: linkTypeDecls(doc) }),
      '<ir-i32-clz> expects 1 operand children, got 2',
    );
  });
}
