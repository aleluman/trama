// Simulated inventory server. It waits long enough to move or remove a line while its
// request is in flight, and logs every incoming request for the demos to display.
type ProductRow = { id: string; name: string; unit: string };
type LotRow = { code: string; expires: string };

const fold = (text: string) => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();
const sizes = ["3 × 10", "3 × 20", "4 × 20", "4 × 30", "5 × 30", "5 × 40", "6 × 40", "6 × 50"];
const products: ProductRow[] = [
  ...sizes.map((size, i) => ({ id: `TOR-${i + 1}`, name: `Screw ${size} mm`, unit: "box" })),
  ...sizes.map((size, i) => ({ id: `TUE-${i + 1}`, name: `Nut ${size} mm`, unit: "box" })),
  { id: "TRN-1", name: "Bench screw-cutting lathe", unit: "unit" },
  { id: "TRL-1", name: "Assorted screws", unit: "kit" },
  { id: "ARA-1", name: "Flat washer", unit: "box" },
  { id: "ARA-2", name: "Lock washer", unit: "box" },
];
const prefixes: Record<string, string> = { central: "C", north: "N", port: "P" };

let requests: readonly { readonly id: number; readonly text: string }[] = [];
let count = 0;
const listeners = new Set<() => void>();
const record = (text: string) => {
  requests = [{ id: ++count, text }, ...requests].slice(0, 5);
  for (const listener of listeners) listener();
};
// The latest requests to reach the server, most recent first.
export const serverLog = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => requests,
};

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

// Eight products per page, with name searches that ignore case and accents.
export const fetchProducts = async (
  { search, page }: { search: string; page: number },
  signal: AbortSignal,
) => {
  record(`products “${search}”, page ${page}`);
  await wait(1500, signal);
  const found = products.filter((row) => fold(row.name).includes(fold(search)));
  return { rows: found.slice((page - 1) * 8, page * 8), more: page * 8 < found.length };
};

// Each warehouse has its own lots for the product, and Port has only one.
export const fetchLots = async (product: string, warehouse: string, signal: AbortSignal) => {
  record(`lots for ${product} in ${warehouse}`);
  await wait(800, signal);
  const number = [...product].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % 90;
  return (warehouse === "port" ? [1] : [1, 2, 3]).map((n): LotRow => ({
    code: `${prefixes[warehouse] ?? "X"}-${number + 10}${n}`,
    expires: `2027-0${n + (number % 6)}`,
  }));
};

// The queries demo can make the next price request fail.
let failures = 0;
export const failNextPrice = () => {
  failures += 1;
};

// Price requests received in the same task, such as during repricing, are answered together
// two seconds later, as if the server handled them in a batch. Their responses reach the
// session in a single task.
let round: Promise<unknown> | undefined;
const priceRound = (signal: AbortSignal) => {
  if (round === undefined) {
    round = new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    setTimeout(() => {
      round = undefined;
    });
  }
  const answered = round;
  return new Promise((resolve, reject) => {
    void answered.then(resolve);
    signal.addEventListener("abort", () => reject(signal.reason));
  });
};

// The price of a product on a price list. Wholesale gives a 15% discount.
export const fetchLinePrice = async (product: string, list: string, signal: AbortSignal) => {
  record(`price for ${product} on the ${list} price list`);
  await priceRound(signal);
  if (failures > 0) {
    failures -= 1;
    throw new Error("The pricing server is not responding");
  }
  const base = 100 * (products.findIndex((row) => row.id === product) + 1);
  return list === "wholesale" ? Math.round(base * 0.85) : base;
};

export type { LotRow, ProductRow };
