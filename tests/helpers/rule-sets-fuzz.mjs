// The generator of the differential fuzz of rule sets: a serializable model
// of a form, its rules as one sequence of declarations, and the operations
// of a session; and the partitions of that sequence into rule sets. A form
// and the twin written inline share the functions the model compiles to.
//
// The sequence is that of rules written inline: entries of the header and of
// the each of collections, each with its properties in order, the four flags
// with their contributions. A partition cuts it into contiguous pieces, at
// the boundaries of entries or of any contribution, so that the composed form
// keeps the order of every declaration and its twin is the inline form.

// A deterministic PRNG.
export const random = (seed) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const int = (n) => Math.floor(next() * n);
  return { next, int, pick: (items) => items[int(items.length)], chance: (p) => next() < p };
};

export const flags = ["disabled", "readOnly", "hidden", "required"];
const reasons = ["r0", "r1", ""];

// An expression reads the form: a constant, a field of the header or of its
// own row, read or peeked, an aggregate of a collection, or the context.
const expression = (r, scope, except) => {
  const roll = r.next();
  if (roll < 0.1) return ["const", r.int(3)];
  if (roll < 0.18 && scope.context) return ["context"];
  if (roll < 0.3 && scope.collections.length > 0) {
    const collection = r.pick(scope.collections);
    return [
      r.pick(["sum", "len", "first"]),
      collection.name,
      r.pick(collection.numbers),
      r.chance(0.2),
    ];
  }
  if ("row" in scope && r.chance(0.55)) {
    const name = r.pick(scope.row.numbers.filter((other) => other !== except));
    if (name !== undefined) return ["row", name, r.chance(0.25), r.int(2)];
  }
  const name = r.pick(scope.numbers.filter((other) => other !== except)) ?? scope.numbers[0];
  return ["head", name, r.chance(0.25), r.int(2)];
};
// A patch writes numbers: header fields, a field of every row of a collection
// from the header, or fields of its own row, on one of two branches.
const patchModel = (r, scope, self, event) => {
  const input = (source, except, writing) => {
    if (event && writing && r.chance(0.1)) return ["omit"];
    if (event === "onEdit" && r.chance(0.2)) return ["self", self];
    if (event && r.chance(0.35)) return ["before", expression(r, source, null)];
    return expression(r, source, except);
  };
  const branch = () =>
    Array.from({ length: 1 + r.int(2) }, () => {
      if ("row" in scope)
        return [
          "row",
          r.pick(scope.row.numbers.filter((name) => name !== self)) ?? self,
          input(scope, self, true),
        ];
      if (scope.collections.length > 0 && r.chance(0.35)) {
        const collection = r.pick(scope.collections);
        return [
          "rows",
          collection.name,
          r.pick(collection.numbers),
          input({ ...scope, collections: [] }, self, true),
        ];
      }
      return [
        "head",
        r.pick(scope.numbers.filter((name) => name !== self)) ?? self,
        input(scope, self, true),
      ];
    });
  return { when: input(scope, null, false), branches: [branch(), branch()] };
};

// The properties of an entry, in a random order: a value formula, an event,
// flags with one or more contributions, a label, a placeholder, a states
// patch, the params of an async field and a query of a number field.
const propertiesOf = (r, scope, name, kind) => {
  const declared = [];
  const number = kind === "number";
  if (number && r.chance(0.4))
    declared.push([
      "value",
      { e: expression(r, scope, name), skip: r.int(4), fail: r.chance(0.08) },
    ]);
  if (kind !== "async" && r.chance(0.3)) {
    const event = scope.edits && r.chance(0.55) ? "onEdit" : "onChange";
    declared.push([event, patchModel(r, scope, name, scope.edits ? event : undefined)]);
  }
  for (const flag of flags)
    if (r.chance(0.18)) {
      const count = 1 + r.int(3);
      const items = Array.from({ length: count }, () => ({
        e: expression(r, scope, null),
        reason: r.pick(reasons),
        fail: r.chance(0.03),
      }));
      declared.push([flag, { items, array: count > 1 || r.chance(0.4) }]);
    }
  if (r.chance(0.15)) declared.push(["label", { e: expression(r, scope, null) }]);
  if (kind === "text" && r.chance(0.2))
    declared.push(["placeholder", { e: expression(r, scope, null) }]);
  if (!("row" in scope) && r.chance(0.08))
    declared.push([
      "states",
      { e: expression(r, scope, null), target: r.pick([...scope.numbers, "t"]) },
    ]);
  if (kind === "async")
    declared.push(["params", { e: expression(r, scope, null), skip: r.int(3) }]);
  if (number && r.chance(0.12))
    declared.push([
      "query",
      {
        e: expression(r, scope, null),
        patch: r.chance(0.5) ? patchModel(r, { ...scope, collections: [] }, name) : null,
        fail: r.chance(0.1),
      },
    ]);
  return declared.toSorted(() => r.next() - 0.5);
};

// A form: a header of numbers, a text and an async field; zero to two
// collections of numbers, one with an async field; maybe a context, a lock
// and an output; initial rows; and the operations of a session.
export const formOf = (r, size) => {
  const numbers = Array.from({ length: 2 + r.int(3) }, (_, i) => `h${i}`);
  const collections = Array.from({ length: r.int(3) }, (_, c) => ({
    name: ["l", "m"][c],
    numbers: Array.from({ length: 2 + r.int(3) }, (_item, i) => `f${i}`),
    async: c === 0 && r.chance(0.5),
  }));
  const context = r.chance(0.3);
  const scope = { numbers, collections, context, edits: size.edits };
  const entries = [];
  for (const name of [...numbers, "t", "a"]) {
    const kind = name === "t" ? "text" : name === "a" ? "async" : "number";
    entries.push({ scope: null, name, properties: propertiesOf(r, scope, name, kind) });
  }
  for (const collection of collections) {
    const row = { ...scope, row: collection };
    const names = [...collection.numbers, ...(collection.async ? ["fa"] : [])];
    const each = names.map((name) => ({
      name,
      properties: propertiesOf(r, row, name, name === "fa" ? "async" : "number"),
    }));
    entries.push({ scope: collection.name, each: each.toSorted(() => r.next() - 0.5) });
  }
  const shuffled = entries.toSorted(() => r.next() - 0.5);
  return {
    numbers,
    collections,
    context,
    entries: shuffled,
    lock: r.chance(0.25)
      ? { e: expression(r, scope, null), except: r.chance(0.5) ? [r.pick(numbers)] : [] }
      : null,
    output: r.chance(0.4) ? expression(r, scope, null) : null,
    initial: Object.fromEntries(
      collections.map((collection) => [
        collection.name,
        Array.from({ length: r.int(size.rows + 1) }, () =>
          Object.fromEntries(
            collection.numbers.filter(() => r.chance(0.4)).map((name) => [name, r.int(4)]),
          ),
        ),
      ]),
    ),
    contextValue: { k: r.int(3) },
    operations: Array.from({ length: size.operations }, () => operationOf(r, numbers, collections)),
  };
};

const operationOf = (r, numbers, collections) => {
  const collection = collections.length > 0 ? r.pick(collections) : undefined;
  const roll = r.next();
  if (roll < 0.2) return ["edit", r.pick(numbers), r.int(5)];
  if (roll < 0.25) return ["edit", "t", r.pick(["", "x", "yy"])];
  if (roll < 0.4 && collection)
    return ["rowEdit", collection.name, r.int(8), r.pick(collection.numbers), r.int(5)];
  if (roll < 0.46 && collection)
    return [
      "patch",
      r.pick(numbers),
      r.int(5),
      collection.name,
      r.int(8),
      r.pick(collection.numbers),
      r.int(5),
    ];
  if (roll < 0.55 && collection)
    return [
      "add",
      collection.name,
      1 + r.int(2),
      r.int(8),
      collection.numbers.filter(() => r.chance(0.3)).map((name) => [name, r.int(4)]),
    ];
  if (roll < 0.6 && collection) return ["remove", collection.name, r.int(8)];
  if (roll < 0.65 && collection) return ["move", collection.name, r.int(8), r.int(8)];
  if (roll < 0.68) return ["reset"];
  if (roll < 0.72)
    return [
      "retry",
      r.pick(numbers),
      collection?.name,
      r.int(8),
      collection ? r.pick(collection.numbers) : undefined,
    ];
  if (roll < 0.86) return ["settle", r.int(12), r.chance(0.25) ? "reject" : "resolve"];
  if (roll < 0.94) return ["batch", r.int(12), r.int(12)];
  return ["stale", r.int(12)];
};

// The sequence of declarations of the inline rules, one atom per property,
// and one per contribution of a flag, in the order written.
export const atomsOf = (form) =>
  form.entries
    .flatMap((item) =>
      item.scope === null
        ? [[null, item.name, item.properties]]
        : item.each.map(({ name, properties }) => [item.scope, name, properties]),
    )
    .flatMap(([scope, name, properties], entry) =>
      properties.flatMap(([property, model]) =>
        flags.includes(property)
          ? model.items.map((item, index) => ({ entry, scope, name, property, model, item, index }))
          : [{ entry, scope, name, property, model }],
      ),
    );

// Cuts the atoms into contiguous pieces: at entry boundaries only, or at any
// atom. A cut never splits an atom, so a single property stays in one piece.
export const piecesOf = (r, atoms, anywhere) => {
  const pieces = [[]];
  atoms.forEach((atom, at) => {
    const boundary = at > 0 && (anywhere || atoms[at - 1].entry !== atom.entry);
    if (boundary && r.chance(0.3)) pieces.push([]);
    pieces.at(-1).push(atom);
  });
  return pieces;
};
