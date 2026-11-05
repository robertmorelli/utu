/* BG binary-trees g++ #1 (Jon Harrop; Alex Mizrahi; Andreas Schäfer; aardsplat-guest),
 * adapted for Wasm:
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-gpp-1.html
 * Changes: single-threaded: make_iteration's 16 std::async tasks run in order
 * (same 16 spans, one boost::object_pool per span). Header-only Boost.
 * main() -> extern "C" bench(n), which returns the FNV-1a hash of the bytes main()
 * printed (snprintf in place of std::cout).
 */

/* The Computer Language Benchmarks Game
* https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
*
* Contributed by Jon Harrop
* Modified by Alex Mizrahi
* Modified by Andreas Schäfer
* Modified by aardsplat-guest
*  *reset*
*/

#include <stdio.h>
#include <stdint.h>
#include <algorithm>

#include <boost/pool/object_pool.hpp>

constexpr int threads{16};

struct Node {
   Node *l,*r;
   Node() : l(0),r(0) {}
   Node(Node *l,Node *r) : l(l),r(r) {}
   int check() const
   {
      if (l)
         return l->check() + 1 + r->check();
      else return 1;
   }
};

using Node_pool = boost::object_pool<Node>;

Node *make(int d,Node_pool& pool)
{
   if (d==0)
      return pool.construct();
   return pool.construct(make(d-1,pool),make(d-1,pool));
}

int make_iteration(int from,int to,int d,bool thread)
{
   int c{0};
   if (thread) {
      for (int j=0; j<threads; ++j) {
         int span{(to-from+1)/threads};
         c += make_iteration(from+span*j,span+span*j,d,false);
      }
   }
   else {
      Node_pool pool;
      for (int i=from; i<=to; ++i) {
         Node *a = make(d,pool);
         c += a->check();
      }
   }
   return c;
}

static uint32_t fnv(uint32_t h, const char *s, int len) {
    for (int i = 0; i < len; i++) { h ^= (unsigned char)s[i]; h *= 16777619u; }
    return h;
}

extern "C" __attribute__((export_name("bench"))) uint32_t bench(int n)
{
   uint32_t h = 2166136261u;
   char buf[128];
   int min_depth = 4,
      max_depth = std::max(min_depth+2, n),
      stretch_depth = max_depth+1;

   {
      Node_pool pool;
      Node *c = make(stretch_depth,pool);
      h = fnv(h, buf, snprintf(buf, sizeof buf, "stretch tree of depth %d\t check: %d\n", stretch_depth, c->check()));
   }

   Node_pool long_lived_pool;
   Node *long_lived_tree=make(max_depth,long_lived_pool);

   for (int d=min_depth; d<=max_depth; d+=2) {
      int iterations = 1 << (max_depth - d + min_depth);
      int   c=0;
      c = make_iteration(1,iterations,d,true);
      h = fnv(h, buf, snprintf(buf, sizeof buf, "%d\t trees of depth %d\t check: %d\n", iterations, d, c));
   }

   h = fnv(h, buf, snprintf(buf, sizeof buf, "long lived tree of depth %d\t check: %d\n", max_depth, long_lived_tree->check()));

   return h;
}
