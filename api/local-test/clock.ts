export interface LocalTestClock {
  readonly now: () => number;
  readonly date: () => Date;
}

export function createLocalTestClock(
  environment: NodeJS.ProcessEnv = process.env,
  systemNow: () => number = () => Date.now(),
): LocalTestClock {
  const configuredClock = environment.SPENDEAZY_TEST_CLOCK?.trim();
  const fixedTime = configuredClock
    ? parseConfiguredClock(configuredClock)
    : undefined;
  const readTime = fixedTime === undefined ? systemNow : () => fixedTime;

  return {
    now: () => Math.floor(readTime() / 1000),
    date: () => new Date(readTime()),
  };
}

function parseConfiguredClock(value: string): number {
  const timestamp = Date.parse(value);
  const isUtcTimestamp =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
  if (!Number.isFinite(timestamp) || !isUtcTimestamp) {
    throw new Error(
      'SPENDEAZY_TEST_CLOCK must be an ISO-8601 UTC timestamp',
    );
  }

  return timestamp;
}
