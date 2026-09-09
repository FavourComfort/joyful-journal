import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface PaymentRequest {
  phone_number: string;
  amount: number;
  reference: string;
  description?: string;
}

console.info("NINJAWO MarzPay handler started");

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
              error: "MarzPay payment request failed",
              details: marzData,
            }),
            {
              status: marzResponse.status,
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