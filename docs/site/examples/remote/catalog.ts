import { defineEndpoints, endpoint } from "trama-forms/core";

// Simulated food catalog server with four families, each with its own subfamilies.
// It takes long enough to see the list loading.
type FamilyRow = { id: number; name: string; subfamilies: string[] };
const rows: FamilyRow[] = [
  { id: 1, name: "Beverages", subfamilies: ["Waters", "Juices", "Sodas"] },
  { id: 2, name: "Dairy", subfamilies: ["Milks", "Cheeses", "Yogurts"] },
  { id: 3, name: "Bakery", subfamilies: ["Breads", "Cookies", "Cakes"] },
  { id: 4, name: "Frozen foods", subfamilies: ["Ice creams", "Frozen vegetables"] },
];

const wait = (milliseconds: number, signal: AbortSignal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

// Both lists arrive complete and are searched locally. subfamilies receives the family IDs
// and returns their subfamilies. The second subfamily of Dairy has ID 22.
export const catalog = defineEndpoints({
  families: endpoint.list(async ({ signal }) => {
    await wait(300, signal);
    return rows.map((row) => ({ value: row.id, label: row.name }));
  }),
  subfamilies: endpoint.list(async ({ signal }, { families }: { families: number[] }) => {
    await wait(600, signal);
    return rows
      .filter((row) => families.includes(row.id))
      .flatMap((row) =>
        row.subfamilies.map((name, index) => ({ value: row.id * 10 + index + 1, label: name })),
      );
  }),
});
