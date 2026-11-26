import type { Contact, Customer } from "./endpoints.ts";
import type { OrderValues } from "./order.ts";

// Simulated server. Its responses have their own format and are adapted to the fields.
type ContactRow = { id: number; name: string; email: string };
type CustomerRow = { id: number; name: string; hint: string; contacts: ContactRow[] };
type OrderResponse = {
  client: CustomerRow;
  contact: number | null;
  lines: { quantity: number; unitPrice: number }[];
  netTotal: number | null;
  shipping: {
    country: "ES" | "MX" | "JP";
    city: string;
    note: string | null;
    date: string | null;
  };
  status: "draft" | "confirmed";
};

// Searches and email addresses ignore case and accents.
const fold = (text: string) => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();

// 60 synthetic customers, with ten names per trade. Some have no contacts.
const trades = ["Trading", "Distribution", "Hardware", "Bakery", "Bookshop", "Café"];
const suffixes = [
  "Atlas",
  "Prisma",
  "Compass",
  "Horizon",
  "Vertex",
  "The Oaks",
  "Lighthouse",
  "The Star",
  "North",
  "Órbita",
];
const hints = ["Deliver to the warehouse", "Accepts deliveries until 5:00 PM", "Call on arrival"];
const people = ["Ana", "Bruno", "Camila", "Diego", "Elena", "Felipe", "Gloria", "Héctor"];
const customers: CustomerRow[] = trades.flatMap((trade, t) =>
  suffixes.map((suffix, p) => {
    const id = t * suffixes.length + p + 1;
    return {
      id,
      name: `${suffix} ${trade}`,
      hint: hints[id % hints.length] ?? "",
      contacts: Array.from({ length: id % 3 }, (_, c) => {
        const name = people[(id + c) % people.length] ?? "Contact";
        return { id: id * 10 + c, name, email: `${fold(name)}@customer${id}.example` };
      }),
    };
  }),
);
const customer = (id: number) => customers.find((row) => row.id === id);

const orders: Record<string, Omit<OrderResponse, "client"> & { client: number }> = {
  "1001": {
    client: 1,
    contact: 10,
    lines: [{ quantity: 4, unitPrice: 2500 }],
    // The negotiated total differs from 4 × 2500 and is preserved on opening.
    netTotal: 9500,
    shipping: {
      country: "ES",
      city: "Barcelona",
      note: "Deliver to the warehouse",
      date: "2026-10-15",
    },
    status: "draft",
  },
  "1002": {
    client: 53,
    contact: null,
    lines: [{ quantity: 10, unitPrice: 1200 }],
    netTotal: null,
    // Without a saved delivery date, the order suggests today's date when it opens.
    shipping: { country: "JP", city: "Tokyo", note: null, date: null },
    status: "confirmed",
  },
};

let failures = 0;
export const failNextRequest = () => {
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

export const fetchOrder = async (id: string, signal: AbortSignal): Promise<OrderResponse> => {
  await wait(700, signal);
  if (failures > 0) {
    failures -= 1;
    throw new Error("Request timed out");
  }
  const found = orders[id];
  const client = found === undefined ? undefined : customer(found.client);
  if (found === undefined || client === undefined) throw new Error(`Order ${id} does not exist`);
  return structuredClone({ ...found, client });
};

// The server handles searches and returns 20 customers at a time.
export const fetchCustomers = async (
  { search, page }: { search: string; page: number },
  signal: AbortSignal,
) => {
  await wait(300, signal);
  const found = customers.filter((row) => fold(row.name).includes(fold(search)));
  return { rows: found.slice((page - 1) * 20, page * 20), more: page * 20 < found.length };
};

export const fetchContacts = async (id: number, signal: AbortSignal) => {
  await wait(250, signal);
  return structuredClone(customer(id)?.contacts ?? []);
};

// Each customer's list price. It takes long enough to edit the price while the
// response is in flight.
export const fetchPrice = async (id: number, signal: AbortSignal) => {
  await wait(1500, signal);
  return 1000 + 100 * id;
};

// Each row becomes the option the field stores as its value.
export const toContact = (row: ContactRow): Contact => ({
  value: row.id,
  label: row.name,
  email: row.email,
});
export const toCustomer = (row: CustomerRow): Customer => ({
  value: row.id,
  label: row.name,
  defaultContact: row.contacts[0] === undefined ? null : toContact(row.contacts[0]),
  deliveryHint: row.hint,
});

// Omitting the total when none is saved lets its formula calculate it on opening.
// Omitting the delivery date keeps the date suggested by the context defaults.
export const toOrderValues = (response: OrderResponse): Partial<OrderValues> => {
  const contact = response.client.contacts.find((row) => row.id === response.contact);
  return {
    customer: toCustomer(response.client),
    contact: contact === undefined ? null : toContact(contact),
    quantity: response.lines[0]?.quantity ?? null,
    price: response.lines[0]?.unitPrice ?? null,
    ...(response.netTotal === null ? {} : { total: response.netTotal }),
    country: response.shipping.country,
    city: response.shipping.city,
    includeNote: response.shipping.note !== null,
    note: response.shipping.note ?? "",
    ...(response.shipping.date === null ? {} : { deliveryDate: response.shipping.date }),
    confirmed: response.status === "confirmed",
  };
};
