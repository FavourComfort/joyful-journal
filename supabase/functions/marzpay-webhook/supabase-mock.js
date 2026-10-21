// Mock for @supabase/supabase-js used in marzpay-webhook tests.
// Maps the jsr:@supabase/supabase-js@2 import to this mock module.
//
// The mock supports a queue-based result system:
//   - lookupQueue: results for .maybeSingle() calls (payment lookup)
//   - updateQueue: results for .update()...select("id") calls (payment update)
//
// Results are consumed in FIFO order, enabling deterministic tests for
// sequential and concurrent scenarios.

const mockState = {
  lookupQueue: [],
  updateQueue: [],
};

export function createClient(url, key) {
  return {
    from: (table) => {
      return {
        select: (cols) => {
          return {
            eq: (col, val) => {
              if (col === "transaction_ref") {
                // Payment lookup chain: ...eq("transaction_ref", ref).maybeSingle()
                return {
                  maybeSingle: () => {
                    const result =
                      mockState.lookupQueue.shift() || {
                        data: null,
                        error: null,
                      };
                    return Promise.resolve(result);
                  },
                };
              }
              // Update chain: ...eq("id", id).eq("payment_status", "pending").select("id")
              return {
                eq: (col2, val2) => {
                  return {
                    select: () => {
                      const result =
                        mockState.updateQueue.shift() || {
                          data: [],
                          error: null,
                        };
                      return Promise.resolve(result);
                    },
                  };
                },
              };
            },
          };
        },
        update: (values) => {
          return {
            eq: (col, val) => {
              return {
                eq: (col2, val2) => {
                  return {
                    select: () => {
                      const result =
                        mockState.updateQueue.shift() || {
                          data: [],
                          error: null,
                        };
                      return Promise.resolve(result);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

export { mockState };
