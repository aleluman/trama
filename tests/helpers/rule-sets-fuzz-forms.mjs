// The forms of the differential fuzz of rule sets: the model of
// rule-sets-fuzz.mjs compiled to functions, shared by a form and its twin,
// the rules of each piece of its sequence, and each case of the fuzz.
import { atomsOf, flags, formOf, piecesOf } from "./rule-sets-fuzz.mjs";
import { addRelations, relationAt, relationDefaults } from "./relation-fuzz.mjs";

const valueOf = (e, values, tools) => {
  const source = (peek) =>
    peek && tools.peek !== undefined ? (tools.peek.values ?? tools.peek) : (tools.values ?? values);
  switch (e[0]) {
    case "omit":
      return;
    case "self": {
      const own = values[e[1]];
      return typeof own === "number" ? own : (own?.length ?? 0);
    }
    case "before": {
      const before = tools.before;
      return valueOf(e[1], before.row ?? before, { ...tools, values: before.values ?? before });
    }
    case "const":
      return e[1];
    case "context":
      return tools.context?.k ?? 0;
    case "row":
      return ((e[2] && tools.peek !== undefined ? tools.peek.row : values)[e[1]] ?? 0) + e[3];
    case "head":
      return (source(e[2])[e[1]] ?? 0) + e[3];
    default: {
      const rows = source(e[3])[e[1]] ?? [];
      if (e[0] === "len") return rows.length;
      if (e[0] === "first") return rows[0]?.[e[2]] ?? 0;
      return rows.reduce((sum, row) => sum + (row[e[2]] ?? 0), 0);
    }
  }
};
const boom = () => {
  throw new Error("boom");
};
const patchOf = ({ when, branches }, values, tools) => {
  const patch = {};
  for (const [kind, target, name, e] of branches[valueOf(when, values, tools) > 1 ? 1 : 0]) {
    if (kind === "rows")
      patch[target] = Object.fromEntries(
        tools.rows[target].map((key) => [key, { [name]: valueOf(e, values, tools) }]),
      );
    else patch[target] = valueOf(name, values, tools);
  }
  return patch;
};

const relationFormula = (model, partner) => {
  const readPartner = model.destructure
    ? ({ [partner]: value }) => value
    : (values) => values[partner];
  return (values, tools) => {
    const leading = readPartner(values);
    const base = (model.headerBase ? tools.values : values).base;
    return base === model.skip ? undefined : leading + base;
  };
};

const relationOf = (model) => {
  const [first, second] = model.members;
  return {
    default: model.default,
    members: {
      [first]: relationFormula(model, second),
      [second]: relationFormula(model, first),
    },
  };
};

// The function of each atom, shared by a form and its twin.
const functionOf = ({ property, model, item }) => {
  if (property === "relation") return relationOf(model);
  if (property === "value")
    return (values, tools) => {
      const result = valueOf(model.e, values, tools);
      if (model.fail && result === 3) boom();
      return result === model.skip ? undefined : result;
    };
  if (property === "onChange" || property === "onEdit")
    return (values, tools) => patchOf(model, values, tools);
  if (flags.includes(property))
    return (values, tools) => {
      const result = valueOf(item.e, values, tools);
      if (item.fail && result === 3) boom();
      return (
        result > 1 &&
        (property === "hidden" || property === "required" || item.reason === "" || item.reason)
      );
    };
  if (property === "label" || property === "placeholder")
    return (values, tools) => {
      const result = valueOf(model.e, values, tools);
      return result === 0 ? undefined : `${property}${result}`;
    };
  if (property === "states")
    return (values, tools) => ({
      [model.target]: { hidden: valueOf(model.e, values, tools) > 1, label: "state" },
    });
  if (property === "params")
    return (values, tools) => {
      const n = valueOf(model.e, values, tools);
      return n === model.skip ? undefined : { n };
    };
  const query = {
    endpoint: "num",
    params: (values, tools) => ({ n: valueOf(model.e, values, tools) }),
  };
  if (model.patch === null) return query;
  return {
    ...query,
    patch: (result, tools) => {
      if (model.fail && result === 30) boom();
      return patchOf(model.patch, tools.row ?? tools.values, tools);
    },
  };
};
const functionsOf = (atoms) => new Map(atoms.map((atom) => [atom, functionOf(atom)]));

// The rules of a piece of the sequence, as an object written in its order. A
// flag that the model writes as a function stays one when the piece holds a
// single contribution of it.
const rulesOf = (atoms, functions) => {
  const rules = {};
  const single = [];
  for (const atom of atoms) {
    const entries = atom.scope === null ? rules : (rules[atom.scope] ??= { each: {} }).each;
    const entry = (entries[atom.name] ??= {});
    const declared = functions.get(atom);
    if (flags.includes(atom.property)) {
      (entry[atom.property] ??= []).push(declared);
      if (!atom.model.array) single.push([entry, atom.property]);
    } else entry[atom.property] = declared;
  }
  for (const [entry, flag] of single) if (entry[flag].length === 1) [entry[flag]] = entry[flag];
  return rules;
};

// The fields, collections and other sections of a form, shared by a form and
// its twin.
const relationFields = (field, declaration) => {
  if (declaration === undefined) return {};
  const { driver: empty, ...numeric } = relationDefaults(declaration);
  return {
    ...Object.fromEntries(
      Object.entries(numeric).map(([name, value]) => [name, field.number({ default: value })]),
    ),
    driver:
      empty === null
        ? field.select({
            options: declaration.model.members.map((value) => ({ value, label: value })),
          })
        : field.text(),
  };
};

const sectionsOf = (core, form) => {
  const { field, declareContext } = core;
  return {
    fields: {
      ...Object.fromEntries(
        form.numbers.map((name, i) => [name, field.number({ default: i === 0 ? 1 : 0 })]),
      ),
      t: field.text({ label: "Text", placeholder: "Type" }),
      a: field.async("items"),
      ...relationFields(field, relationAt(form, null)),
    },
    collections: Object.fromEntries(
      form.collections.map((collection) => [
        collection.name,
        {
          fields: {
            ...Object.fromEntries(
              collection.numbers.map((name) => [name, field.number({ default: 0 })]),
            ),
            ...(collection.async ? { fa: field.async("items") } : {}),
            ...relationFields(field, relationAt(form, collection.name)),
          },
        },
      ]),
    ),
    ...(form.context ? { context: declareContext() } : {}),
    ...(form.lock === null
      ? {}
      : {
          form: {
            readOnly: {
              value: (values, tools) => valueOf(form.lock.e, values, tools) > 1 && "lock",
              except: form.lock.except,
            },
          },
        }),
    ...(form.output === null
      ? {}
      : {
          outputs: ({ output }) => ({
            out: output((values, tools) => valueOf(form.output, values, tools ?? {})),
          }),
        }),
  };
};

// The defineForm and defineRules of a registry with the endpoints of the
// model: the options of an async field and the value of a query, by params.
export const coreOf = (trama) => {
  const registry = trama.defineEndpoints({
    items: trama.endpoint.list((_, { n }) =>
      Promise.resolve([0, 1].map((i) => ({ value: n * 10 + i, label: `Option ${n * 10 + i}` }))),
    ),
    num: trama.endpoint.value((_, { n }) => Promise.resolve((n ?? 1) * 10)),
  });
  return { ...trama, ...trama.createForms({ endpoints: [registry] }) };
};
// A case of the fuzz: a form, the partition of its rules into rule sets, by
// entries or by contributions, with false, null and undefined between them
// and maybe a last piece inline, and the twin written inline.
export const caseOf = (core, r, size) => {
  const form = formOf(r, size);
  if (size.relations) addRelations(r, form);
  if (size.synchronous)
    for (const entry of form.entries)
      for (const item of entry.each ?? [entry])
        item.properties = item.properties.filter(([property]) => property !== "query");
  const atoms = atomsOf(form);
  const functions = functionsOf(atoms);
  const mode = r.pick(["entries", "contributions", "contributions"]);
  const pieces = piecesOf(r, atoms, mode === "contributions");
  const inline = r.chance(0.5) ? pieces.pop() : [];
  const sections = sectionsOf(core, form);
  const { fields, collections, context } = sections;
  const include = [];
  for (const piece of pieces) {
    if (r.chance(0.2)) include.push(r.pick([false, null, undefined]));
    include.push(
      core.defineRules({ fields, collections, context, rules: rulesOf(piece, functions) }),
    );
  }
  const twin = core.defineForm({ ...sections, rules: rulesOf(atoms, functions) });
  const composed = core.defineForm({ ...sections, include, rules: rulesOf(inline, functions) });
  return { form, atoms, mode, pieces: [...pieces, inline], twin, composed };
};
// The kinds of destinations that writers of different sources share: header,
// row or header-to-rows.
const writes = (atom) => {
  if (atom.property === "value")
    return [[atom.scope === null ? "header" : "row", `${atom.scope}.${atom.name}`]];
  if (atom.property !== "onChange" && atom.property !== "onEdit") return [];
  return atom.model.branches
    .flat()
    .map(([kind, target, name]) =>
      kind === "rows"
        ? ["header-rows", `${target}.${name}`]
        : [atom.scope === null ? "header" : "row", `${atom.scope}.${target}`],
    );
};
export const crossedIn = (pieces, matches = () => true) => {
  const writers = new Map();
  pieces.forEach((piece, source) => {
    for (const atom of piece)
      for (const [kind, destination] of writes(atom)) {
        const found = writers.get(destination) ?? {
          kinds: new Set(),
          sources: new Set(),
          match: false,
        };
        found.kinds.add(kind);
        found.sources.add(source);
        found.match ||= matches(atom);
        writers.set(destination, found);
      }
  });
  const kinds = new Set();
  for (const { kinds: found, sources, match } of writers.values())
    if (match && sources.size > 1) for (const kind of found) kinds.add(kind);
  return kinds;
};
