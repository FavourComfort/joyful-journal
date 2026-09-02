# Quick Start: Deploy Escrow Fixes to Supabase

## Step 1: Deploy Atomic Transaction Functions (5 minutes)

### Via Supabase UI:
1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Run [`db/escrow_completion_requests.sql`](./db/escrow_completion_requests.sql) first to enable provider-initiated completion requests.
5. Copy the entire contents of [`db/escrow_transaction.sql`](./db/escrow_transaction.sql)
6. Paste into the query editor and click **Run**.
7. Verify all three functions are created:
   - ✅ `create_booking_with_escrow_payment()`
   - ✅ `release_escrow_to_provider()`
   - ✅ `cancel_booking_and_refund()`

### Via Supabase CLI:
```bash
cd joyful-journal
supabase db push --include-schema-migrations db/escrow_transaction.sql
```

---

## Step 2: Verify RLS Policies Are Correct (2 minutes)

In Supabase SQL Editor, run:

```sql
-- Check that Payments select policy uses provider.user_id pattern
SELECT definition FROM pg_policies 
WHERE tablename = 'payments' 
AND policyname = 'Payments select by participant';

-- Should show: p.user_id = auth.uid()
-- Should NOT show: auth.uid() = provider_id
```

Expected output:
```
USING (
  auth.uid() = customer_id
  OR EXISTS (
    SELECT 1 FROM public.providers p
    WHERE p.id = provider_id AND p.user_id = auth.uid()
  )
)
```

---

## Step 3: Run Local Integration Tests (1 minute)

```bash
cd joyful-journal
npm run test:escrow
```

Or manually:
```bash
cd joyful-journal
node --test db/escrow_flow.integration.test.js
```

Expected: **10/10 tests passing ✅**

---

## Step 4: Test the Full Booking Flow Locally

### Prerequisites:
- Running dev server: `npm run dev`
- Logged in to your local Supabase project
- Have a provider with an active service created

### Manual Testing:
1. **Create a Booking:**
   - Navigate to provider profile
   - Click "Book Service"
   - Fill date, time, notes
   - Click "Confirm Booking"
   - ✅ Should see success page

2. **Verify in Supabase:**
   - Go to Supabase > Table Editor
   - Open `bookings` table
   - ✅ Should see new row with `status: 'confirmed'`
   
3. **Verify Payment Created:**
   - Go to `payments` table
   - ✅ Should see new row with `payment_status: 'escrowed'`
   - ✅ `platform_fee` should be 10% of amount
   - ✅ `provider_amount` should be 90% of amount

4. **Test Escrow Release:**
   - Go to customer dashboard
   - Find the booking
   - Click "Confirm Completion"
   - ✅ Should see success message

5. **Verify Payment Released:**
   - Go to Supabase > `payments` table
   - ✅ Payment status should be `'released'`
   - ✅ `released_at` timestamp should be set

---

## Step 5: Update Code to Use Atomic Functions (Optional - For Extra Robustness)

If you want to switch from separate inserts to the atomic function:

### In `src/lib/services/payments.service.ts`, add:

```typescript
/**
 * Create booking and escrowed payment atomically.
 * This ensures both records are created together or the transaction is rolled back.
 */
export async function createBookingWithEscrowPayment(
  customerId: string,
  providerId: string,
  serviceId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  totalAmount: number,
  transactionRef?: string
): Promise<{ booking: Booking; payment: Payment } | null> {
  try {
    const { data, error } = await supabase.rpc(
      'create_booking_with_escrow_payment',
      {
        p_customer_id: customerId,
        p_provider_id: providerId,
        p_service_id: serviceId,
        p_booking_date: bookingDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_total_amount: totalAmount,
        p_transaction_ref: transactionRef,
      }
    );

    if (error) {
      console.error('Error creating booking with escrow:', error);
      return null;
    }

    if (!data?.success) {
      console.error('Atomic operation failed:', data?.error);
      return null;
    }

    return {
      booking: data.booking as Booking,
      payment: data.payment as Payment,
    };
  } catch (error) {
    console.error('Exception creating booking with escrow:', error);
    return null;
  }
}
```

### Then in `src/routes/book.tsx`, update the booking creation:

```typescript
// OLD:
const booking = await createBooking(...);
const payment = await createPayment(...);

// NEW:
const result = await createBookingWithEscrowPayment(...);
if (!result) {
  setError("Failed to create booking and payment");
  return;
}
const { booking, payment } = result;
```

---

## Troubleshooting

### Error: "function create_booking_with_escrow_payment does not exist"
**Solution:** You haven't deployed `db/escrow_transaction.sql` to Supabase yet.
- See **Step 1** above

### Error: "permission denied for function"
**Solution:** Function wasn't created with `SECURITY DEFINER` or doesn't have proper grants.
- Re-run the deployment from Step 1
- Make sure you're running as the postgres user

### Booking created but payment not created
**Solution:** Check if you're using separate `createBooking()` and `createPayment()` calls.
- They're not atomic
- Use the new `createBookingWithEscrowPayment()` function instead
- Or deploy functions and use the RPC approach

### Payment shows `payment_status: 'pending'` instead of `'escrowed'`
**Solution:** Check your code in `createPayment()`.
- Make sure it's setting `payment_status: 'escrowed'` by default
- Verify in [src/lib/services/payments.service.ts](../src/lib/services/payments.service.ts)

---

## Testing Checklist

- [ ] Atomic functions deployed to Supabase
- [ ] RLS policies verified (should show `p.user_id = auth.uid()`)
- [ ] Integration tests passing (10/10)
- [ ] Build succeeds (`npm run build`)
- [ ] Can create booking successfully
- [ ] Payment record created in escrowed state
- [ ] Can confirm completion in dashboard
- [ ] Payment marked as released
- [ ] Booking marked as completed

---

## Next Steps

1. ✅ Deploy functions
2. ✅ Verify RLS policies
3. ✅ Run tests
4. 🔲 Implement cancellation flow (see [ESCROW_FLOW_STATUS.md](./ESCROW_FLOW_STATUS.md) Priority 1.3)
5. 🔲 Add provider-side completion (see [ESCROW_FLOW_STATUS.md](./ESCROW_FLOW_STATUS.md) Priority 1.3)
6. 🔲 Real Supabase integration tests

---

For detailed status and missing pieces, see [ESCROW_FLOW_STATUS.md](./ESCROW_FLOW_STATUS.md)
