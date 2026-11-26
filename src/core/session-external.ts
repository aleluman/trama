// The messages the application gives a session from outside its rules, as
// the response of its server: setErrors and setWarnings replace what a source
// gave, in one channel, with a list of messages, each with where it is. The
// list is read and checked whole before anything changes, and it publishes
// once, or not at all when nothing changes. The engine keeps what each source
// gives each destination, and withdraws it when the destination changes; the
// session keeps, per source, the order it was declared in and where its last
// list put messages, by names and keys, which is only where to look. A reset
// forgets the sources (see SessionState).
import { formScope, rowAddress, type Destination, type RowKey } from "./address.js";
import type { CompiledCollection } from "./collections.js";
import { rowIn } from "./commands.js";
import type { Compiled } from "./compiled.js";
import { describe, isPlainRecord, ownEntries } from "./data.js";
import type { FormDefinition } from "./definition.js";
import { knows, type KnownKeys } from "./known-keys.js";
import type { Engine, Publication } from "./engine.js";
import { fieldAt } from "./fields.js";
import type { SessionState } from "./notify.js";

type Store = Publication<FormDefinition>["store"];
type Placing = ReturnType<Engine<FormDefinition>["placing"]>;

// Where a message is, by the names the application gave: the form, a field of
// the header, a collection, a row of it or a field of that row.
type Spot = {
  readonly field: string | undefined;
  readonly collection: CompiledCollection | undefined;
  readonly key: RowKey | undefined;
};
type Place = Spot & { readonly message: string };
// A source: its number, in declaration order, the sequence of the last
// prepared that wrote it with from, and where its last list put messages in
// each channel, once per destination and without the texts, which the engine
// keeps.
type Source = {
  readonly id: number;
  seq: number;
  errors: readonly Spot[];
  warnings: readonly Spot[];
};
// The sources of a session by name, since opening or the last reset.
export type Sources = Map<string, Source>;
const commands = {
  errors: { name: "setErrors", guarded: "set errors of" },
  warnings: { name: "setWarnings", guarded: "set warnings of" },
} as const;
type Channel = keyof typeof commands;
const members = new Set(["message", "field", "collection", "key"]);
const noSpots: readonly Spot[] = [];

export const externals = <D extends FormDefinition>(
  state: SessionState<D>,
  compiled: Compiled,
  engine: Engine<D>,
  guard: (operation: string) => void,
  operate: (publication: Publication<D>) => void,
) => {
  const setter = (channel: Channel) => (name: unknown, issues: unknown, options?: unknown) => {
    const command = commands[channel].name;
    guard(commands[channel].guarded);
    if (typeof name !== "string" || name === "")
      throw new Error(`${command}: source must be a non-empty string`);
    const from = fromOf(command, options);
    if (!Array.isArray(issues)) throw new Error(`${command}: issues must be an array`);
    const { store } = state.published;
    const where = { compiled, store, known: state.known };
    const places = (issues as unknown[]).map((issue) => placeOf(command, where, issue));
    // A response to a prepared too old, or older than the one that last wrote
    // the source, replaces nothing.
    const placing = from === undefined ? undefined : engine.placing(from, command);
    const { sources } = state;
    const held = sources.get(name);
    if (from !== undefined && (placing === undefined || placing.seq < (held?.seq ?? 0)))
      return false;
    const { lists, placed } = located(store, places, placing);
    const source = held ?? { id: sources.size, seq: 0, errors: noSpots, warnings: noSpots };
    const before = source[channel].flatMap((place) => destinationOf(store, place) ?? []);
    const publication = engine.external(source.id, channel, lists, before);
    // The engine accepted: the source is declared, and remembers its list.
    sources.set(name, source);
    source[channel] = placed;
    if (placing !== undefined) source.seq = placing.seq;
    if (publication !== undefined) operate(publication);
    return true;
  };
  return { setErrors: setter("errors"), setWarnings: setter("warnings") };
};

// The messages of each destination, each once, in the order of the list, and
// where each destination is, once: not the rows that left, nor what changed
// after the prepared.
const located = (store: Store, places: readonly Place[], placing: Placing | undefined) => {
  const lists = new Map<Destination, string[]>();
  const placed: Spot[] = [];
  for (const place of places) {
    const destination = destinationOf(store, place);
    if (destination === undefined || placing?.changed(destination) === true) continue;
    const list = lists.get(destination);
    if (list === undefined) {
      lists.set(destination, [place.message]);
      const { field, collection, key } = place;
      placed.push({ field, collection, key });
    } else if (!list.includes(place.message)) list.push(place.message);
  }
  return { lists, placed };
};

// The options of a command: an optional prepared.
const fromOf = (command: string, options: unknown) => {
  if (options === undefined) return;
  if (!isPlainRecord(options)) throw new Error(`${command}: options must be an object`);
  for (const key of Object.keys(options))
    if (key !== "from") throw new Error(`${command}: unknown option ${describe(key)}`);
  return options.from;
};

// One issue, read once, with its names checked: a property left undefined is
// absent. A row that left is known by its key alone.
type Where = { readonly compiled: Compiled; readonly store: Store; readonly known: KnownKeys };
const placeOf = (command: string, { compiled, store, known }: Where, issue: unknown): Place => {
  if (!isPlainRecord(issue)) throw new Error(`${command}: each issue must be an object`);
  const read: Record<string, unknown> = {};
  for (const [name, value] of ownEntries(issue)) {
    if (typeof name !== "string" || !members.has(name))
      throw new Error(`${command}: issue has unknown property ${describe(name)}`);
    read[name] = value;
  }
  const { message, field, key } = read;
  if (typeof message !== "string" || message === "")
    throw new Error(`${command}: issue message must be a non-empty string`);
  if (read.collection === undefined) {
    if (key !== undefined) throw new Error(`${command}: a row key needs its collection`);
    return {
      message,
      field: field === undefined ? undefined : headerField(compiled, command, field),
      collection: undefined,
      key: undefined,
    };
  }
  const collection =
    typeof read.collection === "string" ? compiled.collections.get(read.collection) : undefined;
  if (collection === undefined)
    throw new Error(`${command}: collection ${describe(read.collection)} does not exist`);
  const of = `of "${collection.name}"`;
  if (field !== undefined && (typeof field !== "string" || !fieldAt(collection.fields, field)))
    throw new Error(`${command}: field ${describe(field)} ${of} does not exist`);
  if (key === undefined && field !== undefined)
    throw new Error(`${command}: a field ${of} needs its row key`);
  if (
    key !== undefined &&
    rowIn(store, collection, key) === undefined &&
    !knows(known, collection.name, key)
  )
    throw new Error(`${command}: key ${of} belongs to no row of this session`);
  return { message, field, collection, key: key as RowKey | undefined };
};

// A field of the header, by its name, or the diagnostic of a command.
export const headerField = (compiled: Compiled, command: string, name: unknown) => {
  if (typeof name !== "string" || fieldAt(compiled.fields, name) === undefined)
    throw new Error(`${command}: field ${describe(name)} does not exist`);
  return name;
};

// The destination of a place in the store, or undefined when its row left.
const destinationOf = (store: Store, place: Spot): Destination | undefined => {
  const { field, collection, key } = place;
  if (collection === undefined) return field ?? formScope;
  if (key === undefined) return collection.structure;
  const row = rowIn(store, collection, key);
  return row && (field === undefined ? row : rowAddress(row, field));
};
