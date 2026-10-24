export const MANILA_CLOCK = Symbol('MANILA_CLOCK');

export type ManilaClock = () => Date;

export const systemManilaClock: ManilaClock = () => new Date();

export function todayInManila(now: Date = systemManilaClock()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function isFutureManilaDate(value: string, now: Date): boolean {
  return value > todayInManila(now);
}
