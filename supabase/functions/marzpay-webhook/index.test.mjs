// Concurrency tests for marzpay-webhook Edge Function.
// Mocked dependencies only. No production data or real payment endpoints.
// Run with: node --test --import=./loader.mjs --experimental-strip-types ./index.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

const envVars = new Map([
  ["SUPABASE_URL", "http://localhost:54321"],
  ["SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key"],
  ["MARZPAY_WEBHOOK_SECRET", "test-secret"],
]);

globalThis.Deno = {
  env: {
    get: (key) => envVars.get(key) ?? undefined,
  },
};

if (!globalThis.crypto) {
  globalThis.crypto = {};
}
if (!globalThis.crypto.subtle) {
  globalThis.crypto.subtle = {
    importKey: async () => ({}),
    sign: async () => new ArrayBuffer(0),
  };
}

import { mockState } from "./supabase-mock.js";
import { default as webhook } from "./index.ts";

async function makeSignedRequest(secret, timestamp, body) {
  const rawBody = JSON.stringify(body);
  const signedPayload = `${timestamp}.${rawBody}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(signedPayload);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgData);
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const headers = new Headers({
    "content-type": "application/json",
    "x-marzpay-timestamp": timestamp,
    "x-marzpay-signature": `t=${timestamp},v1=${hex}`,
  });

  return new Request(
    "http://localhost:54321/functions/v1/marzpay-webhook",
    {
      method: "POST",
      headers,
      body: rawBody,
    },
  );
}

function pendingPayment(id = "payment-1", reference = "ref-1") {
  return {
    data: {
      id,
      booking_id: "booking-1",
      payment_status: "pending",
      amount: 1000,
      transaction_ref: reference,
    },
    error: null,
  };
}


// ---------------------------------------------------------------------------
// Tests: Completed -> Escrowed path
// ---------------------------------------------------------------------------

test("completed callback: first delivery updates payment to escrowed", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [{ data: [{ id: "payment-1" }], error: null }];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "completed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.payment_status, "escrowed");
  assert.strictEqual(body.payment_id, "payment-1");
  assert.strictEqual(body.received, true);
});

test("completed callback: invalid signature returns 401", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [{ data: [{ id: "payment-1" }], error: null }];

  const now = Date.now();
  const request = await makeSignedRequest("wrong-secret", String(now), {
    transaction: { reference: "ref-1", status: "completed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 401);
  assert.strictEqual(body.error, "Invalid webhook signature");
});

test("completed callback: database update error returns 500", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [{ data: null, error: { message: "DB down" } }];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "completed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 500);
  assert.strictEqual(body.error, "Failed to update payment");
});


// ---------------------------------------------------------------------------
// Tests: Failed/Cancelled -> Failed path
// ---------------------------------------------------------------------------

test("failed callback: first delivery updates payment to failed", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [{ data: [{ id: "payment-1" }], error: null }];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "failed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.payment_status, "failed");
  assert.strictEqual(body.payment_id, "payment-1");
});

test("cancelled callback: maps to failed status", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [{ data: [{ id: "payment-1" }], error: null }];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "cancelled" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.payment_status, "failed");
  assert.strictEqual(body.payment_id, "payment-1");
});

test("failed callback: database update error returns 500", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [{ data: null, error: { message: "DB down" } }];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "failed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 500);
  assert.strictEqual(body.error, "Failed to update payment");
});

test("failed callback: duplicate sequential (already terminal) returns already_processed", async () => {
  mockState.lookupQueue = [
    {
      data: {
        id: "payment-1",
        payment_status: "failed",
        booking_id: "booking-1",
        amount: 1000,
        transaction_ref: "ref-1",
      },
      error: null,
    },
  ];
  mockState.updateQueue = [];
  const now = Date.now();
  const requestBody = { transaction: { reference: "ref-1", status: "completed" } };

  const request = await makeSignedRequest("test-secret", String(now), requestBody);

  const response = await webhook.fetch(request);
  const responseBody = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(responseBody.already_processed, true);
  assert.strictEqual(responseBody.payment_id, "payment-1");

});
// ---------------------------------------------------------------------------
// Tests: Concurrency (simulated race condition)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests: Concurrency (simulated race condition)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Tests: Concurrency (simulated race condition)
// ---------------------------------------------------------------------------

test("concurrent duplicate callbacks: exactly one wins, other returns already_processed", async () => {
  mockState.lookupQueue = [pendingPayment(), pendingPayment()];
  mockState.updateQueue = [
    { data: [{ id: "payment-1" }], error: null },
    { data: [], error: null },
  ];

  const now = Date.now();
  const body = { transaction: { reference: "ref-1", status: "completed" } };

  const requestA = await makeSignedRequest("test-secret", String(now), body);
  const requestB = await makeSignedRequest("test-secret", String(now), body);

  const [responseA, responseB] = await Promise.all([
    webhook.fetch(requestA),
    webhook.fetch(requestB),
  ]);

  const bodyA = await responseA.json();
  const bodyB = await responseB.json();

  const successes = [bodyA, bodyB].filter((b) => b.success === true);
  const alreadyProcessed = [bodyA, bodyB].filter((b) => b.already_processed === true);

  assert.strictEqual(successes.length, 1, "exactly one request should succeed");
  assert.strictEqual(alreadyProcessed.length, 1, "exactly one request should report already_processed");

  const success = successes[0];
  assert.strictEqual(success.payment_status, "escrowed");
  assert.strictEqual(success.payment_id, "payment-1");

  const dup = alreadyProcessed[0];
  assert.strictEqual(dup.received, true);
  assert.strictEqual(dup.already_processed, true);
  assert.strictEqual(dup.payment_id, "payment-1");
  assert.strictEqual(dup.success, undefined);
});

test("concurrent duplicate callbacks: order-independent result", async () => {
  mockState.lookupQueue = [pendingPayment(), pendingPayment()];
  mockState.updateQueue = [
    { data: [], error: null },
    { data: [{ id: "payment-1" }], error: null },
  ];

  const now = Date.now();
  const body = { transaction: { reference: "ref-1", status: "completed" } };

  const requestA = await makeSignedRequest("test-secret", String(now), body);
  const requestB = await makeSignedRequest("test-secret", String(now), body);

  const [responseA, responseB] = await Promise.all([
    webhook.fetch(requestA),
    webhook.fetch(requestB),
  ]);

  const bodyA = await responseA.json();
  const bodyB = await responseB.json();

  const successes = [bodyA, bodyB].filter((b) => b.success === true);
  const alreadyProcessed = [bodyA, bodyB].filter((b) => b.already_processed === true);

  assert.strictEqual(successes.length, 1);
  assert.strictEqual(alreadyProcessed.length, 1);
});

// ---------------------------------------------------------------------------
// Tests: Edge cases
// ---------------------------------------------------------------------------

test("non-final status is ignored with 200", async () => {
  mockState.lookupQueue = [pendingPayment()];
  mockState.updateQueue = [];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "processing" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.received, true);
  assert.strictEqual(body.ignored, true);
  assert.strictEqual(body.reason, "Non-final transaction status");
});

test("missing transaction reference is ignored with 200", async () => {
  mockState.lookupQueue = [];
  mockState.updateQueue = [];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { status: "completed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.received, true);
  assert.strictEqual(body.ignored, true);
  assert.strictEqual(body.reason, "Missing transaction reference");
});

test("payment not found is ignored with 200", async () => {
  mockState.lookupQueue = [{ data: null, error: null }];
  mockState.updateQueue = [];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-999", status: "completed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.received, true);
  assert.strictEqual(body.ignored, true);
  assert.strictEqual(body.reason, "Payment not found");
});


test("failed callback: duplicate sequential returns already_processed", async () => {
  mockState.lookupQueue = [
    {
      data: {
        id: "payment-1",
        payment_status: "failed",
        booking_id: "booking-1",
        amount: 1000,
        transaction_ref: "ref-1",
      },
      error: null,
    },
  ];
  mockState.updateQueue = [];

  const now = Date.now();
  const request = await makeSignedRequest("test-secret", String(now), {
    transaction: { reference: "ref-1", status: "failed" },
  });

  const response = await webhook.fetch(request);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.received, true);
  assert.strictEqual(body.already_processed, true);
  assert.strictEqual(body.payment_id, "payment-1");
  assert.strictEqual(body.payment_status, "failed");
});



