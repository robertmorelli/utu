// The same kernels in plain JavaScript.
export function analyze(items, category, query) {
  const visible = items.filter(item => (category === 'All' || item.category === category) && item.name.toLowerCase().includes(query));
  visible.sort((a, b) => a.price - b.price);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return total + visible.length;
}

export function native(n) {
  const items = new Array(n);
  let seed = 12345;
  for (let i = 0; i < n; i++) {
    seed = Math.imul(seed, 1103515245) + 12345 | 0;
    seed = seed % 2147483647;
    if (seed < 0) seed = -seed;
    items[i] = { price: (seed % 1000) / 100, quantity: seed % 13, category: seed % 4 };
  }
  const kept = new Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const item = items[i];
    if (item.category === 1 || item.price > 5) kept[count++] = item;
  }
  for (let i = 1; i < count; i++) {
    const current = kept[i];
    let j = i - 1;
    while (j >= 0 && kept[j].price > current.price) { kept[j + 1] = kept[j]; j--; }
    kept[j + 1] = current;
  }
  let total = 0;
  for (let i = 0; i < n; i++) total += items[i].price * items[i].quantity;
  return total + count + kept[0].price;
}
