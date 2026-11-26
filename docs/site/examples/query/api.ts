// This guide's simulated server responds after a delay and can fail on request.
export type Customer = {
  name: string;
  tier: "basic" | "gold";
  credit: number;
};

const customers: Record<string, Customer> = {
  c1: { name: "North Hardware Store", tier: "gold", credit: 500_000 },
  c2: { name: "South Bookstore", tier: "basic", credit: 80_000 },
};

let failures = 0;
export const failNextRequest = () => {
  failures += 1;
};

export const fetchCustomer = async (id: string, signal: AbortSignal): Promise<Customer> => {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 800);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
  if (failures > 0) {
    failures -= 1;
    throw new Error("The server returned 503");
  }
  const customer = customers[id];
  if (customer === undefined) throw new Error(`Customer ${id} does not exist`);
  return { ...customer };
};
