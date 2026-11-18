#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <string.h>
#include <wctype.h>

// A DSL envelope inside a template's utu (`@name/\ … \/`), as utu's scanner
// reads one: `/\`, its text (strings in it are text), and the balancing `\/`.
// And `@document { … }`'s CSS: everything to its balancing `}`, past strings
// and comments. And a statement's end (see statement_end).
enum { DSL_OPEN, DSL_TEXT, DSL_CLOSE, CSS_TEXT, STATEMENT_END };

void *tree_sitter_wutu_external_scanner_create(void) { return NULL; }
void tree_sitter_wutu_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_wutu_external_scanner_serialize(void *p, char *b) { (void)p; (void)b; return 0; }
void tree_sitter_wutu_external_scanner_deserialize(void *p, const char *b, unsigned n) { (void)p; (void)b; (void)n; }

static void skip_string(TSLexer *l, int quote) {
  while (!l->eof(l) && l->lookahead != quote && l->lookahead != '\n') {
    int c = l->lookahead;
    l->advance(l, false);
    if (c == '\\' && !l->eof(l) && l->lookahead != '\n') l->advance(l, false);
  }
  if (l->lookahead == quote) l->advance(l, false);
}

static bool scan_css(TSLexer *l) {
  unsigned depth = 0;
  bool any = false;
  while (!l->eof(l)) {
    int c = l->lookahead;
    if (c == '}' && depth == 0) break;
    l->advance(l, false);
    any = true;
    if (c == '"' || c == '\'') skip_string(l, c);
    else if (c == '{') depth++;
    else if (c == '}') depth--;
    else if (c == '/' && l->lookahead == '*') {
      l->advance(l, false);
      while (!l->eof(l)) {
        int d = l->lookahead;
        l->advance(l, false);
        if (d == '*' && l->lookahead == '/') { l->advance(l, false); break; }
      }
    }
  }
  l->mark_end(l);
  l->result_symbol = CSS_TEXT;
  return any;
}

static bool is_word_char(int32_t c) { return iswalnum(c) || c == '_'; }

static void read_word(TSLexer *l, char *w) {
  int n = 0;
  while (is_word_char(l->lookahead)) {
    if (n < 15) w[n] = (char)l->lookahead;
    n++;
    l->advance(l, false);
  }
  w[n < 15 ? n : 0] = 0;
}

static bool in_list(const char *w, const char *const *list) {
  for (; *list; list++) if (!strcmp(w, *list)) return true;
  return false;
}

static const char *const GOES_ON[] = { "and", "or", "xor", "orelse", "else", "catch", 0 };
static const char *const STAGES[] = { "map", "filter", "flat_map", "skip_while", "take_while", "each", "any", "all",
  "count_where", "first_index", "last_index", "bisect", "fold", "scan", "zip", "skip", "take", "chain", "repeat",
  "sort", "min_by", "max_by", "first_where", "reduce", "partition", "collect", "group_by", "distinct_by", "batched",
  "windows", "sum", "fast_sum", "product", "count", 0 };

/**
 * Zero width: the end of a Wutu statement, as utu's scanner finds one (where
 * the grammar allows one: not after an operator, which takes an operand):
 * before a `}` or the end, or at a line break the next line does not go on
 * from. A line goes on that begins `.f` (not `.name =`, a property), `?.`, a
 * binary operator but `-` and `&` (a CSS rule) and a lone `=` (a hole), `{`,
 * `and`, `or`, `xor`, `orelse`, `else`, `catch`, or a stage with its capture.
 * The self-hosted parser's rule (selfhost/wutu_parse.utu, `wp_end`).
 */
static bool statement_end(TSLexer *l) {
  l->mark_end(l);
  l->result_symbol = STATEMENT_END;
  bool line = false;
  for (;;) {
    if (l->lookahead == '\n') { line = true; l->advance(l, true); }
    else if (iswspace(l->lookahead)) l->advance(l, true);
    else if (l->lookahead == '/') {
      l->advance(l, true);
      if (l->lookahead == '/') {
        while (!l->eof(l) && l->lookahead != '\n') l->advance(l, true);
      } else if (l->lookahead == '*') {
        l->advance(l, true);
        while (!l->eof(l)) {
          int32_t d = l->lookahead;
          l->advance(l, true);
          if (d == '*' && l->lookahead == '/') { l->advance(l, true); break; }
        }
      } else {
        // `/` that begins no comment divides: it goes on (`/=` does not).
        return line && l->lookahead == '=';
      }
    } else break;
  }
  if (l->eof(l) || l->lookahead == '}') return true;
  if (l->lookahead == ';' || !line) return false;
  int32_t c = l->lookahead;
  switch (c) {
    case '{': return false;
    case '|': return true;
    case '+': case '*': case '%': case '^':
      l->advance(l, false);
      return l->lookahead == '=';
    case '<': case '>':
      l->advance(l, false);
      if (l->lookahead == '=') return false;
      if (l->lookahead != c) return false;
      l->advance(l, false);
      if (c == '>' && l->lookahead == '>') l->advance(l, false);
      return l->lookahead == '=';
    case '.': {
      l->advance(l, false);
      if (!iswlower(l->lookahead) && l->lookahead != '_') return true;
      // `.name = …` is a property; `.name(…)` and `.name` go on.
      while (is_word_char(l->lookahead) || l->lookahead == '-') l->advance(l, false);
      while (l->lookahead == ' ' || l->lookahead == '\t') l->advance(l, false);
      if (l->lookahead != '=') return false;
      l->advance(l, false);
      return l->lookahead != '=';
    }
    case '?': l->advance(l, false); return l->lookahead != '.';
    case '=': case '!': l->advance(l, false); return l->lookahead != '=';
  }
  if (!is_word_char(c)) return true;
  char w[16];
  read_word(l, w);
  if (in_list(w, GOES_ON)) return false;
  if (!in_list(w, STAGES)) return true;
  while (l->lookahead == ' ' || l->lookahead == '\t') l->advance(l, true);
  if (l->lookahead == '|') return false;
  if (l->lookahead != '(') return true;
  if (!strcmp(w, "collect")) return false;
  int depth = 0;
  do {
    if (l->lookahead == '(') depth++;
    else if (l->lookahead == ')') depth--;
    l->advance(l, false);
  } while (depth > 0 && !l->eof(l) && l->lookahead != '\n');
  while (l->lookahead == ' ' || l->lookahead == '\t') l->advance(l, true);
  return l->lookahead != '|';
}

bool tree_sitter_wutu_external_scanner_scan(void *p, TSLexer *l, const bool *valid) {
  (void)p;
  if (valid[DSL_OPEN] && valid[DSL_TEXT] && valid[DSL_CLOSE]) return false;
  if (valid[CSS_TEXT]) return scan_css(l);
  if (valid[STATEMENT_END] && !valid[DSL_OPEN] && !valid[DSL_TEXT] && !valid[DSL_CLOSE]) return statement_end(l);
  if (valid[DSL_OPEN]) {
    while (iswspace(l->lookahead)) l->advance(l, true);
    if (l->lookahead != '/') return false;
    l->advance(l, false);
    if (l->lookahead != '\\') return false;
    l->advance(l, false);
    l->mark_end(l);
    l->result_symbol = DSL_OPEN;
    return true;
  }
  if (!valid[DSL_TEXT] && !valid[DSL_CLOSE]) return false;
  unsigned depth = 1;
  bool text = false;
  while (!l->eof(l)) {
    int c = l->lookahead;
    if (c == '\\') {
      l->mark_end(l);
      l->advance(l, false);
      if (l->lookahead == '/') {
        if (depth == 1) {
          if (text) { l->result_symbol = DSL_TEXT; return valid[DSL_TEXT]; }
          l->advance(l, false);
          l->mark_end(l);
          l->result_symbol = DSL_CLOSE;
          return valid[DSL_CLOSE];
        }
        depth--;
        l->advance(l, false);
      }
      text = true;
      continue;
    }
    l->advance(l, false);
    text = true;
    if (c == '"') skip_string(l, '"');
    else if (c == '/' && l->lookahead == '\\') { depth++; l->advance(l, false); }
  }
  return false;
}
