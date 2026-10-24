const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "PHP",
});

function formatMoney(amount: number) {
  return currencyFormatter.format(amount);
}

function formatExactMoney(amount: string) {
  const [integerPart, fractionalPart = "00"] = amount.split(".");
  const groupedIntegerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");

  return `₱${groupedIntegerPart}.${fractionalPart}`;
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

function moneyToCents(amount: number) {
  return Math.round(amount * 100);
}

function centsToMoney(amount: number) {
  return amount / 100;
}

export {
  centsToMoney,
  formatExactMoney,
  formatMoney,
  moneyToCents,
  roundMoney,
};
