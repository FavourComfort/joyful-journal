import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface PaymentRequest {
  phone_number: string;
  amount: number;
  reference: string;
  description?: string;
}

console.info("NINJAWO MarzPay handler started");

/**
 * MarzPay may answer with HTTP 2xx and still describe a business-level
 * rejection (a declined/invalid collection) rather than a transport error.
 *
 * Only field names already evidenced by this repository are read:
 *   - `success`  (boolean)
 *   - `status`   (string) — the marzpay-webhook Edge Function parses
 *     `transaction.status` from real MarzPay payloads (see its
 *     `MarzPayWebhook` interface).
 *
 * If neither field is present the result is treated as UNKNOWN and the
 * previous behaviour is preserved, so no assumption is invented about
 * response shapes this repository has not observed.
 */
const MARZPAY_FAILURE_STATUSES = new Set([
  "failed",
  "failure",
  "rejected",
  "declined",
  "cancelled",
  "canceled",
  "error",
]);

type MarzBusinessFailure = { status: string | null };

function detectMarzBusinessFailure(data: unknown): MarzBusinessFailure | null {
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;

  if (record.success === false) {
    return {
      status: typeof record.status === "string" ? record.status : null,
    };
  }

  // Collect only the status-bearing locations this repo already knows about.
  const candidates: unknown[] = [record.status];

  const dataField = record.data;
  if (typeof dataField === "object" && dataField !== null) {
    candidates.push((dataField as Record<string, unknown>).status);
  }

  const transactionField = record.transaction;
  if (typeof transactionField === "object" && transactionField !== null) {
    candidates.push((transactionField as Record<string, unknown>).status);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toLowerCase();
    if (MARZPAY_FAILURE_STATUSES.has(normalized)) {
      return { status: normalized };
    }
  }

  return null;
}

export default {
  fetch: withSupabase(
   { auth: "user" },
    async (req, ctx) => {
      // Allow browser requests from NINJAWO
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "authorization, x-client-info, apikey, content-type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          },
        });
      }

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Content-Type": "application/json",
      };

      try {
        // Only allow POST requests
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

        const body: PaymentRequest = await req.json();

        const {
          phone_number,
          amount,
          reference,
          description,
        } = body;

        // Validate required fields
        if (!phone_number) {
          return new Response(
            JSON.stringify({
              error: "phone_number is required",
            }),
            {
              status: 400,
              headers: corsHeaders,
            },
          );
        }

        if (!amount || amount <= 0) {
          return new Response(
            JSON.stringify({
              error: "amount must be greater than 0",
            }),
            {
              status: 400,
              headers: corsHeaders,
            },
          );
        }

        if (!reference) {
          return new Response(
            JSON.stringify({
              error: "reference is required",
            }),
            {
              status: 400,
              headers: corsHeaders,
            },
          );
        }

        // Get the MarzPay authorization from Supabase Secrets
        const marzAuthorization = Deno.env.get(
          "MARZPAY_AUTHORIZATION",
        );

        if (!marzAuthorization) {
          console.error("MARZPAY_AUTHORIZATION secret is missing");

          return new Response(
            JSON.stringify({
              error: "Payment service is not configured",
            }),
            {
              status: 500,
              headers: corsHeaders,
            },
          );
        }

        // IMPORTANT:
        // We will replace this with the real deployed webhook URL
        // once we create the webhook function.
        const callbackUrl =
          Deno.env.get("MARZPAY_CALLBACK_URL");

        if (!callbackUrl) {
          console.error("MARZPAY_CALLBACK_URL secret is missing");

          return new Response(
            JSON.stringify({
              error: "Payment callback is not configured yet",
            }),
            {
              status: 500,
              headers: corsHeaders,
            },
          );
        }

        // MarzPay expects multipart/form-data
        const formData = new FormData();

        formData.append("phone_number", phone_number);
        formData.append("amount", String(amount));
        formData.append("country", "UG");
        formData.append("reference", reference);
        formData.append(
          "description",
          description || "NINJAWO service payment",
        );
        formData.append("callback_url", callbackUrl);

        console.info(
          `Creating MarzPay collection: ${reference}`,
        );

        const marzResponse = await fetch(
          "https://wallet.wearemarz.com/api/v1/collect-money",
          {
            method: "POST",
            headers: {
              Authorization: marzAuthorization.startsWith("Basic ")
                ? marzAuthorization
                : `Basic ${marzAuthorization}`,
            },
            body: formData,
          },
        );

        const responseText = await marzResponse.text();

        let marzData: unknown;

        try {
          marzData = JSON.parse(responseText);
        } catch {
          marzData = {
            raw_response: responseText,
          };
        }

        console.info(
          `MarzPay response status: ${marzResponse.status}`,
        );

        if (!marzResponse.ok) {
          console.error("MarzPay payment failed:", marzData);

          return new Response(
            JSON.stringify({
              success: false,
              error: "Ninjawo payment request failed",
              details: marzData,
            }),
            {
              status: marzResponse.status,
              headers: corsHeaders,
            },
          );
        }

        /*
         * HTTP 2xx is NOT sufficient proof that a collection was started.
         * A business-level rejection must reach the caller as a failure so
         * that the client marks the payment failed instead of leaving it
         * silently stuck in 'pending'.
         *
         * A 502 is returned deliberately: the request to MarzPay itself
         * completed, but its outcome is a failure, and a 2xx here would be
         * indistinguishable from a successfully initiated payment.
         */
        const businessFailure = detectMarzBusinessFailure(marzData);

        if (businessFailure) {
          console.error(
            `MarzPay returned a business-level failure (status=${businessFailure.status ?? "unknown"}):`,
            marzData,
          );

          return new Response(
            JSON.stringify({
              success: false,
              error:
                "MarzPay declined the payment request. No payment was started.",
              details: marzData,
            }),
            {
              status: 502,
              headers: corsHeaders,
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: marzData,
          }),
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      } catch (error) {
        console.error("Payment handler error:", error);

        return new Response(
          JSON.stringify({
            success: false,
            error: "Unexpected payment error",
          }),
          {
            status: 500,
            headers: corsHeaders,
          },
        );
      }
    },
  ),
};