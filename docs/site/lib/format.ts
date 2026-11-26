import type { Issue } from "trama-forms/core";

// Prints plain data as a compact object literal for the guide panels.
export const format = (value: unknown, indent = ""): string => {
  if (value instanceof Error) return `Error: ${value.message}`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value !== "object" || value === null) return String(value);
  const inner = `${indent}  `;
  const entries = Array.isArray(value)
    ? value.map((item) => format(item, inner))
    : Object.entries(value).map(([key, item]) => `${key}: ${format(item, inner)}`);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) return `${open}${close}`;
  const flat = Array.isArray(value) ? `[${entries.join(", ")}]` : `{ ${entries.join(", ")} }`;
  if (flat.length <= 64 && !flat.includes("\n")) return flat;
  return `${open}\n${entries.map((entry) => `${inner}${entry}`).join(",\n")}\n${indent}${close}`;
};

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// An issue can be on the form, a field, a collection, or a row.
export const located = ({ field, collection, key, message }: Issue) => {
  const place = [collection, key, field].filter((part) => part !== undefined).join(" › ");
  return place === "" ? message : `${place}: ${message}`;
};
