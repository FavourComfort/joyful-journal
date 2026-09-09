import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

console.info("NINJAWO MarzPay webhook started");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("MARZPAY_WEBHOOK_SECRET");

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-marzpay-timestamp, x-marzpay-signature",
  "Content-Type": "application/json",
};

interface MarzPayWebhook {
  event_type?: string;

  transaction?: {
    reference?: string;
    status?: string;
  };

  collection?: {
    provider_transaction_id?: string;
  };

  metadata?: Record<string, unknown>;
}

async function createHmacSignature(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifySignature(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!webhookSecret) {
    console.error("MARZPAY_WEBHOOK_SECRET is missing");
    return false;
  }

  if (!timestamp || !signatureHeader) {
    return false;
  }

  /*
   * MarzPay signature format:
   *
   * X-MarzPay-Signature:
   * t=timestamp,v1=hex_signature
   *
   * Signed message:
   * timestamp.rawBody
   */

  const parts = signatureHeader.split(",");

  let receivedSignature = "";

  for (const part of parts) {
    const [key, value] = part.split("=");

    if (key === "v1") {
      receivedSignature = value;
    }
  }

  if (!receivedSignature) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const expectedSignature = await createHmacSignature(
    webhookSecret,
    signedPayload,
  );

  return safeEqual(
    expectedSignature,
    receivedSignature,
  );
}

export default {
  async fetch(req: Request): Promise<Response> {
    try {
      /*
       * MarzPay sends POST requests.
       */
      if (req.method !== "POST") {
        return new Response(
          JSON.stringify({
            error: "Method not allowed",
          }),
          {
            status: 405,
            headers: corsHeaders,
          },
        );
      }

      /*
       * IMPORTANT:
       * Read the raw body BEFORE parsing JSON.
       *
       * The raw body is required for webhook signature verification.
       */
      const rawBody = await req.text();

      /*
       * Verify MarzPay signature.
       */
      const timestamp = req.headers.get(
        "X-MarzPay-Timestamp",
      );

      const signature = req.headers.get(
        "X-MarzPay-Signature",
      );

      const signatureValid = await verifySignature(
        rawBody,
        timestamp,
        signature,
      );

      if (!signatureValid) {
        console.error("Invalid MarzPay webhook signature");

        return new Response(
          JSON.stringify({
            error: "Invalid webhook signature",
          }),
          {
            status: 401,
            headers: corsHeaders,
          },
        );
      }

      /*
       * Parse webhook JSON.
       */
      let payload: MarzPayWebhook;

      try {
        payload = JSON.parse(rawBody);
      } catch {
        return new Response(
          JSON.stringify({
            error: "Invalid JSON payload",
          }),
          {
            status: 400,
            headers: corsHeaders,
          },
        );
      }

      const reference =
        payload.transaction?.reference;

      const transactionStatus =
        payload.transaction?.status?.toLowerCase();

      const providerTransactionId =
        payload.collection?.provider_transaction_id;

      console.info(
        "MarzPay webhook received:",
        JSON.stringify({
          event_type: payload.event_type,
          reference,
          transactionStatus,
          providerTransactionId,
        }),
      );

      /*
       * A transaction reference is how we find
       * the NINJAWO payment.
       */
      if (!reference) {
        console.error(
          "Webhook does not contain transaction.reference",
        );

        /*
         * We return 200 so MarzPay does not endlessly retry
         * an unusable webhook.
         */
        return new Response(
          JSON.stringify({
            received: true,
            ignored: true,
            reason: "Missing transaction reference",
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      /*
       * Find the NINJAWO payment.
       */
      const { data: payment, error: paymentLookupError } =
        await supabase
          .from("payments")
          .select(
            "id, booking_id, payment_status, amount, transaction_ref",
          )
          .eq("transaction_ref", reference)
          .maybeSingle();

      if (paymentLookupError) {
        console.error(
          "Payment lookup failed:",
          paymentLookupError,
        );

        return new Response(
          JSON.stringify({
            error: "Payment lookup failed",
          }),
          {
            status: 500,
            headers: corsHeaders,
          },
        );
      }

      /*
       * Unknown references should not crash the webhook.
       */
      if (!payment) {
        console.warn(
          `No NINJAWO payment found for reference: ${reference}`,
        );

        return new Response(
          JSON.stringify({
            received: true,
            ignored: true,
            reason: "Payment not found",
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      /*
       * We only process final MarzPay statuses.
       */
      if (
        transactionStatus !== "completed" &&
        transactionStatus !== "failed" &&
        transactionStatus !== "cancelled"
      ) {
        console.info(
          `Ignoring non-final MarzPay status: ${transactionStatus}`,
        );

        return new Response(
          JSON.stringify({
            received: true,
            ignored: true,
            reason: "Non-final transaction status",
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      /*
       * IMPORTANT:
       *
       * Do not overwrite a payment that is already in a
       * terminal state.
       *
       * This also gives us basic webhook idempotency.
       */
      if (
        payment.payment_status === "escrowed" ||
        payment.payment_status === "released" ||
        payment.payment_status === "refunded" ||
        payment.payment_status === "failed"
      ) {
        console.info(
          `Payment ${payment.id} already processed with status ${payment.payment_status}`,
        );

        return new Response(
          JSON.stringify({
            received: true,
            already_processed: true,
            payment_id: payment.id,
            payment_status: payment.payment_status,
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      /*
       * ----------------------------------------------------------
       * COMPLETED
       * ----------------------------------------------------------
       *
       * pending -> escrowed
       *
       * This is the moment NINJAWO considers the customer's
       * payment successfully received.
       */
      if (transactionStatus === "completed") {
        const { error: updateError } =
          await supabase
            .from("payments")
            .update({
              payment_status: "escrowed",
              provider_transaction_id:
                providerTransactionId ?? null,
              payment_method: "marzpay",
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.id)
            .eq("payment_status", "pending");

        if (updateError) {
          console.error(
            "Failed to mark payment as escrowed:",
            updateError,
          );

          return new Response(
            JSON.stringify({
              error: "Failed to update payment",
            }),
            {
              status: 500,
              headers: corsHeaders,
            },
          );
        }

        console.info(
          `Payment ${payment.id} marked as escrowed`,
        );

        return new Response(
          JSON.stringify({
            received: true,
            success: true,
            payment_id: payment.id,
            payment_status: "escrowed",
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      /*
       * ----------------------------------------------------------
       * FAILED / CANCELLED
       * ----------------------------------------------------------
       *
       * pending -> failed
       */
      if (
        transactionStatus === "failed" ||
        transactionStatus === "cancelled"
      ) {
        const { error: updateError } =
          await supabase
            .from("payments")
            .update({
              payment_status: "failed",
              provider_transaction_id:
                providerTransactionId ?? null,
              payment_method: "marzpay",
              failure_reason:
                `MarzPay transaction ${transactionStatus}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", payment.id)
            .eq("payment_status", "pending");

        if (updateError) {
          console.error(
            "Failed to mark payment as failed:",
            updateError,
          );

          return new Response(
            JSON.stringify({
              error: "Failed to update payment",
            }),
            {
              status: 500,
              headers: corsHeaders,
            },
          );
        }

        console.info(
          `Payment ${payment.id} marked as failed`,
        );

        return new Response(
          JSON.stringify({
            received: true,
            success: true,
            payment_id: payment.id,
            payment_status: "failed",
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      return new Response(
        JSON.stringify({
          received: true,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    } catch (error) {
      console.error(
        "MarzPay webhook error:",
        error,
      );

      return new Response(
        JSON.stringify({
          error: "Webhook processing failed",
        }),
        {
          status: 500,
          headers: corsHeaders,
        },
      );
    }
  },
};







