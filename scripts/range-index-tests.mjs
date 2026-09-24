import { buildRangeIndex, queryRangeIndex, smallestRangeAt } from '../src/compiler/range-index.js';

export function registerRangeIndexTests({ test, assertEq }) {
  test('ranges: half-open boundaries, invalid input, files and kind filters', () => {
    const entries = [
      { file: 'a', start: 0, end: 4, id: 'wide', kind: 'node' },
      { file: 'a', start: 1, end: 3, id: 'small', kind: 'token' },
      { file: 'b', start: 0, end: 4, id: 'other' },
      { file: 'a', start: 2, end: 2, id: 'empty' },
      { file: 'a', start: -1, end: 2 },
      { file: 'a', start: 2, end: Infinity },
      null,
    ];
    const index = buildRangeIndex(entries);
    assertEq(queryRangeIndex(index, 'a', 3, 4).map(x => x.id).join(), 'wide');
    assertEq(queryRangeIndex(index, 'a', 4, 5).length, 0);
    assertEq(queryRangeIndex(index, 'missing', 0, 5).length, 0);
    assertEq(queryRangeIndex(index, 'a', 2, 2).length, 0);
    assertEq(queryRangeIndex(index, 'a', NaN, 3).length, 0);
    assertEq(queryRangeIndex(index, 'a', 0, 4, { kind: 'token' }).length, 1);
    assertEq(smallestRangeAt(index, 'a', 2)?.id, 'small');
    assertEq(smallestRangeAt(index, 'a', 2, { kind: 'node' })?.id, 'wide');
    assertEq(smallestRangeAt(index, 'a', 4), null);
  });

  test('ranges: duplicate keys cannot cause linear-depth recursion', () => {
    const entry = { file: 'a', start: 0, end: 1 };
    const index = buildRangeIndex(Array(20000).fill(entry));
    assertEq(queryRangeIndex(index, 'a', 0, 1).length, 20000);
    assertEq(smallestRangeAt(index, 'a', 0), entry);
  });

  test('ranges: indexed queries agree with a seeded brute-force oracle', () => {
    let seed = 917;
    const random = max => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % max;
    };
    const entries = Array.from({ length: 500 }, (_, id) => {
      const start = random(200);
      return { file: `f${random(3)}`, start, end: start + 1 + random(40), kind: `k${random(2)}`, id: String(id) };
    });
    const order = (a, b) => a.start - b.start || a.end - b.end
      || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const index = buildRangeIndex(entries);
    const reversed = buildRangeIndex([...entries].reverse());
    for (let n = 0; n < 300; n++) {
      const file = `f${random(3)}`, start = random(240), end = start + 1 + random(30);
      const opts = n % 2 ? { kind: `k${random(2)}` } : {};
      const matches = entries.filter(e => e.file === file && (!opts.kind || e.kind === opts.kind));
      const expected = matches.filter(e => e.start < end && start < e.end).sort(order);
      const ids = values => values.map(e => e.id).join(',');
      assertEq(ids(queryRangeIndex(index, file, start, end, opts)), ids(expected));
      assertEq(ids(queryRangeIndex(reversed, file, start, end, opts)), ids(expected));
      const smallest = matches.filter(e => e.start <= start && start < e.end)
        .sort((a, b) => (a.end - a.start) - (b.end - b.start) || order(a, b))[0] ?? null;
      assertEq(smallestRangeAt(index, file, start, opts), smallest);
    }
  });
}
