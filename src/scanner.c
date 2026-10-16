#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <wctype.h>

// DSL delimiters form a balanced language-independent envelope. The payload is
// opaque to Utu; each registered DSL parses its own content and nested islands.
// A double-quoted string in a payload is text: a `/\` or `\/` in one is not a
// delimiter. A string ends at its closing quote or its line (see dsl-envelope.js).
void *tree_sitter_utu_external_scanner_create(void) { return NULL; }
void tree_sitter_utu_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_utu_external_scanner_serialize(void *p, char *b) { (void)p; (void)b; return 0; }
void tree_sitter_utu_external_scanner_deserialize(void *p, const char *b, unsigned n) { (void)p; (void)b; (void)n; }
bool tree_sitter_utu_external_scanner_scan(void *p, TSLexer *l, const bool *valid) {
  (void)p;
  if (!valid[0]) return false;
  while (iswspace(l->lookahead)) l->advance(l, true);
  if (l->lookahead != '/') return false;
  l->advance(l, false);
  if (l->lookahead != '\\') return false;
  l->advance(l, false);
  unsigned depth = 1;
  while (!l->eof(l)) {
    int c = l->lookahead;
    l->advance(l, false);
    if (c == '"') {
      while (!l->eof(l) && l->lookahead != '"' && l->lookahead != '\n') {
        int s = l->lookahead;
        l->advance(l, false);
        if (s == '\\' && !l->eof(l) && l->lookahead != '\n') l->advance(l, false);
      }
      if (l->lookahead == '"') l->advance(l, false);
    }
    else if (c == '/' && l->lookahead == '\\') { depth++; l->advance(l, false); }
    else if (c == '\\' && l->lookahead == '/') {
      l->advance(l, false);
      if (--depth == 0) { l->mark_end(l); l->result_symbol = 0; return true; }
    }
  }
  return false;
}
