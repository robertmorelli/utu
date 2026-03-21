export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function formatError(error: unknown) {
  if (error instanceof CliUsageError) {
    return `Usage error: ${error.message}\nRun \`utu help\` for usage.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
