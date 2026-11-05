/* BG binary-trees g++ #7 (Danial Klimkin; Martin Jambrek; after the Rust
 * programs), adapted for Wasm:
 * https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/binarytrees-gpp-7.html
 * Changes: single-threaded: std::for_each(std::execution::par, ...) and
 * std::transform_reduce(par, boost::counting_iterator...) become plain loops
 * (same order, same per-tree pools; boost is not needed), and thread_local
 * upperPool is one static pool. std::pmr monotonic_buffer_resource /
 * unsynchronized_pool_resource from Emscripten's libc++, as in the original.
 * main() -> extern "C" bench(n), which returns the FNV-1a hash of the bytes main()
 * printed (snprintf in place of std::cout: iostream would add ~100 KB).
 */

/* The Computer Language Benchmarks Game
 * https://salsa.debian.org/benchmarksgame-team/benchmarksgame/
 *
 * contributed by Danial Klimkin (C++)
 * contributed by the Rust Project Developers (Rust)
 * contributed by TeXitoi (Rust)
 * contributed by Cristi Cobzarenco (Rust)
 * contributed by Matt Brubeck (Rust)
 * contributed by Dmytro Ovdiienko
 * contributed by Martin Jambrek
 *
 */

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <memory_resource>
#include <vector>

using MemoryPool = std::pmr::monotonic_buffer_resource;

struct Node {
    Node *l, *r;

    int check() const
    {
        if (l)
            return l->check() + 1 + r->check();
        else
            return 1;
    }
};

inline static Node* make(const int d, MemoryPool& store)
{
    void* mem = store.allocate(sizeof(Node), alignof(Node));
    Node* root = new (mem) Node;
    if (d > 0) {
        root->l = make(d - 1, store);
        root->r = make(d - 1, store);
    } else {
        root->l = root->r = nullptr;
    }
    return root;
}

constexpr auto MIN_DEPTH = 4;

static uint32_t fnv(uint32_t h, const char *s, int len) {
    for (int i = 0; i < len; i++) { h ^= (unsigned char)s[i]; h *= 16777619u; }
    return h;
}

extern "C" __attribute__((export_name("bench"))) uint32_t bench(int n)
{
    uint32_t h = 2166136261u;
    char buf[128];
    const int max_depth = std::max(MIN_DEPTH + 2, n);
    const int stretch_depth = max_depth + 1;

    // Alloc then dealloc stretchdepth tree.
    {
        MemoryPool store;

        Node* c = make(stretch_depth, store);
        h = fnv(h, buf, snprintf(buf, sizeof buf, "stretch tree of depth %d\t check: %d\n", stretch_depth, c->check()));
    }

    MemoryPool long_lived_store;
    Node* long_lived_tree = make(max_depth, long_lived_store);

    // Used as std::vector<std::pair<depth, checksum>>
    std::vector<std::pair<int, int>> results((max_depth - MIN_DEPTH) / 2 + 1);

    for (size_t i = 0; i < results.size(); ++i) {
        results[i].first = i * 2 + MIN_DEPTH;
    }

    static std::pmr::unsynchronized_pool_resource upperPool;
    std::for_each(
        begin(results), end(results),
        [max_depth](auto& res) {
            int d = res.first;
            int iters = 1 << (max_depth - d + MIN_DEPTH);
            int sum = 0;
            for (int i = 0; i < iters; ++i) {
                MemoryPool pool { &upperPool};
                sum += make(d, pool)->check();
            }
            res.second = sum;
        });

    for (const auto& [d, c] : results) {
        h = fnv(h, buf, snprintf(buf, sizeof buf, "%d\t trees of depth %d\t check: %d\n", (1 << (max_depth - d + MIN_DEPTH)), d, c));
    }

    h = fnv(h, buf, snprintf(buf, sizeof buf, "long lived tree of depth %d\t check: %d\n", max_depth, long_lived_tree->check()));

    return h;
}
