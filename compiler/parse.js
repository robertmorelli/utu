// compiler/parse.js
//
// Converts a web-tree-sitter parse tree into a structured AST.
// Input:  a Tree object from parser.parse(source)
// Output: a plain-JS AST rooted at { kind: 'program', items: [...] }
//
// All AST nodes carry a `pos: { row, col }` field for error reporting.

export class ParseError extends Error {
    /** @param {{ message: string, pos: { row: number, col: number } }[]} errors */
    constructor(errors) {
        const lines = errors.map(e => `  ${e.message} at ${e.pos.row + 1}:${e.pos.col + 1}`);
        super(`Parse errors:\n${lines.join('\n')}`);
        this.errors = errors;
    }
}

/**
 * Parse a web-tree-sitter Tree into a structured AST.
 * @param {import('web-tree-sitter').Tree} tree
 */
export function parse(tree) {
    const errors = collectErrors(tree.rootNode);
    if (errors.length > 0) throw new ParseError(errors);
    return parseSourceFile(tree.rootNode);
}

// ==================== Error Collection ====================

function collectErrors(node) {
    const out = [];
    if (node.type === 'ERROR') {
        out.push({ message: 'Unexpected token', pos: nodePos(node) });
    } else if (node.isMissing) {
        out.push({ message: `Missing ${node.type}`, pos: nodePos(node) });
    }
    for (const child of node.children) collectErrors(child).forEach(e => out.push(e));
    return out;
}

// ==================== Helpers ====================

function nodePos(node) {
    return { row: node.startPosition.row, col: node.startPosition.column };
}

/** First named child whose type matches */
function childOfType(node, type) {
    return node.namedChildren.find(c => c.type === type) ?? null;
}

/** All named children whose type matches */
function childrenOfType(node, type) {
    return node.namedChildren.filter(c => c.type === type);
}

// ==================== Source File ====================

function parseSourceFile(node) {
    return {
        kind: 'program',
        items: node.namedChildren.map(parseItem),
        pos: nodePos(node),
    };
}

// ==================== Items ====================

function parseItem(node) {
    switch (node.type) {
        case 'struct_decl':  return parseStructDecl(node);
        case 'type_decl':    return parseTypeDecl(node);
        case 'fn_decl':      return parseFnDecl(node);
        case 'global_decl':  return parseGlobalDecl(node);
        case 'import_decl':  return parseImportDecl(node);
        case 'export_decl':  return parseExportDecl(node);
        default:
            throw new Error(`Unknown top-level item: ${node.type} at ${node.startPosition.row}:${node.startPosition.column}`);
    }
}

// ==================== Declarations ====================

// struct_decl: 'struct' type_ident '{' field_list? '}'
function parseStructDecl(node) {
    const fieldsNode = childOfType(node, 'field_list');
    return {
        kind: 'struct_decl',
        name: childOfType(node, 'type_ident').text,
        fields: fieldsNode ? parseFieldList(fieldsNode) : [],
        pos: nodePos(node),
    };
}

// field_list: field (',' field)* ','?
function parseFieldList(node) {
    return childrenOfType(node, 'field').map(parseField);
}

// field: 'mut'? identifier ':' type
function parseField(node) {
    const named = node.namedChildren;
    return {
        kind: 'field',
        mut: node.children.some(c => c.type === 'mut'),
        name: named[0].text,   // identifier
        type: parseType(named[1]),
        pos: nodePos(node),
    };
}

// type_decl: 'type' type_ident '=' variant_list
function parseTypeDecl(node) {
    return {
        kind: 'type_decl',
        name: childOfType(node, 'type_ident').text,
        variants: parseVariantList(childOfType(node, 'variant_list')),
        pos: nodePos(node),
    };
}

// variant_list: '|'? variant ('|' variant)*
function parseVariantList(node) {
    return childrenOfType(node, 'variant').map(parseVariant);
}

// variant: type_ident ('{' field_list? '}')?
function parseVariant(node) {
    const fieldsNode = childOfType(node, 'field_list');
    return {
        kind: 'variant',
        name: childOfType(node, 'type_ident').text,
        fields: fieldsNode ? parseFieldList(fieldsNode) : [],
        pos: nodePos(node),
    };
}

// fn_decl: 'fn' identifier '(' param_list? ')' return_type? block
function parseFnDecl(node) {
    const paramsNode = childOfType(node, 'param_list');
    const retNode    = childOfType(node, 'return_type');
    return {
        kind: 'fn_decl',
        name: childOfType(node, 'identifier').text,
        params: paramsNode ? parseParamList(paramsNode) : [],
        returnType: retNode ? parseReturnType(retNode) : null,
        body: parseBlock(childOfType(node, 'block')),
        pos: nodePos(node),
    };
}

// param_list: param (',' param)* ','?
function parseParamList(node) {
    return childrenOfType(node, 'param').map(parseParam);
}

// param: identifier ':' type
function parseParam(node) {
    const named = node.namedChildren;
    return {
        kind: 'param',
        name: named[0].text,
        type: parseType(named[1]),
        pos: nodePos(node),
    };
}

// return_type: _return_component (',' _return_component)*
// _return_component is inlined: type ('#' type)?
// Walk raw children to group correctly.
function parseReturnType(node) {
    const components = [];
    const children = node.children;
    let i = 0;

    while (i < children.length) {
        const child = children[i];
        if (!child.isNamed) { i++; continue; }   // skip ',' and other punctuation

        const okType = parseType(child);
        i++;

        // Optional exclusive disjunction: '#' type
        if (i < children.length && children[i].type === '#') {
            i++; // skip '#'
            if (i < children.length && children[i].isNamed) {
                const errType = parseType(children[i]);
                i++;
                components.push({ ok: okType, err: errType });
            } else {
                components.push({ ok: okType, err: null });
            }
        } else {
            components.push({ ok: okType, err: null });
        }
    }

    if (components.length === 0) return null;

    if (components.length === 1) {
        const { ok, err } = components[0];
        if (err === null) return ok;
        return { kind: 'exclusive', ok, err, pos: nodePos(node) };
    }

    // Multi-value return: T1, T2  or  T1 # E1, T2
    return {
        kind: 'multi_return',
        components: components.map(({ ok, err }) =>
            err ? { kind: 'exclusive', ok, err } : ok
        ),
        pos: nodePos(node),
    };
}

// global_decl: 'let' identifier ':' type '=' expr
function parseGlobalDecl(node) {
    const named = node.namedChildren;
    return {
        kind: 'global_decl',
        name: named[0].text,     // identifier
        type: parseType(named[1]),
        value: parseExpr(named[2]),
        pos: nodePos(node),
    };
}

// import_decl:
//   'import' 'extern' string_lit identifier '(' import_param_list? ')' return_type?
//   'import' 'extern' string_lit identifier ':' type
function parseImportDecl(node) {
    const named    = node.namedChildren;
    const module   = named[0].text.slice(1, -1);  // strip quotes from string_lit
    const name     = named[1].text;                // identifier
    const isFn     = node.children.some(c => !c.isNamed && c.type === '(');

    if (isFn) {
        const paramsNode = childOfType(node, 'import_param_list');
        const retNode    = childOfType(node, 'return_type');
        return {
            kind: 'import_fn',
            module,
            name,
            params: paramsNode ? parseImportParamList(paramsNode) : [],
            returnType: retNode ? parseReturnType(retNode) : null,
            pos: nodePos(node),
        };
    } else {
        // value import: identifier ':' type
        return {
            kind: 'import_val',
            module,
            name,
            type: parseType(named[2]),
            pos: nodePos(node),
        };
    }
}

// import_param_list: _import_param (',' _import_param)*
// _import_param: param | type  (anonymous, inlined)
function parseImportParamList(node) {
    return node.namedChildren.map(child => {
        if (child.type === 'param') return parseParam(child);
        // Unnamed param — just a type node
        return { kind: 'anon_param', type: parseType(child), pos: nodePos(child) };
    });
}

// export_decl: 'export' fn_decl
function parseExportDecl(node) {
    return {
        kind: 'export_decl',
        fn: parseFnDecl(childOfType(node, 'fn_decl')),
        pos: nodePos(node),
    };
}

// ==================== Types ====================

function parseType(node) {
    switch (node.type) {
        case 'nullable_type': return parseNullableType(node);
        case 'scalar_type':   return { kind: 'scalar', name: node.text, pos: nodePos(node) };
        case 'ref_type':      return parseRefType(node);
        case 'func_type':     return parseFuncType(node);
        case 'paren_type':    return parseType(node.namedChildren[0]);
        default:
            throw new Error(`Unknown type node: ${node.type} ("${node.text}") at ${node.startPosition.row}:${node.startPosition.column}`);
    }
}

// nullable_type: _base_type '#' 'null'
function parseNullableType(node) {
    return {
        kind: 'nullable',
        inner: parseType(node.namedChildren[0]),
        pos: nodePos(node),
    };
}

// ref_type: type_ident | 'str' | 'externref' | 'anyref' | 'eqref' | 'i31' | 'array' '[' type ']'
function parseRefType(node) {
    const first = node.children[0];
    if (first.type === 'array') {
        return {
            kind: 'array',
            elem: parseType(node.namedChildren[0]),
            pos: nodePos(node),
        };
    }
    // type_ident or keyword ref types (str, externref, etc.)
    return { kind: 'named', name: first.text, pos: nodePos(node) };
}

// func_type: 'fn' '(' type_list? ')' return_type
function parseFuncType(node) {
    const typeListNode = childOfType(node, 'type_list');
    return {
        kind: 'func_type',
        params: typeListNode ? typeListNode.namedChildren.map(parseType) : [],
        returnType: parseReturnType(childOfType(node, 'return_type')),
        pos: nodePos(node),
    };
}

// ==================== Block ====================

// block: '{' _expr* '}'
function parseBlock(node) {
    return {
        kind: 'block',
        stmts: node.namedChildren.map(parseExpr),
        pos: nodePos(node),
    };
}

// ==================== Expressions ====================

function parseExpr(node) {
    switch (node.type) {
        case 'literal':             return parseLiteral(node);
        case 'identifier':          return { kind: 'ident', name: node.text, pos: nodePos(node) };
        case 'paren_expr':          return parseExpr(node.namedChildren[0]);
        case 'unary_expr':          return parseUnaryExpr(node);
        case 'binary_expr':         return parseBinaryExpr(node);
        case 'tuple_expr':          return parseTupleExpr(node);
        case 'pipe_expr':           return parsePipeExpr(node);
        case 'else_expr':           return parseElseExpr(node);
        case 'call_expr':           return parseCallExpr(node);
        case 'field_expr':          return parseFieldExpr(node);
        case 'index_expr':          return parseIndexExpr(node);
        case 'namespace_call_expr': return parseNamespaceCallExpr(node);
        case 'ref_null_expr':       return parseRefNullExpr(node);
        case 'if_expr':             return parseIfExpr(node);
        case 'match_expr':          return parseMatchExpr(node);
        case 'block_expr':          return parseBlockExpr(node);
        case 'for_expr':            return parseForExpr(node);
        case 'break_expr':          return parseBreakExpr(node);
        case 'bind_expr':           return parseBindExpr(node);
        case 'struct_init':         return parseStructInit(node);
        case 'array_init':          return parseArrayInit(node);
        case 'assign_expr':         return parseAssignExpr(node);
        case 'unreachable_expr':    return { kind: 'unreachable', pos: nodePos(node) };
        default:
            throw new Error(`Unknown expr node: ${node.type} ("${node.text}") at ${node.startPosition.row}:${node.startPosition.column}`);
    }
}

// ==================== Literals ====================

// literal: int_lit | float_lit | string_lit | multiline_string_lit | 'true' | 'false' | 'null'
function parseLiteral(node) {
    if (node.namedChildren.length > 0) {
        const child = node.namedChildren[0];
        switch (child.type) {
            case 'int_lit':
                return { kind: 'int', value: parseIntLit(child.text), raw: child.text, pos: nodePos(node) };
            case 'float_lit':
                return { kind: 'float', value: parseFloat(child.text), raw: child.text, pos: nodePos(node) };
            case 'string_lit':
                return { kind: 'string', value: child.text.slice(1, -1), pos: nodePos(node) };
            case 'multiline_string_lit': {
                const lines = childrenOfType(child, 'multiline_string_line')
                    .map(l => l.text.slice(2)); // strip leading \\
                return { kind: 'string', value: lines.join('\n'), pos: nodePos(node) };
            }
        }
    }
    // Keyword literals: true, false, null (anonymous tokens — no named children)
    switch (node.text) {
        case 'true':  return { kind: 'bool', value: true,  pos: nodePos(node) };
        case 'false': return { kind: 'bool', value: false, pos: nodePos(node) };
        case 'null':  return { kind: 'null',               pos: nodePos(node) };
    }
    throw new Error(`Unknown literal: "${node.text}" at ${node.startPosition.row}:${node.startPosition.column}`);
}

function parseIntLit(text) {
    if (text.startsWith('0x')) return parseInt(text.slice(2), 16);
    if (text.startsWith('0b')) return parseInt(text.slice(2), 2);
    return parseInt(text, 10);
}

// ==================== Expressions (detail) ====================

// unary_expr: unary_op _expr
function parseUnaryExpr(node) {
    const opNode   = childOfType(node, 'unary_op');
    const exprNode = node.namedChildren.find(c => c !== opNode);
    return {
        kind: 'unary',
        op:   opNode.text,
        expr: parseExpr(exprNode),
        pos:  nodePos(node),
    };
}

// binary_expr: _expr bin_op _expr
// The operator is an anonymous token sitting between the two named children.
function parseBinaryExpr(node) {
    const named = node.namedChildren;
    const left  = named[0];
    const right = named[1];
    const op    = findAnonBetween(node, left, right);
    return {
        kind:  'binary',
        op,
        left:  parseExpr(left),
        right: parseExpr(right),
        pos:   nodePos(node),
    };
}

// Flatten nested tuple_expr into a flat elems array.
// tuple_expr: _expr ',' _expr
function parseTupleExpr(node) {
    const elems = [];
    function flatten(n) {
        if (n.type === 'tuple_expr') {
            flatten(n.namedChildren[0]);
            flatten(n.namedChildren[1]);
        } else {
            elems.push(parseExpr(n));
        }
    }
    flatten(node);
    return { kind: 'tuple', elems, pos: nodePos(node) };
}

// pipe_expr: _expr '-o' pipe_target
function parsePipeExpr(node) {
    const named  = node.namedChildren;
    const value  = named[0];
    const target = named[1]; // pipe_target node
    return {
        kind:   'pipe',
        value:  parseExpr(value),
        target: parsePipeTarget(target),
        pos:    nodePos(node),
    };
}

// pipe_target: _pipe_path | _pipe_path '(' pipe_args ')'
// _pipe_path is inlined — identifiers appear directly as named children.
function parsePipeTarget(node) {
    const pipeArgsNode = childOfType(node, 'pipe_args');

    // Collect all identifier-typed named children before pipe_args
    const parts = [];
    for (const child of node.namedChildren) {
        if (child.type === 'pipe_args') break;
        if (child.type === 'identifier') parts.push(child.text);
    }
    const callee = parts.join('.');

    if (pipeArgsNode) {
        return {
            kind:   'pipe_call',
            callee,
            args:   parsePipeArgs(pipeArgsNode),
            pos:    nodePos(node),
        };
    }
    return { kind: 'pipe_ident', name: callee, pos: nodePos(node) };
}

// pipe_args: pipe_arg (',' pipe_arg)*
// pipe_arg: '_' | _expr
function parsePipeArgs(node) {
    return childrenOfType(node, 'pipe_arg').map(n => {
        if (n.children[0].type === '_') {
            return { kind: 'placeholder', pos: nodePos(n) };
        }
        return { kind: 'arg', value: parseExpr(n.namedChildren[0]), pos: nodePos(n) };
    });
}

// else_expr: _expr '\' _expr
function parseElseExpr(node) {
    const named = node.namedChildren;
    return {
        kind:     'else',
        expr:     parseExpr(named[0]),
        fallback: parseExpr(named[1]),
        pos:      nodePos(node),
    };
}

// call_expr: _expr '(' arg_list? ')'
function parseCallExpr(node) {
    const named       = node.namedChildren;
    const callee      = named[0];
    const argListNode = named.length > 1 && named[1].type === 'arg_list' ? named[1] : null;
    return {
        kind:   'call',
        callee: parseExpr(callee),
        args:   argListNode ? argListNode.namedChildren.map(parseExpr) : [],
        pos:    nodePos(node),
    };
}

// field_expr: _expr '.' identifier
function parseFieldExpr(node) {
    const named = node.namedChildren;
    return {
        kind:   'field',
        object: parseExpr(named[0]),
        field:  named[1].text,
        pos:    nodePos(node),
    };
}

// index_expr: _expr '[' _expr ']'
function parseIndexExpr(node) {
    const named = node.namedChildren;
    return {
        kind:   'index',
        object: parseExpr(named[0]),
        index:  parseExpr(named[1]),
        pos:    nodePos(node),
    };
}

// namespace_call_expr: _builtin_ns '.' identifier ('(' arg_list? ')')?
function parseNamespaceCallExpr(node) {
    const nsToken     = node.children[0];
    const methodNode  = childOfType(node, 'identifier');
    const argListNode = childOfType(node, 'arg_list');
    const hasParens   = node.children.some(c => !c.isNamed && c.type === '(');
    return {
        kind:   hasParens ? 'ns_call' : 'ns_ref',
        ns:     nsToken.text,
        method: methodNode.text,
        args:   argListNode ? argListNode.namedChildren.map(parseExpr) : [],
        pos:    nodePos(node),
    };
}

// ref_null_expr: 'ref' '.' 'null' type_ident
function parseRefNullExpr(node) {
    return {
        kind: 'ref_null',
        type: childOfType(node, 'type_ident').text,
        pos:  nodePos(node),
    };
}

// if_expr: 'if' _expr block ('else' (if_expr | block))?
function parseIfExpr(node) {
    const named      = node.namedChildren;
    const cond       = named[0];
    const thenBlock  = named[1];
    const elseBranch = named[2] ?? null;
    return {
        kind: 'if',
        cond: parseExpr(cond),
        then: parseBlock(thenBlock),
        else: elseBranch
            ? (elseBranch.type === 'if_expr' ? parseIfExpr(elseBranch) : parseBlock(elseBranch))
            : null,
        pos: nodePos(node),
    };
}

// match_expr: 'match' _expr '{' match_arm+ '}'
function parseMatchExpr(node) {
    const named   = node.namedChildren;
    const subject = named[0];
    const arms    = named.slice(1); // all match_arm nodes
    return {
        kind:    'match',
        subject: parseExpr(subject),
        arms:    arms.map(parseMatchArm),
        pos:     nodePos(node),
    };
}

// match_arm:
//   match_pattern ':' type_ident '=>' expr ','   (type-guarded)
//   match_pattern '=>' expr ','                   (plain)
function parseMatchArm(node) {
    const named    = node.namedChildren;
    // 3 named children → type-guarded; 2 → plain
    const hasGuard = named.length === 3;
    return {
        kind:    'match_arm',
        pattern: named[0].text,                          // '_' or identifier name
        guard:   hasGuard ? named[1].text : null,        // TypeIdent or null
        expr:    parseExpr(named[named.length - 1]),
        pos:     nodePos(node),
    };
}

// for_expr: 'for' '(' for_sources? ')' capture? block
function parseForExpr(node) {
    const sourcesNode = childOfType(node, 'for_sources');
    const captureNode = childOfType(node, 'capture');
    const blockNode   = childOfType(node, 'block');
    return {
        kind:     'for',
        sources:  sourcesNode ? parseForSources(sourcesNode) : [],
        captures: captureNode ? parseCapture(captureNode) : [],
        body:     parseBlock(blockNode),
        pos:      nodePos(node),
    };
}

// for_sources: for_source (',' for_source)*
function parseForSources(node) {
    return childrenOfType(node, 'for_source').map(parseForSource);
}

// for_source: _expr '..' _expr  (range)  |  _expr  (condition)
function parseForSource(node) {
    const isRange = node.children.some(c => !c.isNamed && c.type === '..');
    const named   = node.namedChildren;
    if (isRange) {
        return { kind: 'range', start: parseExpr(named[0]), end: parseExpr(named[1]), pos: nodePos(node) };
    }
    return { kind: 'cond', expr: parseExpr(named[0]), pos: nodePos(node) };
}

// capture: '|' identifier (',' identifier)* '|'
function parseCapture(node) {
    return childrenOfType(node, 'identifier').map(n => n.text);
}

// block_expr: (identifier ':')? block
function parseBlockExpr(node) {
    const labelNode = childOfType(node, 'identifier');
    const blockNode = childOfType(node, 'block');
    return {
        kind:  'block_expr',
        label: labelNode ? labelNode.text : null,
        body:  parseBlock(blockNode),
        pos:   nodePos(node),
    };
}

// break_expr: 'break' identifier? _expr?
function parseBreakExpr(node) {
    const named = node.namedChildren;
    let label = null;
    let value = null;
    if (named.length >= 1) {
        if (named[0].type === 'identifier') {
            label = named[0].text;
            if (named.length >= 2) value = parseExpr(named[1]);
        } else {
            value = parseExpr(named[0]);
        }
    }
    return { kind: 'break', label, value, pos: nodePos(node) };
}

// bind_expr: 'let' bind_target (',' bind_target)* '=' _expr
function parseBindExpr(node) {
    const targets  = childrenOfType(node, 'bind_target').map(parseBindTarget);
    const exprNode = node.namedChildren.filter(c => c.type !== 'bind_target').pop();
    return {
        kind:    'let',
        targets,
        value:   parseExpr(exprNode),
        pos:     nodePos(node),
    };
}

// bind_target: identifier ':' type
function parseBindTarget(node) {
    const named = node.namedChildren;
    return {
        name: named[0].text,
        type: parseType(named[1]),
        pos:  nodePos(node),
    };
}

// struct_init: type_ident '{' (field_init (',' field_init)* ','?)? '}'
function parseStructInit(node) {
    return {
        kind:   'struct_init',
        type:   childOfType(node, 'type_ident').text,
        fields: childrenOfType(node, 'field_init').map(parseFieldInit),
        pos:    nodePos(node),
    };
}

// field_init: identifier ':' _expr
function parseFieldInit(node) {
    const named = node.namedChildren;
    return {
        name:  named[0].text,
        value: parseExpr(named[1]),
        pos:   nodePos(node),
    };
}

// array_init: 'array' '[' type ']' '.' identifier '(' arg_list? ')'
function parseArrayInit(node) {
    const named       = node.namedChildren;
    const elemType    = parseType(named[0]);         // type inside [...]
    const method      = named[1].text;               // identifier (new, new_fixed, ...)
    const argListNode = named.length > 2 ? named[2] : null;
    return {
        kind:   'array_init',
        elem:   elemType,
        method,
        args:   argListNode ? argListNode.namedChildren.map(parseExpr) : [],
        pos:    nodePos(node),
    };
}

// assign_expr: (identifier | field_expr | index_expr) '=' _expr
function parseAssignExpr(node) {
    const named = node.namedChildren;
    return {
        kind: 'assign',
        lhs:  parseExpr(named[0]),
        rhs:  parseExpr(named[1]),
        pos:  nodePos(node),
    };
}

// ==================== Utility ====================

/**
 * Find the anonymous token that sits between two named children.
 * Used to extract the operator from binary_expr nodes.
 */
function findAnonBetween(node, leftChild, rightChild) {
    let inGap = false;
    for (const child of node.children) {
        if (child === leftChild)  { inGap = true;  continue; }
        if (child === rightChild) break;
        if (inGap && !child.isNamed) return child.type;
    }
    return '?';
}
