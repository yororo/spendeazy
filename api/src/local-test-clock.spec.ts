import { createLocalTestClock } from '../local-test/clock';

describe('createLocalTestClock', () => {
  it('uses the configured UTC timestamp for dates and epoch seconds', () => {
    const clock = createLocalTestClock({
      SPENDEAZY_TEST_CLOCK: '2026-09-19T12:00:00.000Z',
    });

    expect(clock.date()).toEqual(new Date('2026-09-19T12:00:00.000Z'));
    expect(clock.now()).toBe(1_789_819_200);
  });

  it('follows the system clock when no fixed timestamp is configured', () => {
    const clock = createLocalTestClock({}, () => 1_789_819_200_999);

    expect(clock.date()).toEqual(new Date('2026-09-19T12:00:00.999Z'));
    expect(clock.now()).toBe(1_789_819_200);
  });

  it('rejects a non-UTC or malformed timestamp', () => {
    expect(() =>
      createLocalTestClock({ SPENDEAZY_TEST_CLOCK: '2026-09-19' }),
    ).toThrow('SPENDEAZY_TEST_CLOCK must be an ISO-8601 UTC timestamp');
  });
});
