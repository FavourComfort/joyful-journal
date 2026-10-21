// Resolve hooks for marzpay-webhook tests.
// Registered by ./loader.mjs via module.register() so the documented
// `node --test --import=./loader.mjs ...` command picks them up
// (--import alone does not install resolve hooks).

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "jsr:@supabase/supabase-js@2") {
    return {
      url: new URL("./supabase-mock.js", context.parentURL).href,
      shortCircuit: true,
    };
  }
  if (specifier === "jsr:@supabase/functions-js/edge-runtime.d.ts") {
    // Type-only import — empty module at runtime.
    return {
      url: new URL("./edge-runtime-stub.js", context.parentURL).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
