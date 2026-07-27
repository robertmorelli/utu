// Immutable per-file interval treap for source range queries.
//
// Ranges are half-open: [start, end). Entries are plain objects with at least:
//   { file: string, start: number, end: number, kind?: string, id?: string }
//
// The treap is an internal index. It is not a public data model.

/**
 * @typedef {Object} RangeEntry
 * @property {string} file
 * @property {number} start
 * @property {number} end
 * @property {string} [kind]
 * @property {string} [id]
 */

class TreapNode {
  constructor(entry, priority, left = null, right = null) {
    this.entry = entry;
    this.priority = priority;
    this.left = left;
    this.right = right;
    this.maxEnd = Math.max(
      entry.end,
      left?.maxEnd ?? -Infinity,
      right?.maxEnd ?? -Infinity,
    );
  }
}

/**
 * Build one immutable interval treap per file.
 *
 * @param {Iterable<RangeEntry>} entries
 * @returns {Map<string, TreapNode | null>}
 */
export function buildRangeIndex(entries) {
  const roots = new Map();

  for (const entry of entries) {
    if (!isUsableRange(entry)) continue;
    const file = entry.file;
    const priority = priorityFor(entry);
    const root = roots.get(file) ?? null;
    roots.set(file, insert(root, new TreapNode(entry, priority)));
  }

  return roots;
}

/**
 * Query all entries in `file` that overlap [start, end).
 * Point queries can pass end = start + 1.
 *
 * @param {Map<string, TreapNode | null>} index
 * @param {string} file
 * @param {number} start
 * @param {number} end
 * @param {{ kind?: string }} [opts]
 * @returns {RangeEntry[]}
 */
export function queryRangeIndex(index, file, start, end, opts = {}) {
  const root = index.get(file) ?? null;
  if (!root || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const out = [];
  queryOverlaps(root, start, end, opts.kind, out);
  out.sort(compareEntries);
  return out;
}

/**
 * Return the smallest range containing offset, optionally filtered by kind.
 * Ties are broken by earlier start, then stable entry ordering.
 *
 * @param {Map<string, TreapNode | null>} index
 * @param {string} file
 * @param {number} offset
 * @param {{ kind?: string }} [opts]
 * @returns {RangeEntry | null}
 */
export function smallestRangeAt(index, file, offset, opts = {}) {
  const root = index.get(file) ?? null;
  if (!root || !Number.isFinite(offset)) return null;

  const hits = [];
  queryPoint(root, offset, opts.kind, hits);
  hits.sort(compareEntries);
  let best = null;
  for (const hit of hits) {
    if (!best) {
      best = hit;
      continue;
    }
    const hitWidth = hit.end - hit.start;
    const bestWidth = best.end - best.start;
    if (hitWidth < bestWidth || (hitWidth === bestWidth && compareEntries(hit, best) < 0)) {
      best = hit;
    }
  }
  return best;
}

function insert(root, node) {
  if (!root) return node;

  const cmp = compareEntries(node.entry, root.entry);
  if (cmp < 0) {
    const left = insert(root.left, node);
    const next = withChildren(root, left, root.right);
    if (left.priority < next.priority) return rotateRight(next);
    return next;
  }

  const right = insert(root.right, node);
  const next = withChildren(root, root.left, right);
  if (right.priority < next.priority) return rotateLeft(next);
  return next;
}

function queryOverlaps(node, start, end, kind, out) {
  if (!node || node.maxEnd <= start) return;

  if (node.left && node.left.maxEnd > start) {
    queryOverlaps(node.left, start, end, kind, out);
  }

  const entry = node.entry;
  if (entry.start < end && start < entry.end && (!kind || entry.kind === kind)) {
    out.push(entry);
  }

  // All entries in the right subtree start at or after this node's start.
  // If this node starts beyond the query end, the right side cannot overlap.
  if (node.entry.start < end) {
    queryOverlaps(node.right, start, end, kind, out);
  }
}

function queryPoint(node, offset, kind, out) {
  if (!node || node.maxEnd <= offset) return;

  if (node.left && node.left.maxEnd > offset) {
    queryPoint(node.left, offset, kind, out);
  }

  const entry = node.entry;
  if (entry.start <= offset && offset < entry.end && (!kind || entry.kind === kind)) {
    out.push(entry);
  }

  if (node.entry.start <= offset) {
    queryPoint(node.right, offset, kind, out);
  }
}

function rotateRight(root) {
  const pivot = root.left;
  const moved = withChildren(root, pivot.right, root.right);
  return withChildren(pivot, pivot.left, moved);
}

function rotateLeft(root) {
  const pivot = root.right;
  const moved = withChildren(root, root.left, pivot.left);
  return withChildren(pivot, moved, pivot.right);
}

function withChildren(node, left, right) {
  if (node.left === left && node.right === right) return node;
  return new TreapNode(node.entry, node.priority, left, right);
}

function isUsableRange(entry) {
  return entry
    && typeof entry.file === 'string'
    && Number.isFinite(entry.start)
    && Number.isFinite(entry.end)
    && entry.start >= 0
    && entry.end >= entry.start;
}

function compareEntries(a, b) {
  return (a.start - b.start)
    || (a.end - b.end)
    || compareStrings(a.kind, b.kind)
    || compareStrings(a.id, b.id)
    || compareStrings(stableEntryKey(a), stableEntryKey(b));
}

function compareStrings(a = '', b = '') {
  return a < b ? -1 : a > b ? 1 : 0;
}

function priorityFor(entry) {
  return hash32(stableEntryKey(entry));
}

function stableEntryKey(entry) {
  return `${entry.file}\u0000${entry.start}\u0000${entry.end}\u0000${entry.kind ?? ''}\u0000${entry.id ?? ''}`;
}

// FNV-1a 32-bit hash. Deterministic priority beats Math.random for tests.
function hash32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
