// Small graph utilities for declaration-level questions. This graph is
// deliberately separate from expression actual/expected slots.

export function buildDeclarationGraph(items, keyOf, dependenciesOf) {
  const edges = new Map();
  for (const item of items) edges.set(keyOf(item), new Set(dependenciesOf(item)));
  return {
    edges,
    reaches(from, target) {
      const seen = new Set();
      const queue = [...(edges.get(from) ?? [])];
      for (let i = 0; i < queue.length; i++) {
        const node = queue[i];
        if (node === target) return true;
        if (seen.has(node)) continue;
        seen.add(node);
        queue.push(...(edges.get(node) ?? []));
      }
      return false;
    },
    affected(changed) {
      const reverse = new Map();
      for (const [from, targets] of edges) for (const target of targets) {
        const users = reverse.get(target) ?? new Set();
        users.add(from);
        reverse.set(target, users);
      }
      const found = new Set(changed);
      const queue = [...found];
      for (let i = 0; i < queue.length; i++) for (const user of reverse.get(queue[i]) ?? []) {
        if (!found.has(user)) { found.add(user); queue.push(user); }
      }
      return found;
    },
  };
}

export function* typeUses(node, polarity) {
  if (!node) return;
  yield { node, polarity };
  const children = [...node.children];
  if (node.localName === 'ir-type-fn') {
    for (const child of children.slice(0, -1)) yield* typeUses(child, flip(polarity));
    if (children.at(-1)) yield* typeUses(children.at(-1), polarity);
    return;
  }
  for (const child of children) yield* typeUses(child, polarity);
}

function flip(polarity) {
  return polarity === 'in' ? 'out' : 'in';
}
