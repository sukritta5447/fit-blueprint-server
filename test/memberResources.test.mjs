import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const stubUrl = 'data:text/javascript,' + encodeURIComponent('export default { query: null };');
const { default: pool } = await import(stubUrl);
let source = await readFile(new URL('../routes/memberResources.mjs', import.meta.url), 'utf8');
source = source.replace('from "express"', `from ${JSON.stringify(import.meta.resolve('express'))}`)
  .replace('import authenticate from "../middlewares/authenticate.mjs";', 'const authenticate = (req, res, next) => next();')
  .replace('from "../utils/api.mjs"', `from ${JSON.stringify(new URL('../utils/api.mjs', import.meta.url).href)}`)
  .replace('from "../utils/db.mjs"', `from ${JSON.stringify(stubUrl)}`);
const { nutritionLogsRouter } = await import('data:text/javascript,' + encodeURIComponent(source));
const handler = nutritionLogsRouter.stack.find(layer => layer.route?.methods.get).route.stack[0].handle;

test('member list queries run sequentially and preserve pagination and user scope', async () => {
  let active = 0;
  let peak = 0;
  const calls = [];
  pool.query = async (sql, values) => {
    calls.push({ sql, values });
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return sql.includes('COUNT(*)') ? { rows: [{ total: 3 }] } : { rows: [{ id: 9 }] };
  };
  let payload;
  const res = { status(code) { assert.equal(code, 200); return this; }, json(body) { payload = body; } };
  await handler({ query: { page: '2', limit: '2' }, auth: { userId: 'test-user' } }, res, error => { throw error; });
  assert.equal(peak, 1);
  assert.deepEqual(calls.map(call => call.values), [['test-user'], ['test-user', 2, 2]]);
  assert.deepEqual(payload, { data: [{ id: 9 }], pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } });
});

test('database failure reaches error middleware without starting another query', async () => {
  const failure = new Error('Connection unavailable');
  let calls = 0;
  pool.query = async () => { calls++; throw failure; };
  let forwarded;
  await handler({ query: {}, auth: { userId: 'test-user' } }, {}, error => { forwarded = error; });
  assert.equal(forwarded, failure);
  assert.equal(calls, 1);
});
