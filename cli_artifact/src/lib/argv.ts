import { CliUsageError } from "./errors.ts";

export type ParsedArgv = {
  cwd: string;
  raw: string[];
  command?: string;
  positionals: string[];
  flags: Map<string, string | true>;
};

export function parseArgv(argv: string[]): ParsedArgv {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];

  let index = 0;
  let command: string | undefined;

  if (argv[0] && !argv[0].startsWith("-")) {
    command = argv[0];
    index = 1;
  }

  while (index < argv.length) {
    const token = argv[index];

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      const raw = token.slice(2);
      const eqIndex = raw.indexOf("=");

      if (eqIndex !== -1) {
        const name = raw.slice(0, eqIndex);
        const value = raw.slice(eqIndex + 1);
        flags.set(name, value || true);
        index += 1;
        continue;
      }

      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        flags.set(raw, next);
        index += 2;
        continue;
      }

      flags.set(raw, true);
      index += 1;
      continue;
    }

    const shortFlags = token.slice(1);
    if (shortFlags.length > 1) {
      for (const name of shortFlags) {
        flags.set(name, true);
      }
      index += 1;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("-")) {
      flags.set(shortFlags, next);
      index += 2;
      continue;
    }

    flags.set(shortFlags, true);
    index += 1;
  }

  return {
    cwd: process.cwd(),
    raw: argv,
    command,
    positionals,
    flags,
  };
}

export function hasFlag(args: ParsedArgv, names: string[]) {
  return names.some(name => args.flags.has(name));
}

export function resolveFlagValue(args: ParsedArgv, names: string[]) {
  for (const name of names) {
    const value = args.flags.get(name);
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

export function requireStringFlag(args: ParsedArgv, names: string[]) {
  const value = resolveFlagValue(args, names);
  if (value !== undefined) {
    return value;
  }

  for (const name of names) {
    if (args.flags.get(name) === true) {
      throw new CliUsageError(`Flag "--${name}" needs a value.`);
    }
  }

  return undefined;
}

export function requireInputFile(args: ParsedArgv, commandName: string) {
  if (args.positionals.length === 0) {
    throw new CliUsageError(`\`${commandName}\` needs an input file.`);
  }

  return args.positionals[0];
}

export function requireNoExtraPositionals(args: ParsedArgv, commandName: string, expected: number) {
  if (args.positionals.length > expected) {
    throw new CliUsageError(`\`${commandName}\` received too many positional arguments.`);
  }
}
