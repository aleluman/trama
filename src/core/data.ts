// Plain data: frozen copies in depth, structural equality, and the canonical
// form of the params that go into the keys of the loader.

// Read-only in depth.
export type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

// Plain data: plain objects, arrays, strings, numbers, booleans, null and
// undefined. An interface has no implicit index signature, so it does not fit
// PlainRecord: declare the data with a type alias or with Option.
export type PlainData =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly PlainData[]
  | { readonly [key: string]: PlainData };
export type PlainRecord = { readonly [key: string]: PlainData };

// The option every async field and endpoint works with.
export type OptionShape = { readonly value: string | number; readonly label: string };
export type PlainOption = OptionShape & PlainRecord;
// value and label are reserved: metadata that declares them, in any member of
// a union, fails here, with the message as the expected type of the property.
type Reserved = {
  readonly value?: 'option metadata cannot declare "value"';
  readonly label?: 'option metadata cannot declare "label"';
};
// An option with its metadata, read-only in depth.
export type Option<
  Metadata extends PlainRecord & Reserved = {},
  Value extends string | number = string | number,
> = DeepReadonly<{ value: Value; label: string } & Metadata>;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// The value of an own data property, read without running code; undefined
// for an accessor or a missing property.
export const own = (value: object, key: PropertyKey): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
};

// A string or a finite number: what identifies an option or a scope.
export const isKey = (value: unknown): value is string | number =>
  typeof value === "string" || Number.isFinite(value);

// Whether a value has the shape of an option: a plain object with its own
// value and its own label.
export const isOption = (value: unknown): value is OptionShape =>
  isPlainRecord(value) && isKey(own(value, "value")) && typeof own(value, "label") === "string";

// A name that JavaScript orders as an array index, as a number.
export const arrayIndex = (key: string) =>
  /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < 2 ** 32 - 1 ? Number(key) : undefined;

// What Trama already copied and froze as plain data. An output keeps it as it
// is; any other result is copied.
const copies = new WeakSet<object>();

// The first thing that is not plain data, and where it is. Only an issue of
// plain data takes a subject: "option must be plain data: a Date at "since"".
type Issue = Error & { readonly path: string; readonly plain: boolean };
const issues = new WeakSet<Error>();
const issue = (text: string, path: string, plain = false) => {
  const found = Object.assign(new Error(text), { path, plain });
  issues.add(found);
  return found;
};
const describeIssue = ({ message, path, plain }: Issue, subject: string) => {
  const at = path === "" ? "" : ` at "${path}"`;
  return plain ? `${subject} ${message}${at}` : `${message}${at}`;
};
const notPlain = (what: string, path: string) => issue(`must be plain data: ${what}`, path, true);
const article = (name: string) => (/^[aeiou]/iu.test(name) ? `an ${name}` : `a ${name}`);

// A check only reads; a copy returns a frozen copy in depth. The canonical
// copy also removes undefined properties and turns -0 into 0, and rejects what
// a key hashed as JSON would lose or misread: undefined inside arrays and own
// __proto__ and constructor keys.
type Mode = "check" | "copy" | "canonical";
const child = (path: string, key: string | number) =>
  typeof key === "number" ? `${path}[${key}]` : path === "" ? key : `${path}.${key}`;

const primitive = (value: unknown, path: string): Issue | undefined => {
  if (typeof value === "number")
    return Number.isFinite(value) ? undefined : notPlain("a non-finite number", path);
  if (typeof value === "function") return notPlain("a function", path);
  if (typeof value === "bigint" || typeof value === "symbol")
    return notPlain(`a ${typeof value}`, path);
};

// The kind of an object that is not plain, read without running its code.
const kindOf = (value: object) => {
  const prototype: unknown = Object.getPrototypeOf(value);
  const plain = Array.isArray(value)
    ? prototype === Array.prototype
    : prototype === null || prototype === Object.prototype;
  if (plain) return;
  const constructor =
    typeof prototype === "object" && prototype !== null ? own(prototype, "constructor") : undefined;
  const name: unknown = typeof constructor === "function" ? constructor.name : undefined;
  return typeof name === "string" && name !== "" ? article(name) : "an object with a prototype";
};

const walk = (
  value: unknown,
  path: string,
  mode: Mode,
  ancestors: Set<object>,
  memo: Map<object, object>,
): unknown => {
  if (typeof value !== "object" || value === null) {
    const found = primitive(value, path);
    if (found !== undefined) throw found;
    return mode === "canonical" && Object.is(value, -0) ? 0 : value;
  }
  if (copies.has(value) && mode !== "canonical") return value;
  const kind = kindOf(value);
  if (kind !== undefined) throw notPlain(kind, path);
  if (ancestors.has(value)) throw notPlain("a cycle", path);
  const done = memo.get(value);
  if (done !== undefined) return done;
  ancestors.add(value);
  const array = Array.isArray(value);
  const copy: object | undefined =
    mode === "check"
      ? undefined
      : array
        ? []
        : (Object.create(Object.getPrototypeOf(value) as object | null) as object);
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    const entry = entryOf(value, key, path, array, mode);
    if (entry === undefined) continue;
    const item = walk(entry.value, entry.at, mode, ancestors, memo);
    if (copy !== undefined)
      Object.defineProperty(copy, key, { value: item, enumerable: true, writable: true });
  }
  // A hole in an array reads as undefined.
  if (array && mode === "canonical" && Reflect.ownKeys(value).length - 1 < value.length)
    throw issue("undefined is not allowed inside arrays", child(path, firstHole(value)));
  ancestors.delete(value);
  if (copy === undefined) return value;
  if (array) Reflect.set(copy, "length", value.length);
  Object.freeze(copy);
  copies.add(copy);
  memo.set(value, copy);
  return copy;
};

// The value of a data property and where it is, or undefined when the
// canonical form drops it. Nothing it reads runs code.
const entryOf = (value: object, key: string | symbol, path: string, array: boolean, mode: Mode) => {
  if (typeof key === "symbol") throw notPlain("a symbol key", path);
  const index = array ? arrayIndex(key) : undefined;
  const at = child(path, index ?? key);
  if (array && index === undefined) throw notPlain("an array property", at);
  // JSON keys of Query lose an own __proto__, and read constructor to tell plain objects apart.
  if (mode === "canonical" && (key === "__proto__" || key === "constructor"))
    throw issue(`"${key}" is not allowed as a key`, path);
  const descriptor = Object.getOwnPropertyDescriptor(value, key) as PropertyDescriptor;
  if (!("value" in descriptor))
    throw notPlain(descriptor.get === undefined ? "a setter" : "a getter", at);
  if (descriptor.enumerable !== true) throw notPlain("a non-enumerable property", at);
  if (descriptor.value !== undefined || mode !== "canonical")
    return { value: descriptor.value as unknown, at };
  if (array) throw issue("undefined is not allowed inside arrays", at);
};
const firstHole = (array: readonly unknown[]) => {
  for (let index = 0; index < array.length; index += 1) if (!(index in array)) return index;
  return array.length;
};

// Walks a value, or returns why it is not plain data.
const inspect = (value: unknown, mode: Mode) => {
  try {
    return { value: walk(value, "", mode, new Set(), new Map()) };
  } catch (error) {
    if (error instanceof Error && issues.has(error)) return { issue: error as Issue };
    throw error;
  }
};

// Why a value is not plain data, as "<subject> must be plain data: a Date at
// "since"", or undefined when it is.
export const dataProblem = (value: unknown, subject: string): string | undefined => {
  const found = inspect(value, "check").issue;
  return found === undefined ? undefined : describeIssue(found, subject);
};

// A frozen copy in depth of plain data. Data Trama already copied is kept as
// it is.
export const copyData = (value: unknown, subject: string): unknown => {
  const inspected = inspect(value, "copy");
  if (inspected.issue !== undefined) throw new Error(describeIssue(inspected.issue, subject));
  return inspected.value;
};

// Whether Trama copied and froze a value as plain data.
export const isCopy = (value: unknown) =>
  typeof value === "object" && value !== null && copies.has(value);

// A frozen array of items that are primitives or copies already, kept as a
// copy without walking it again. The items must be plain data.
export const copiedArray = <T>(items: T[]): readonly T[] => {
  Object.freeze(items);
  copies.add(items);
  return items;
};

// The canonical copy of params, whose diagnostics start with prefix: equal
// params for Trama are equal in JSON, so a cache that hashes keys as JSON, as
// Query does, tells them apart.
export const canonicalParams = (value: unknown, prefix: string): unknown => {
  const inspected = inspect(value, "canonical");
  if (inspected.issue === undefined) return inspected.value;
  throw new Error(`${prefix}: ${describeIssue(inspected.issue, "result")}`);
};

// The frozen copy in depth of an output result. It admits more than plain
// data, as the outputs always did, and keeps its own diagnostics.
export const copyOutput = (value: unknown, ancestors = new Set<object>()): unknown => {
  if (typeof value === "function") throw new Error("Output results cannot contain functions");
  if (typeof value !== "object" || value === null || copies.has(value)) return value;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (
    prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype) &&
    prototype !== null
  )
    throw new Error("Output results require arrays or plain data objects");
  if (ancestors.has(value)) throw new Error("Output results cannot contain cycles");
  ancestors.add(value);
  const copy: object = Array.isArray(value) ? [] : (Object.create(prototype) as object);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor))
      throw new Error("Output results require data properties");
    Object.defineProperty(copy, key, {
      value: copyOutput(descriptor.value, ancestors),
      enumerable: descriptor.enumerable ?? false,
      configurable: !(key === "length" && Array.isArray(value)),
      writable: true,
    });
  }
  ancestors.delete(value);
  return Object.freeze(copy);
};

// Structural equality of data, which tells -0 from 0.
export const equal = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null)
    return false;
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  const keys = Reflect.ownKeys(left);
  return (
    keys.length === Reflect.ownKeys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && equal(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
};

// Whether two arrays hold the same items: the same objects, or as equal says.
export const sameItems = <T>(
  a: readonly T[],
  b: readonly T[],
  same: (item: T, index: number) => boolean = (item, index) => item === b[index],
) => a === b || (a.length === b.length && a.every((item, index) => same(item, index)));

// Defines an own data property. Assigning __proto__ would set the prototype
// instead of the property.
export const defineOwn = (target: object, name: PropertyKey, value?: unknown) =>
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });

// The own entries of an object, symbols included, read as a rule reads them:
// a getter runs.
export const ownEntries = (value: object) =>
  Reflect.ownKeys(value).map((key) => [key, Reflect.get(value, key)] as const);

// A value as diagnostics name it.
export const describe = (value: unknown) =>
  typeof value === "string"
    ? JSON.stringify(value)
    : (typeof value === "object" && value !== null) || typeof value === "function"
      ? Object.prototype.toString.call(value)
      : String(value);
