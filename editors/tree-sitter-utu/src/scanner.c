#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <wctype.h>
#include <string.h>

// DSL delimiters form a balanced language-independent envelope. The payload is
// opaque to Utu; each registered DSL parses its own content and nested islands.
// A double-quoted string in a payload is text: a `/\` or `\/` in one is not a
// delimiter. A string ends at its closing quote or its line (see src/wutu/dsl-envelope.js).
//
// Three tokens, so editors can inject a payload's own language into exactly
// its text: `/\` (hidden), the text between (`dsl_text`, absent when empty),
// and the `\/` that balances the opener (hidden).
enum { DSL_OPEN, DSL_TEXT, DSL_CLOSE, STATEMENT_END };

void *tree_sitter_utu_external_scanner_create(void) { return NULL; }
void tree_sitter_utu_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_utu_external_scanner_serialize(void *p, char *b) { (void)p; (void)b; return 0; }
void tree_sitter_utu_external_scanner_deserialize(void *p, const char *b, unsigned n) { (void)p; (void)b; (void)n; }

/** Past a string whose opening quote was consumed: to its closing quote or its line. */
static void skip_string(TSLexer *l) {
  while (!l->eof(l) && l->lookahead != '"' && l->lookahead != '\n') {
    int c = l->lookahead;
    l->advance(l, false);
    if (c == '\\' && !l->eof(l) && l->lookahead != '\n') l->advance(l, false);
  }
  if (l->lookahead == '"') l->advance(l, false);
}

static bool is_word_char(int32_t c) { return iswalnum(c) || c == '_'; }

/** The word at the lexer (at most 15 letters; longer is no keyword), taken. */
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
 * Zero width: the end of a statement, where the grammar allows one (after
 * what cannot end a statement, `=` or `+`, it does not): before a `}` or
 * the end, or at a line break the next line does not go on from. A line
 * goes on that begins `.f` (not `.{`), `?.`, a binary operator but `-`
 * (`-o` goes on), `{`, `and`, `or`, `xor`, `orelse`, `else`, `catch`, or a
 * stage with its capture (`map |x|`, `fold(0) |a, x|`, `collect(T)`). The self-hosted parser's rule
 * (selfhost/parse.utu, `statement_end`).
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
      // A comment ends its line; `/` that begins no comment divides: it goes on
      // (`/=`, an assignment, does not).
      if (l->lookahead != '/') return line && l->lookahead == '=';
      while (!l->eof(l) && l->lookahead != '\n') l->advance(l, true);
    } else break;
  }
  if (l->eof(l) || l->lookahead == '}') return true;
  if (l->lookahead == ';' || !line) return false;
  int32_t c = l->lookahead;
  switch (c) {
    // (`\\` goes on a multiline string.)
    case '{': case '\\': return false;
    // An operator goes on; an assignment (`+=`, `>>=`) is a statement of its own.
    case '+': case '*': case '%': case '^': case '|':
      l->advance(l, false);
      return l->lookahead == '=';
    case '<': case '>':
      l->advance(l, false);
      if (l->lookahead == '=') return false;
      if (l->lookahead != c) return false;
      l->advance(l, false);
      if (c == '>' && l->lookahead == '>') l->advance(l, false);
      return l->lookahead == '=';
    case '.': l->advance(l, false); return l->lookahead == '{';
    case '?': l->advance(l, false); return l->lookahead != '.';
    case '=': case '!': l->advance(l, false); return l->lookahead != '=';
    case '-':
      l->advance(l, false);
      if (l->lookahead != 'o') return true;
      l->advance(l, false);
      return is_word_char(l->lookahead);
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
  // `fold(0) |a, x|` goes on; `fold(x)`, a call, does not.
  int depth = 0;
  do {
    if (l->lookahead == '(') depth++;
    else if (l->lookahead == ')') depth--;
    l->advance(l, false);
  } while (depth > 0 && !l->eof(l) && l->lookahead != '\n');
  while (l->lookahead == ' ' || l->lookahead == '\t') l->advance(l, true);
  return l->lookahead != '|';
}

bool tree_sitter_utu_external_scanner_scan(void *p, TSLexer *l, const bool *valid) {
  (void)p;
  // (Error recovery asks for every token at once: none of these is a guess.)
  if (valid[DSL_OPEN] && valid[DSL_TEXT] && valid[DSL_CLOSE]) return false;
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
  // The payload, up to the `\/` that balances its opener; or that `\/` itself.
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
    if (c == '"') skip_string(l);
    else if (c == '/' && l->lookahead == '\\') { depth++; l->advance(l, false); }
  }
  return false;
}
