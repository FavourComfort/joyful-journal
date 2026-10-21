// Import loader for marzpay-webhook tests.
// Maps the Deno-style jsr:@supabase/supabase-js@2 import to the local mock module.
// Stubs the Deno-only edge-runtime type import (types only, no runtime effect).
//
// Usage:
//   node --test --import=./loader.mjs --experimental-strip-types ./index.test.mjs
//
// `--import` alone only executes this file; the actual resolve hooks live in
// `./loader-hooks.mjs`, registered below so the documented command works
// without a separate `--loader` flag.

import { register } from "node:module";

import "./test-shim.mjs";

register("./loader-hooks.mjs", import.meta.url);
