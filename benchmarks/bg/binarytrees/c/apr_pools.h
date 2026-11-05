/* Not APR: the five apr_pools.h calls binarytrees gcc #2 uses, for Wasm (APR
 * itself is not built here). Semantics follow APR's unmanaged pools: memory comes
 * in 8 KiB blocks (APR's minimum allocator node), apr_pcalloc bump-allocates
 * 8-byte-aligned zeroed memory, apr_pool_clear keeps the blocks for reuse (APR
 * returns them to its allocator, which hands them back), apr_pool_destroy frees.
 */
#ifndef APR_POOLS_SHIM_H
#define APR_POOLS_SHIM_H
#include <stdlib.h>
#include <string.h>

#define APR_POOL_BLOCK 8192

typedef struct apr_block { struct apr_block *next; char *end; } apr_block;
typedef struct apr_pool_t { apr_block *first, *current; char *free; } apr_pool_t;

static inline apr_block *apr_block_new(void) {
  apr_block *b = malloc(APR_POOL_BLOCK);
  b->next = NULL;
  b->end = (char *)b + APR_POOL_BLOCK;
  return b;
}

static inline int apr_initialize(void) { return 0; }
static inline void apr_terminate(void) {}

static inline int apr_pool_create_unmanaged(apr_pool_t **pool) {
  apr_pool_t *p = malloc(sizeof *p);
  p->first = p->current = apr_block_new();
  p->free = (char *)(p->first + 1);
  *pool = p;
  return 0;
}

static inline void *apr_pcalloc(apr_pool_t *p, size_t size) {
  size = (size + 7) & ~(size_t)7;
  if (p->free + size > p->current->end) {
    if (!p->current->next) p->current->next = apr_block_new();
    p->current = p->current->next;
    p->free = (char *)(p->current + 1);
  }
  void *mem = p->free;
  p->free += size;
  return memset(mem, 0, size);
}

static inline void apr_pool_clear(apr_pool_t *p) {
  p->current = p->first;
  p->free = (char *)(p->first + 1);
}

static inline void apr_pool_destroy(apr_pool_t *p) {
  for (apr_block *b = p->first, *next; b; b = next) { next = b->next; free(b); }
  free(p);
}
#endif
