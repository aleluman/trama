// The params of each async field and of each query that has a params formula,
// by address: the name of a field of the header, or the address of a field of
// a row. A field or a query without a params formula sends {}. Only the state
// in force reads them, so a change writes what it evaluates in place once it
// commits, and their cost follows what changed; the opening and restore build
// them anew.
import type { Field } from "./address.js";
import type { ParamsFormula } from "./params.js";

// undefined while they suspend the lists of the field or its query. They are
// not published in the snapshot.
export type Params = ReadonlyMap<Field, object | undefined>;
export const noParams = Object.freeze({});
export const paramsAt = (params: Params, address: Field) =>
  params.has(address) ? params.get(address) : noParams;

// What an operation writes of the params: those of each formula it evaluates
// whose object changes, and the formulas of the rows it removes, whose params
// leave. The opening and restore write those of every formula, which replace
// the maps whole.
export type ParamsDelta = {
  readonly whole: boolean;
  readonly params: Map<Field, object | undefined>;
  readonly queryParams: Map<Field, object | undefined>;
  readonly removed: ParamsFormula[];
};
export const paramsDelta = (whole: boolean): ParamsDelta => ({
  whole,
  params: new Map(),
  queryParams: new Map(),
  removed: [],
});

// Applies a delta of a change to the maps in force.
export const applyParams = (
  delta: ParamsDelta,
  params: Map<Field, object | undefined>,
  queryParams: Map<Field, object | undefined>,
) => {
  for (const { kind, address } of delta.removed)
    (kind === "query" ? queryParams : params).delete(address);
  for (const [address, value] of delta.params) params.set(address, value);
  for (const [address, value] of delta.queryParams) queryParams.set(address, value);
};
