#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <wctype.h>

// DSL delimiters form a balanced language-independent envelope. The payload is
// opaque to Utu; each registered DSL parses its own content and nested islands.
// A double-quoted string in a payload is text: a `/\` or `\/` in one is not a
// delimiter. A string ends at its closing quote or its line (see dsl-envelope.js).
//
// Three tokens, so editors can inject a payload's own language into exactly
// its text: `/\` (hidden), the text between (`dsl_text`, absent when empty),
// and the `\/` that balances the opener (hidden).
enum { DSL_OPEN, DSL_TEXT, DSL_CLOSE };

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

bool tree_sitter_utu_external_scanner_scan(void *p, TSLexer *l, const bool *valid) {
  (void)p;
  // (Error recovery asks for every token at once: none of these is a guess.)
  if (valid[DSL_OPEN] && valid[DSL_TEXT] && valid[DSL_CLOSE]) return false;
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
