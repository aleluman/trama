// Simulated server for the queries. It takes 2.5 seconds, long enough to edit with the
// response in flight, and the quote request can fail on demand.
let failures = 0;
export const failNextQuote = () => {
  failures += 1;
};

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

// The list price for each customer.
export const fetchListPrice = async (customer: number, signal: AbortSignal) => {
  await wait(2500, signal);
  return 1000 + 100 * customer;
};

// A customer’s quote contains their list price and percentage discount.
export const fetchQuote = async (customer: number, signal: AbortSignal) => {
  await wait(2500, signal);
  if (failures > 0) {
    failures -= 1;
    throw new Error("The price list is not responding");
  }
  return { price: 1000 + 100 * customer, discount: 5 * customer };
};

// Simulated exchange rate in JPY per unit of foreign currency.
export const fetchExchangeRate = async (
  currency: "USD" | "EUR",
  date: string,
  signal: AbortSignal,
) => {
  await wait(800, signal);
  const base = currency === "USD" ? 150 : 170;
  return date === "2026-11-24" ? base + 2 : base;
};
