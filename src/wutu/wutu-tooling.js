// Editor and CLI tooling for utu and Wutu: formatting, island discovery,
// completions. The work is the tools' (selfhost/tools/format.utu and
// wutu_format.utu, in dist/utu-tools.wasm: `tools` is loadNodeTools()'s, or
// the extension's); this reads their results.

/** { text, refused }: `source` laid out, or as it is and why it was left so. */
export function formatUtu(tools, source) {
  let text;
  // (A tree too deep for the stack traps.)
  try { text = tools.format(source); } catch { return { text: source, refused: 'it does not parse' }; }
  return { text, refused: tools.format_refused() || null };
}

export const formatUtuSource = (tools, source) => formatUtu(tools, source).text;

/** `source` with each `@wutu` island laid out. */
export const formatWutuSource = (tools, source) => tools.format_wutu(source);

/** A template laid out; it throws when it does not parse. */
export const formatWutuBody = (tools, text) => tools.format_template_text(text);

export class WutuSyntaxError extends Error {
  /** @param {number} offset template-relative offset of the problem */
  constructor(message, offset) {
    super(message);
    this.wutuOffset = offset;
  }
}

/** A template's tree, as the compiler parses it (see template_json in wutu_format.utu); a WutuSyntaxError when it does not parse. */
export function wutuTree(tools, text) {
  const tree = JSON.parse(tools.wutu_template_tree(text));
  if (tree.error !== undefined) throw new WutuSyntaxError(tree.error, tree.at);
  return tree;
}

/** Inner ranges of every `@wutu` literal, ignoring comments and strings. */
export function wutuIslands(tools, source) {
  const at = tools.wutu_islands(source).split(' ').filter(Boolean).map(Number);
  return at.flatMap((start, k) => (k % 2 ? [] : [{ start, end: at[k + 1] }]));
}

const KEYWORD_COMPLETIONS = [
  { label: '|', insertText: '| ', detail: 'Insert components or a component list' },
  { label: '|>', insertText: '|> ', detail: 'Evaluate Utu code and insert its component result' },
  { label: 'bind:value', insertText: 'bind:value = state.value;', detail: 'Two-way string binding' },
  { label: 'bind:checked', insertText: 'bind:checked = state.checked;', detail: 'Two-way boolean binding' },
  { label: 'bind:number', insertText: 'bind:number = state.number;', detail: 'Two-way numeric binding' },
  { label: 'bind:group', insertText: 'bind:group = state.choice;', detail: 'Radio group: the checked radio\'s value' },
  { label: 'bind:values', insertText: 'bind:values = state.selected;', detail: 'Multiple select: Array[Str] of chosen values' },
  { label: 'bind:files', insertText: 'bind:files = state.files;', detail: 'File input: its FileList (read-only)' },
  { label: 'on', insertText: 'on click {\n    \n}', detail: 'Event handler' },
  { label: '@island', insertText: '@island "view-name";', detail: 'Independent update boundary' },
  { label: '@style', insertText: '@style theme.sheet();', detail: 'Shared CSS stylesheet' },
  { label: '@reactive', insertText: '@reactive;', detail: 'Reactive root view' },
];

const COMPLETION = {
  event: label => ({ label, insertText: label + ' {\n    \n}', detail: 'Wutu event handler' }),
  tag: label => ({ label, insertText: label + ' {\n    \n}', detail: 'Wutu element' }),
  attribute: label => ({ label, insertText: label + ' = "";', detail: 'Wutu attribute' }),
};

/** Completions at `offset`: inside a `@wutu` island, the compiler's events, or its tags and attributes. */
export function wutuCompletions(tools, source, offset) {
  const lines = tools.wutu_completions(source, offset).split('\n');
  if (lines.length < 2) return [];
  const items = [];
  for (let k = 0; k + 1 < lines.length; k += 2) items.push(...lines[k + 1].split(' ').map(COMPLETION[lines[k]]));
  return lines[0] === 'event' ? items : items.concat(KEYWORD_COMPLETIONS);
}
