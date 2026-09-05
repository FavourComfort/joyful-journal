import { createServerFn } from "@tanstack/react-start";
import { createNylonPay } from "@nile-squad/nylonpay-ts";

interface CollectNylonPaymentInput {
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  description: string;
  reference: string;
}

export const collectNylonPayment = createServerFn({ method: "POST" })
  .validator((data: CollectNylonPaymentInput) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.NYLONPAY_API_KEY;
    const apiSecret = process.env.NYLONPAY_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("Nylon Pay sandbox credentials are not configured.");
    }

    if (!Number.isInteger(data.amount) || data.amount < 500) {
      throw new Error("Payment amount must be at least 500 UGX.");
    }

    const nylonpay = createNylonPay({ apiKey, apiSecret });
    const payment = await nylonpay.collectPayment({
      amount: data.amount,
      currency: "UGX",
      customer: {
        name: data.customerName,
        phoneNumber: data.customerPhone,
        ...(data.customerEmail ? { email: data.customerEmail } : {}),
      },
      description: data.description,
      reference: data.reference,
      metadata: { environment: "sandbox" },
    });

    const transaction = await payment.wait();

    if (!transaction) {
      throw new Error("Nylon Pay payment failed or timed out.");
    }

    return {
      reference: transaction.reference,
      transactionId: transaction.id,
      status: transaction.status,
    };
  });