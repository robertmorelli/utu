// Static per-file balanced interval tree for source range queries.
//
// Ranges are half-open: [start, end). Entries are plain objects with at least:
//   { file: string, start: number, end: number, kind?: string, id?: string }
//
// The tree is an internal index. It is not a public data model.

/**
 * @typedef {Object} RangeEntry
 * @property {string} file
 * @property {number} start
 * @property {number} end
 * @property {string} [kind]
 * @property {string} [id]
 */

class RangeNode {
  constructor(entry, left = null, right = null) {
    this.entry = entry;
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
 * Build one balanced interval tree per file in O(n log n) time.
 * Bulk construction guarantees logarithmic depth even for duplicate ranges;
 * hash-priority insertion could degenerate into a chain on identical keys.
 * Empty and invalid ranges are excluded. Entries must not change afterward.
 *
 * @param {Iterable<RangeEntry>} entries
 * @returns {Map<string, RangeNode | null>}
 */
export function buildRangeIndex(entries) {
  const files = new Map();
  for (const entry of entries) {
    if (!isUsableRange(entry)) continue;
    if (!files.has(entry.file)) files.set(entry.file, []);
    files.get(entry.file).push(entry);
  }
  const roots = new Map();
  for (const [file, ranges] of files) {
    ranges.sort(compareEntries);
    roots.set(file, buildBalanced(ranges, 0, ranges.length));
  }
  // Each file's sorted entries, for the per-kind trees built on demand.
  roots.sortedByFile = files;
  roots.kindRoots = new Map();
  return roots;
}

/**
 * The trees holding only entries of `kinds`. Filtering a file's sorted
 * entries keeps their order, ties included, so a query over these trees
 * returns exactly the entries of those kinds a full query would, in the
 * same order, without visiting every overlapping range of other kinds.
 */
function rootsForKinds(index, kinds) {
  const key = kinds.join('|');
  let roots = index.kindRoots?.get(key);
  if (roots) return roots;
  roots = new Map();
  for (const [file, ranges] of index.sortedByFile ?? []) {
    const subset = ranges.filter(entry => kinds.includes(entry.kind));
    roots.set(file, buildBalanced(subset, 0, subset.length));
  }
  index.kindRoots?.set(key, roots);
  return roots;
}

/**
 * Query all entries in `file` that overlap [start, end).
 * Point queries can pass end = start + 1.
 *
 * @param {Map<string, RangeNode | null>} index
 * @param {string} file
 * @param {number} start
 * @param {number} end
 * @param {{ kind?: string, kinds?: string[] }} [opts]
 * @returns {RangeEntry[]}
 */
export function queryRangeIndex(index, file, start, end, opts = {}) {
  const kinds = opts.kinds ?? (opts.kind ? [opts.kind] : null);
  const root = (kinds && index.sortedByFile ? rootsForKinds(index, kinds) : index).get(file) ?? null;
  if (!root || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const out = [];
  queryOverlaps(root, start, end, kinds && index.sortedByFile ? null : opts.kind, out);
  out.sort(compareEntries);
  return out;
}

/**
 * Return the smallest range containing offset, optionally filtered by kind.
 * Ties are broken by earlier start, then stable entry ordering.
 *
 * @param {Map<string, RangeNode | null>} index
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

function buildBalanced(entries, start, end) {
  if (start === end) return null;
  const middle = start + Math.floor((end - start) / 2);
  return new RangeNode(
    entries[middle],
    buildBalanced(entries, start, middle),
    buildBalanced(entries, middle + 1, end),
  );
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

function isUsableRange(entry) {
  return entry
    && typeof entry.file === 'string'
    && Number.isFinite(entry.start)
    && Number.isFinite(entry.end)
    && entry.start >= 0
    && entry.end > entry.start;
}

function compareEntries(a, b) {
  return (a.start - b.start)
    || (a.end - b.end)
    || compareStrings(a.kind, b.kind)
    || compareStrings(a.id, b.id);
}

function compareStrings(a = '', b = '') {
  return a < b ? -1 : a > b ? 1 : 0;
}
