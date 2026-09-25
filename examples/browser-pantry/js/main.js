// The Pantry dashboard in plain JavaScript: the same behavior and DOM as
// ../main.utu, statement for statement, for byte and performance comparison.

function money(value) {
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  return format.format(value);
}

function loadFavorites() {
  const saved = new Set();
  const text = localStorage.getItem('pantry-favorites');
  if (text !== null) {
    const ids = JSON.parse(text);
    for (let i = 0; i < ids.length; i++) saved.add(ids[i]);
  }
  return saved;
}

function saveFavorites(favorites) {
  localStorage.setItem('pantry-favorites', JSON.stringify(Array.from(favorites)));
}

function drawChart(canvas, items) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const categories = ['Produce', 'Dairy', 'Bakery', 'Pantry'];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '12px system-ui';
  for (let i = 0; i < categories.length; i++) {
    const name = categories[i];
    const count = items.filter(item => item.category === name).length;
    const y = 16 + i * 40;
    ctx.fillStyle = '#66756b';
    ctx.fillText(name, 12, y + 14);
    ctx.fillStyle = '#2f6b4f';
    ctx.fillRect(90, y, count * 50, 20);
  }
}

function countUp(target, total) {
  const start = performance.now();
  const step = now => {
    const progress = Math.min(1, (now - start) / 600);
    target.textContent = money(total * progress);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function render(state) {
  const list = state.list;
  const query = state.query.toLowerCase();
  const visible = state.items.filter(item =>
    (state.category === 'All' || item.category === state.category) && item.name.toLowerCase().includes(query));
  visible.sort((a, b) => {
    if (state.sort === 'price') return a.price - b.price;
    if (state.sort === 'quantity') return b.quantity - a.quantity;
    return a.name.localeCompare(b.name);
  });
  list.replaceChildren();
  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'Nothing matches “' + state.query + '”.';
    list.append(empty);
  }
  visible.forEach(item => {
    const row = document.createElement('li');
    row.className = 'item';
    row.dataset.id = item.id;
    row.classList.toggle('favorite', state.favorites.has(item.id));
    const star = document.createElement('button');
    star.className = 'star';
    star.textContent = '★';
    star.setAttribute('aria-label', 'Favorite ' + item.name);
    const text = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = item.name;
    const meta = document.createElement('p');
    meta.textContent = item.category + ' · ' + item.quantity.toString() + ' on hand';
    text.append(title, meta);
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = money(item.price);
    row.append(star, text, price);
    list.append(row);
  });
  const total = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  countUp(state.total, total);
  drawChart(state.chart, state.items);
  const url = new URL(location.href);
  if (state.query.length > 0) url.searchParams.set('q', state.query); else url.searchParams.delete('q');
  history.replaceState(null, '', url.href);
  state.status.textContent = visible.length.toString() + ' of ' + state.items.length.toString()
    + ' items · updated ' + new Date().toLocaleTimeString('en-US');
}

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element;
}

async function main() {
  const response = await fetch('items.json');
  const items = await response.json();
  const search = document.querySelector('#search');
  const initial = new URL(location.href).searchParams.get('q');
  const state = {
    items, favorites: loadFavorites(), query: initial ?? '', category: 'All', sort: 'name',
    list: byId('items'), chart: document.querySelector('canvas'), total: byId('total-value'), status: byId('status'),
  };

  const chips = byId('chips');
  ['All', 'Produce', 'Dairy', 'Bakery', 'Pantry'].forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = name;
    chip.classList.toggle('active', name === state.category);
    chip.addEventListener('click', () => {
      state.category = name;
      chips.querySelectorAll('.chip').forEach(other => other.classList.toggle('active', other === chip));
      render(state);
    });
    chips.append(chip);
  });

  if (search) {
    search.value = state.query;
    let timer = 0;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.query = search.value; render(state); }, 150);
    });
    document.addEventListener('keydown', event => {
      if (event.key === '/' && document.activeElement !== search) {
        event.preventDefault();
        search.focus();
      }
    });
  }

  const sort = document.querySelector('#sort');
  sort?.addEventListener('change', () => { state.sort = sort.value; render(state); });

  state.list.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest('.item');
    if (!row) return;
    const id = row.dataset.id;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    saveFavorites(state.favorites);
    render(state);
  });

  const add = document.querySelector('#add');
  add?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(add);
    const name = data.get('name');
    const price = Number(data.get('price'));
    const error = byId('form-error');
    if (!add.checkValidity()) {
      error.textContent = 'Give the item a name and a price.';
    } else {
      error.textContent = '';
      state.items.push({ id: 'custom-' + Date.now().toString(), name, category: data.get('category'), price, quantity: 1 });
      add.reset();
      render(state);
    }
  });

  render(state);
}

main();
