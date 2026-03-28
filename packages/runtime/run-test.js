export async function executeRuntimeTest(runtime, ordinal, { now = () => performance.now() } = {}) {
  const test = runtime.metadata.tests[ordinal];
  const start = now();
  try {
    await runtime.exports[test.exportName]();
    return {
      name: test.name,
      exportName: test.exportName,
      durationMs: now() - start,
      logs: [],
      passed: true,
    };
  } catch (error) {
    return {
      name: test.name,
      exportName: test.exportName,
      durationMs: now() - start,
      logs: [],
      error: JSON.stringify(error),
      passed: false,
    };
  }
}
