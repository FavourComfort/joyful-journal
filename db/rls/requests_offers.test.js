import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('./requests_offers.sql', import.meta.url), 'utf8');

test('offers unique index uses valid Postgres syntax', () => {
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS offers_provider_request_unique\s*ON public\.offers \(provider_id, request_id\);/);
  assert.doesNotMatch(sql, /ON public\.offers \(provider_id,and request_id\);/);
});
