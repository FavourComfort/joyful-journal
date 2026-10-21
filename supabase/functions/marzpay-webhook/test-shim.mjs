// Test-environment shims. Must run BEFORE ./index.ts is imported,
// because index.ts reads Deno.env at module top level.
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
