// NINJAWO MarzPay Collection Handler
// -----------------------------------
// Called by the frontend after a booking + payment row are created.
// This function contacts the MarzPay gateway to initiate mobile-money
// collection.  MarzPay credentials are stored as Deno secrets and never
// exposed to the client.
//
// Flow:
//   1. Frontend calls supabase.functions.invoke("ninjawo-handler", { body: {...} })
//   2. This function calls https://wallet.wearemarz.com/api/v1/collect-money
//   3. MarzPay processes the collection and later POSTs to marzpay-webhook
//   4. marzpay-webhook settles the payment (escrowed / failed)

import "@supabase/functions-js/edge-runtime.d.ts";

const MARZPAY_BASE = "https://wallet.wearemarz.com/api/v1";

interface CollectMoneyRequest {
  payment_id: string;
  phone_number: string;
  amount: number;
  transaction_ref: string;
}

interface MarzPayResponse {
  success: boolean;
  message?: string;
  transaction_id?: string;
  status?: string;
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: CollectMoneyRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { payment_id, phone_number, amount, transaction_ref } = body;

  // Validate required fields
  if (!payment_id || !phone_number || !amount || !transaction_ref) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing required fields: payment_id, phone_number, amount, transaction_ref",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Read MarzPay secrets from environment
  const marzpayApiKey = Deno.env.get("MARZPAY_API_KEY");
  const marzpayMerchantId = Deno.env.get("MARZPAY_MERCHANT_ID");

  if (!marzpayApiKey || !marzpayMerchantId) {
    console.error("MarzPay secrets not configured. Set MARZPAY_API_KEY and MARZPAY_MERCHANT_ID.");
    return new Response(
      JSON.stringify({
        success: false,
        error: "Payment gateway not configured. Please contact support.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Call MarzPay collect-money endpoint
    const marzpayRes = await fetch(`${MARZPAY_BASE}/collect-money`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${marzpayApiKey}`,
        "X-Merchant-ID": marzpayMerchantId,
      },
      body: JSON.stringify({
        phone_number,
        amount,
        transaction_ref,
        currency: "UGX",
        description: `NINJAWO booking ${transaction_ref}`,
      }),
    });

    const marzpayData = await marzpayRes.json() as MarzPayResponse;

    if (!marzpayRes.ok || !marzpayData.success) {
      console.error("MarzPay collection failed:", marzpayData);
      return new Response(
        JSON.stringify({
          success: false,
          error: marzpayData.message || `MarzPay returned ${marzpayRes.status}`,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    // MarzPay accepted the collection request.
    // The actual settlement happens asynchronously via the marzpay-webhook.
    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment collection initiated. Awaiting confirmation.",
        transaction_ref,
        marzpay_transaction_id: marzpayData.transaction_id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Exception calling MarzPay:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to contact payment gateway. Please try again.",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
});
