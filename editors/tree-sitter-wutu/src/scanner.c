#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <wctype.h>

// A DSL envelope inside a template's utu (`@name/\ … \/`), as utu's scanner
// reads one: `/\`, its text (strings in it are text), and the balancing `\/`.
// And `@document { … }`'s CSS: everything to its balancing `}`, past strings
// and comments.
enum { DSL_OPEN, DSL_TEXT, DSL_CLOSE, CSS_TEXT };

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

bool tree_sitter_wutu_external_scanner_scan(void *p, TSLexer *l, const bool *valid) {
  (void)p;
  if (valid[DSL_OPEN] && valid[DSL_TEXT] && valid[DSL_CLOSE]) return false;
  if (valid[CSS_TEXT]) return scan_css(l);
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
