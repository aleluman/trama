// Simulated server for the Submission page, not a real service. Saving takes 2 seconds,
// long enough to keep editing. It assigns a number to the voucher and an ID to each line
// that lacks one, in the order the lines arrive. The list price comes from the simulated
// server in Queries, which takes 2.5 seconds.
const wait = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export type VoucherPayload = {
  readonly customer: number;
  readonly price: number;
  readonly lines: readonly { readonly id: number | null; readonly quantity: number }[];
};
// The server identifies a rejection by the whole voucher, a parameter by name, or a
// line by index and column.
export type Rejection = {
  readonly ok: false;
  readonly general: readonly string[];
  readonly params: readonly { readonly name: "customer"; readonly message: string }[];
  readonly lines: readonly {
    readonly line: number;
    readonly column: "quantity";
    readonly message: string;
  }[];
};
// The saved result includes a warning for each line that ships in two deliveries.
export type Saved = {
  readonly ok: true;
  readonly number: number;
  readonly ids: readonly number[];
  readonly warnings: readonly { readonly line: number; readonly message: string }[];
};

const stock = 100;
const perDelivery = 50;
const maxLines = 3;
const suspended = 3;
let nextNumber = 1001;
let nextLine = 1;
export const saveVoucher = async (payload: VoucherPayload): Promise<Saved | Rejection> => {
  await wait(2000);
  const { customer, lines } = payload;
  const rejection: Rejection = {
    ok: false,
    general: lines.length > maxLines ? [`The server allows up to ${maxLines} lines`] : [],
    params:
      customer === suspended
        ? [{ name: "customer", message: "This customer’s credit is suspended" }]
        : [],
    lines: lines.flatMap(({ quantity }, line) =>
      quantity > stock
        ? [{ line, column: "quantity" as const, message: `Only ${stock} in stock` }]
        : [],
    ),
  };
  if (rejection.general.length + rejection.params.length + rejection.lines.length > 0)
    return rejection;
  return {
    ok: true,
    number: nextNumber++,
    ids: lines.map((line) => line.id ?? nextLine++),
    warnings: lines.flatMap(({ quantity }, line) =>
      quantity > perDelivery ? [{ line, message: "Ships in two deliveries" }] : [],
    ),
  };
};
