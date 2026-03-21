import { access } from "node:fs/promises";
import path from "node:path";

const rootMarkers = [
  "tree-sitter.json",
  "compiler/index.js",
  "cli_artifact/tree-sitter-utu.wasm",
];

let projectRootPromise: Promise<string> | undefined;

export async function resolveProjectPath(relativePath: string) {
  return path.join(await findProjectRoot(), relativePath);
}

async function findProjectRoot() {
  if (!projectRootPromise) {
    projectRootPromise = (async () => {
      const starts = uniquePaths([
        process.cwd(),
        import.meta.dir,
        path.resolve(import.meta.dir, ".."),
        path.resolve(import.meta.dir, "../.."),
      ]);

      for (const start of starts) {
        const match = await walkUpToRoot(start);
        if (match) {
          return match;
        }
      }

      throw new Error("Unable to locate the utu project root for cli_artifact.");
    })();
  }

  return projectRootPromise;
}

async function walkUpToRoot(start: string) {
  let current = path.resolve(start);

  while (true) {
    if (await hasRootMarkers(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

async function hasRootMarkers(candidate: string) {
  for (const marker of rootMarkers) {
    try {
      await access(path.join(candidate, marker));
    } catch {
      return false;
    }
  }

  return true;
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map(value => path.resolve(value)))];
}
