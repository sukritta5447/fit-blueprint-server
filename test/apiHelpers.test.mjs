import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUpdateClause,
  getPagination,
  parsePositiveId,
  pickBody,
} from "../utils/api.mjs";

test("parsePositiveId accepts safe positive integers", () => {
  assert.equal(parsePositiveId("42"), 42);
  assert.throws(() => parsePositiveId("0"), /positive integer/);
  assert.throws(() => parsePositiveId("1.5"), /positive integer/);
});

test("getPagination applies defaults and caps the limit", () => {
  assert.deepEqual(getPagination({}), { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(getPagination({ page: "3", limit: "500" }), {
    page: 3,
    limit: 100,
    offset: 200,
  });
});

test("pickBody rejects unknown and missing fields", () => {
  assert.deepEqual(pickBody({ name: "Training" }, ["name"], ["name"]), {
    name: "Training",
  });
  assert.throws(
    () => pickBody({ unexpected: true }, ["name"]),
    /Unknown field/,
  );
  assert.throws(() => pickBody({}, ["name"], ["name"]), /Missing required/);
});

test("buildUpdateClause creates parameterized assignments", () => {
  assert.deepEqual(buildUpdateClause({ name: "New", active: true }), {
    assignments: "name = $1, active = $2",
    values: ["New", true],
  });
  assert.throws(() => buildUpdateClause({}), /At least one field/);
});
