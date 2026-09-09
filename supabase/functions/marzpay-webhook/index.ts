// NINJAWO MarzPay Webhook Receiver
// ---------------------------------
// MarzPay calls this endpoint when a mobile-money transaction reaches a
// terminal state (success / failed).  The webhook validates the incoming
// payload and settles the corresponding payment row.
//
// Settlement outcomes:
//   - success  -> payment.payment_status = 'escrowed'
//   - failed   -> payment.payment_status = 'failed'
//
// MarzPay credentials are stored as Deno secrets.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const marzpayWebhookSecret = Deno.env.get("MARZPAY_WEBHOOK_SECRET") ?? "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface MarzPayWebhookPayload {
  transaction_ref: string;
  status: "success" | "failed" | string;
  transaction_id?: string;
  reason?: string;
  signature?: string;
}

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: MarzPayWebhookPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { transaction_ref, status, transaction_id, reason } = body;

  if (!transaction_ref || !status) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: transaction_ref, status" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Look up the payment by transaction_ref
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, booking_id, payment_status, provider_amount, platform_fee")
    .eq("transaction_ref", transaction_ref)
    .single();

  if (paymentErr || !payment) {
    console.error("Payment not found for webhook:", transaction_ref, paymentErr);
    return new Response(
      JSON.stringify({ error: "Payment not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Idempotency: if already settled, acknowledge and skip
  if (payment.payment_status === "escrowed" || payment.payment_status === "failed") {
    console.log(`Payment ${payment.id} already in ${payment.payment_status} state. Ignoring webhook.`);
    return new Response(
      JSON.stringify({ received: true, message: "Already settled" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const paymentId = payment.id as string;
  const bookingId = payment.booking_id as string;

  try {
    if (status === "success") {
      // Move payment to 'escrowed' — funds are held securely
      const { error: updateErr } = await supabase
        .from("payments")
        .update({
          payment_status: "escrowed",
          provider_transaction_id: transaction_id ?? null,
          paid_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      if (updateErr) throw updateErr;

      console.log(`Payment ${paymentId} escrowed successfully for booking ${bookingId}`);
    } else {
      // Payment failed — mark as failed with reason
      const { error: updateErr } = await supabase
        .from("payments")
        .update({
          payment_status: "failed",
          failure_reason: reason || `MarzPay status: ${status}`,
          provider_transaction_id: transaction_id ?? null,
        })
        .eq("id", paymentId);

      if (updateErr) throw updateErr;

      console.log(`Payment ${paymentId} marked as failed for booking ${bookingId}`);
    }

    return new Response(
      JSON.stringify({ received: true, status }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Error settling payment:", err);
    return new Response(
      JSON.stringify({ error: "Failed to process webhook" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
