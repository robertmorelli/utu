// BG fannkuch-redux Node #5 (Andrey Filatkin, after Oleg Mazurov's Go), adapted:
// https://benchmarksgame-team.pages.debian.net/benchmarksgame/program/fannkuchredux-node-5.html
// Changes: single-threaded (worker_threads removed: the same 720 chunks run in
// order and are reduced as the main thread did); the top-level run -> bench(n),
// which returns the FNV-1a hash of the bytes the program printed.

/* The Computer Language Benchmarks Game
   https://salsa.debian.org/benchmarksgame-team/benchmarksgame/

   contributed by Andrey Filatkin
   based on Go source code by Oleg Mazurov
*/

const fact = [];

function fillFact(n) {
    fact[0] = 1;
    for (let i = 1; i <= n; i++) {
        fact[i] = fact[i - 1] * i;
    }
}

function fannkuch(n) {
    return function ({idxMin, idxMax}) {
        const p = [];
        const pp = [];
        const count = Array(n);

        // first permutation
        for (let i = 0; i < n; i++) {
            p[i] = i;
        }
        let idx = idxMin;
        for (let i = n - 1; i > 0; i--) {
            const d = div(idx, fact[i]);
            count[i] = d;
            idx = idx % fact[i];

            for (let j = 0; j < n; j++) {
                pp[j] = p[j];
            }

            for (let j = 0; j <= i; j++) {
                if (j + d <= i) {
                    p[j] = pp[j + d];
                } else {
                    p[j] = pp[j + d - i - 1];
                }
            }
        }

        let maxFlips = 1;
        let checkSum = 0;

        idx = idxMin;
        for (let sign = true; ; sign = !sign) {
            let first = p[0];
            if (first !== 0) {
                let flips = 1;
                if (p[first] !== 0) {
                    for (let j = 1; j < n; j++) {
                        pp[j] = p[j];
                    }
                    let p0 = first;
                    while (true) {
                        flips++;
                        let i = 1;
                        let j = p0 - 1;
                        while (i < j) {
                            const t = pp[i];
                            pp[i] = pp[j];
                            pp[j] = t;
                            i++;
                            j--;
                        }
                        const t = pp[p0];
                        pp[p0] = p0;
                        p0 = t;
                        if (pp[p0] === 0) {
                            break;
                        }
                    }
                }
                if (maxFlips < flips) {
                    maxFlips = flips;
                }
                if (sign) {
                    checkSum += flips;
                } else {
                    checkSum -= flips;
                }
            }

            idx++;
            if (idx === idxMax) {
                break;
            }

            // next permutation
            if (sign) {
                p[0] = p[1];
                p[1] = first;
            } else {
                const t = p[1];
                p[1] = p[2];
                p[2] = t;
                for (let k = 2; ; k++) {
                    count[k]++;
                    if (count[k] <= k) {
                        break;
                    }
                    count[k] = 0;
                    for (let j = 0; j <= k; j++) {
                        p[j] = p[j + 1];
                    }
                    p[k + 1] = first;
                    first = p[0];
                }
            }
        }

        return {maxFlips, checkSum};
    }
}

function div(val, by) {
    return (val - val % by) / by;
}

function fnv(h, s) {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

function bench(n) {
    fillFact(n);

    const nchunks = 720;
    let chunkSize = div((fact[n] + nchunks - 1), nchunks);
    chunkSize += chunkSize % 2;

    const tasks = [];
    const len = div((fact[n] + chunkSize - 1), chunkSize);
    for (let i = 0; i < len; i++) {
        const idxMin = chunkSize * i;
        const idxMax = Math.min(fact[n], idxMin + chunkSize);
        tasks.push({idxMin, idxMax});
    }

    let flips = 0;
    let chk = 0;

    const work = fannkuch(n);
    for (const task of tasks) {
        const {maxFlips, checkSum} = work(task);
        if (flips < maxFlips) {
            flips = maxFlips;
        }
        chk += checkSum;
    }

    return fnv(2166136261, `${chk}\nPfannkuchen(${n}) = ${flips}\n`);
}
