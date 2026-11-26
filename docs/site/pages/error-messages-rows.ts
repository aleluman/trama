// Messages about rows in the Errors and limits table, with their location and cause.
export const rowMessages: readonly (readonly [string, string, string])[] = [
  [
    "defineForm",
    'Collection "lines": expected { fields }',
    "A collection is not an object with fields. Also: must declare fields, fields must be an object, and unknown property.",
  ],
  [
    "defineForm",
    'Name "notes" is declared in fields and collections',
    "A header field and a collection share a name.",
  ],
  [
    "defineForm",
    'Field "product" of "lines" (async): define the form with the defineForm of createForms',
    'An async row field was used with defineForm from trama-forms/core. Also: unknown endpoint "x" and endpoint "unitPrice" gives a value; use an options or list endpoint.',
  ],
  [
    "defineForm",
    'Field "quantity" of "lines" params: number fields have no params',
    "params exists only on remote row fields. Also: formula must be a function.",
  ],
  [
    "defineForm",
    'Rules of collection "lines" each: unknown field "amout"',
    'each names a field the rows do not have. Also: Rules of collection "lines": unknown property "value", because the accepted keys are each, row, and collection.',
  ],
  [
    "defineForm",
    'Field "price" of "lines" query: unknown endpoint "x"',
    "A row query is checked in the same way as a header query, with its template's label. Also: is paged; use a value or list endpoint, unknown property, params must be a function, patch must be a function, and, with defineForm from trama-forms/core, define the form with the defineForm of createForms.",
  ],
  [
    "defineForm",
    'Form readOnly: unknown field "nots" of collection "lines" in except',
    'An exception names a field the rows do not have. Also: unknown collection "line" in except.',
  ],
  [
    "createSession, reset",
    'Collection "lines" initial[1]: unknown field "origin"',
    "A row in initial has an unknown field or an incompatible value. Rows are counted from 0.",
  ],
  [
    "edit",
    'Collection "lines" cannot be edited as a field; use row or patch',
    "edit names only header fields.",
  ],
  [
    "row, remove, move",
    'Collection "lines": unknown row key "r9"',
    "The key does not belong to a current row in that collection. It is from a removed row, another collection, or another session. Also: Unknown collection.",
  ],
  [
    "add",
    'Collection "lines" add[1]: unknown field "origin"',
    "A row in the batch has an unknown field or an incompatible value. No rows are added.",
  ],
  [
    "add, move",
    'Collection "lines" move: position 4 is out of range 0..3',
    "The position is out of range: 0 to n when adding, and 0 to n−1 when moving. Also: position must be an integer.",
  ],
  [
    "patch",
    'Patch: unknown row key "r9" in collection "lines"',
    "The patch names a key that does not belong to the collection, even if its value is undefined. Also: unknown field in the header or in a row.",
  ],
  [
    "handle.edit, handle.list",
    'Collection "lines": row "r3" was removed',
    "The handle's row no longer exists. If reset restores it, the handle works again.",
  ],
  [
    "handle.list",
    'Field "quantity" of "lines" (number) has no option list',
    'Only remote fields have lists. Also: Collection "lines": unknown field "x".',
  ],
  [
    "handle.retry",
    'Field "quantity" of "lines" has no query',
    "Only a row field with a query can be retried. Also: Cannot retry a session during its notification and the error for a removed row.",
  ],
  [
    "session.list",
    'Field "lot" belongs to the rows of "lines": use session.row("lines", key).list("lot")',
    "Request the option lists for a row field from its handle.",
  ],
  [
    "add, remove, move, patch",
    "Cannot add rows to a session during its notification",
    "A listener or a derived output ran an operation during session notification. Also: remove rows from, move rows in, and patch.",
  ],
  [
    "row rule",
    'Field "amount" of "lines" row "r3" value: formula failed: …',
    'A row rule threw. The diagnostic names the row by its key, never by its position. Row params fail in the same way: row "r3" params: incompatible result 5, expected a plain object or undefined.',
  ],
  [
    "row list",
    'Field "lot" of "lines" row "r3" list: request failed: …',
    "The request for a row option list failed. It stays in error and retry repeats the request.",
  ],
  [
    "row query",
    'Field "price" of "lines" row "r3" query: request failed: …',
    'A row query failed and remains in error in handle.getSnapshot().queries without writing. Also: patch failed, expected a patch object, response operation failed, and, without wrapping, unknown field "total" in patch, which names a header field or an unknown field.',
  ],
  [
    "header event",
    'Field "depot" onChange: unknown row key "r9" in collection "lines"',
    "An event patch names a key that does not belong to the collection. The prefix names onChange or onEdit. Also: collection in patch must be an object keyed by row.",
  ],
  [
    "query",
    'Field "price" query: patches cannot write collection "lines"',
    "A query patch cannot write rows yet. The query moves to error.",
  ],
];
