import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');
const paymentsService = fs.readFileSync(path.join(projectRoot, 'src/lib/services/payments.service.ts'), 'utf8');
const bookingsService = fs.readFileSync(path.join(projectRoot, 'src/lib/services/bookings.service.ts'), 'utf8');
const bookRoute = fs.readFileSync(path.join(projectRoot, 'src/routes/book.tsx'), 'utf8');

const escrowStatus = 'escrowed';
const releaseStatus = 'released';

test('escrow flow is modeled in payment and booking logic', () => {
  assert.match(paymentsService, new RegExp(escrowStatus, 'i'));
  assert.match(paymentsService, new RegExp(releaseStatus, 'i'));
  assert.match(paymentsService, /platform_fee/i);
  assert.match(bookingsService, /in_progress|completed|confirmed/i);
  assert.match(bookRoute, /escrow|release|confirm.*completion/i);
});
