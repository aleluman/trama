// The relation declarations and their script extend the ordinary model only
// when enabled. Dedicated members can also receive a query response.
export const relationAt = (form, scope) => form.relations?.find((item) => item.scope === scope);
export const emptyDriver = ({ model }) => (model.kind === "select" ? null : "");
export const relationDefaults = (relation) =>
  relation === undefined
    ? {}
    : {
        left: 0,
        right: 0,
        base: 2,
        driver: emptyDriver(relation),
        ...(relation.scope === null ? { tick: 0 } : {}),
      };

const relationOf = (r, scope) => ({
  scope,
  name: "driver",
  model: {
    kind: r.pick(["text", "select"]),
    members: r.chance(0.5) ? ["left", "right"] : ["right", "left"],
    default: r.pick(["left", "right"]),
    destructure: r.chance(0.5),
    headerBase: scope !== null && r.chance(0.5),
    skip: r.pick([0, 3, 4]),
  },
});

const seeded = (relation) => ({ driver: emptyDriver(relation), left: 10, right: 11 });
const repeatDerived = (relation) => {
  const derived = relation.model.members.find((name) => name !== relation.model.default);
  return [derived, seeded(relation)[derived]];
};

const operationOf = (r, relations) => {
  const relation = r.pick(relations);
  const { scope, model } = relation;
  const [left, right] = model.members;
  const driver = r.pick([...model.members, emptyDriver(relation), emptyDriver(relation)]);
  const index = r.int(8);
  const number = () => r.int(6);
  const pair = () => [
    [left, number()],
    [right, number()],
  ];
  const roll = r.int(8);
  if (roll === 0) {
    const value = model.kind === "text" && r.chance(0.25) ? "unknown" : driver;
    return scope === null ? ["edit", "driver", value] : ["rowEdit", scope, index, "driver", value];
  }
  if (roll === 1) {
    const name = r.pick(model.members);
    return scope === null ? ["edit", name, number()] : ["rowEdit", scope, index, name, number()];
  }
  if (roll === 2 && model.headerBase) return ["edit", "base", number()];
  if (roll === 3 && scope !== null)
    return [
      "add",
      scope,
      1,
      index,
      [["driver", driver], ...r.pick([pair(), [[left, number()]], []])],
    ];
  const entries =
    roll === 2
      ? [["base", number()]]
      : roll === 4
        ? [...pair(), ["driver", driver]]
        : roll === 5
          ? [
              ["driver", driver],
              [r.pick(model.members), number()],
            ]
          : pair();
  return scope === null ? ["patchFields", entries] : ["patchFields", [], [scope, index, entries]];
};

const addRowScope = (form) => {
  const collection = { name: "l", numbers: [], async: false };
  form.collections.push(collection);
  form.entries.push({ scope: collection.name, each: [] });
  form.initial[collection.name] = [];
  return collection;
};

export const addRelations = (r, form) => {
  const { name: scope } = r.pick(form.collections) ?? addRowScope(form);
  const header = relationOf(r, null);
  const row = relationOf(r, scope);
  const relations = [header, row];
  form.relations = relations;
  Object.assign(form.initial, seeded(header));
  const records = form.initial[scope];
  records[0] = { ...records[0], ...seeded(row) };
  form.entries.push({ scope: null, name: header.name, properties: [["relation", header.model]] });
  form.entries
    .find((entry) => entry.scope === scope)
    .each.push({
      name: row.name,
      properties: [["relation", row.model]],
    });
  if (r.chance(0.5)) {
    const [derived] = repeatDerived(header);
    const branch = [["head", derived, ["const", 8]]];
    form.entries.push({
      scope: null,
      name: "tick",
      properties: [
        [
          "query",
          {
            e: ["head", "tick", false, 0],
            patch: { when: ["const", 0], branches: [branch, branch] },
          },
        ],
      ],
    });
  }
  const nested = [scope, 0, [repeatDerived(row)]];
  const opening = [
    ["patchFields", [["tick", 0], repeatDerived(header)], nested],
    ["patchFields", [["tick", 1]], nested],
    ["patchFields", [["tick", 2], repeatDerived(header)]],
  ];
  form.operations = form.operations.map(
    (op, index) => opening[index] ?? (r.chance(0.5) ? operationOf(r, relations) : op),
  );
};
