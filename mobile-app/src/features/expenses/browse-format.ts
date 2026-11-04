const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function readDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day, monthLabel: months[month - 1] };
}

export function formatBrowseDate(value: string): string {
  const { year, day, monthLabel } = readDate(value);
  return `${monthLabel} ${day}, ${year}`;
}

export function formatBrowseDateRange(fromDate: string, toDate: string): string {
  if (!fromDate && !toDate) return 'Dates';
  if (!toDate) return `From ${formatBrowseDate(fromDate)}`;
  if (!fromDate) return `Until ${formatBrowseDate(toDate)}`;
  if (fromDate === toDate) return formatBrowseDate(fromDate);

  const from = readDate(fromDate);
  const to = readDate(toDate);
  if (from.year !== to.year) return `${formatBrowseDate(fromDate)}–${formatBrowseDate(toDate)}`;
  if (from.month !== to.month) return `${from.monthLabel} ${from.day}–${to.monthLabel} ${to.day}, ${to.year}`;
  const lastDay = new Date(Date.UTC(to.year, to.month, 0)).getUTCDate();
  if (from.day === 1 && to.day === lastDay) return `${from.monthLabel} ${from.year}`;
  return `${from.monthLabel} ${from.day}–${to.day}, ${to.year}`;
}
