type StatementDateValue = Date | string;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatImportDate(value: StatementDateValue) {
  const date =
    typeof value === "string"
      ? new Date(`${value}T00:00:00.000Z`)
      : value;
  return dateFormatter.format(date);
}

function formatTransactionHistoryPeriod(
  startDate: StatementDateValue | null,
  endDate: StatementDateValue,
) {
  const formattedEndDate = formatImportDate(endDate);
  if (!startDate) return formattedEndDate;
  return `${formatImportDate(startDate)} – ${formattedEndDate}`;
}

export { formatImportDate, formatTransactionHistoryPeriod };
