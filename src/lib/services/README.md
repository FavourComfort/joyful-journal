# ExpertHub Database Services

This folder contains all database interaction services for the ExpertHub application. These services provide a clean, reusable interface for interacting with Supabase tables.

## Structure

```
src/
├── lib/
│   ├── services/
│   │   ├── auth.service.ts          # Authentication & Profile management
│   │   ├── providers.service.ts      # Provider operations
│   │   ├── services.service.ts       # Service listings
│   │   ├── bookings.service.ts       # Booking management
│   │   ├── reviews.service.ts        # Review & ratings
│   │   ├── payments.service.ts       # Payment tracking
│   │   └── index.ts                  # Export all services
│   └── supabase.ts                   # Supabase client config
└── hooks/
    ├── useAuth.ts                    # Authentication hook
    └── useApi.ts                     # Generic data fetching hooks
```

## Available Services

### 1. Auth Service (`auth.service.ts`)

Handle user authentication and profile management.

**Functions:**
- `getCurrentProfile()` - Get current logged-in user's profile
- `createProfile(userId, fullName, phone, role)` - Create new user profile
- `updateProfile(userId, updates)` - Update user profile
- `signUp(email, password, fullName, phone, role)` - Register new user
- `signIn(email, password)` - Login user
- `signOut()` - Logout user

**Usage:**
```typescript
import { signIn, getCurrentProfile } from '@/lib/services';

// Sign in
const { data: profile, error } = await signIn('user@example.com', 'password');

// Get current user
const profile = await getCurrentProfile();
```

### 2. Providers Service (`providers.service.ts`)

Manage provider accounts and information.

**Functions:**
- `getAllProviders()` - Get all verified providers
- `getProviderById(providerId)` - Get provider by ID
- `getProviderByUserId(userId)` - Get provider by user ID
- `createProvider(userId, businessName, bio, location)` - Create provider
- `updateProvider(providerId, updates)` - Update provider info
- `searchProvidersByLocation(location)` - Search by location

**Usage:**
```typescript
import { getAllProviders, createProvider } from '@/lib/services';

// Get all providers
const providers = await getAllProviders();

// Create new provider
const provider = await createProvider(
  userId,
  'My Business',
  'Professional services',
  'New York, NY'
);
```

### 3. Services Service (`services.service.ts`)

Manage service listings.

**Functions:**
- `getAllServices()` - Get all active services
- `getServicesByProviderId(providerId)` - Get provider's services
- `getServiceById(serviceId)` - Get specific service
- `createService(providerId, title, category, price, description, duration)` - Create service
- `updateService(serviceId, updates)` - Update service
- `deleteService(serviceId)` - Soft delete service
- `searchServicesByCategory(category)` - Search by category
- `searchServicesByTitle(title)` - Search by title

**Usage:**
```typescript
import { createService, searchServicesByCategory } from '@/lib/services';

// Create service
const service = await createService(
  providerId,
  'Web Development',
  'Technology',
  150, // price
  'Professional web development services',
  120 // duration in minutes
);

// Search services
const services = await searchServicesByCategory('Technology');
```

### 4. Bookings Service (`bookings.service.ts`)

Handle booking operations.

**Functions:**
- `getCustomerBookings(customerId)` - Get customer's bookings
- `getProviderBookings(providerId)` - Get provider's bookings
- `getBookingById(bookingId)` - Get specific booking
- `createBooking(customerId, providerId, serviceId, date, startTime, endTime, amount)` - Create booking
- `updateBookingStatus(bookingId, status)` - Update booking status
- `cancelBooking(bookingId)` - Cancel booking
- `getUpcomingProviderBookings(providerId)` - Get upcoming bookings
- `getCompletedCustomerBookings(customerId)` - Get completed bookings

**Usage:**
```typescript
import { createBooking, getCustomerBookings } from '@/lib/services';

// Create booking
const booking = await createBooking(
  customerId,
  providerId,
  serviceId,
  '2026-07-15',
  '09:00:00',
  '10:30:00',
  150
);

// Get customer bookings
const bookings = await getCustomerBookings(customerId);
```

### 5. Reviews Service (`reviews.service.ts`)

Manage reviews and ratings.

**Functions:**
- `getProviderReviews(providerId)` - Get provider's reviews
- `getCustomerReviews(customerId)` - Get customer's reviews
- `getReviewByBookingId(bookingId)` - Get review for booking
- `createReview(bookingId, customerId, providerId, rating, comment)` - Create review
- `updateReview(reviewId, updates)` - Update review
- `deleteReview(reviewId)` - Delete review
- `getProviderAverageRating(providerId)` - Get provider's average rating

**Usage:**
```typescript
import { createReview, getProviderAverageRating } from '@/lib/services';

// Create review
const review = await createReview(
  bookingId,
  customerId,
  providerId,
  5,
  'Excellent service!'
);

// Get average rating
const rating = await getProviderAverageRating(providerId);
```

### 6. Payments Service (`payments.service.ts`)

Handle payment tracking.

**Functions:**
- `getPaymentByBookingId(bookingId)` - Get payment for booking
- `getPaymentsByBookingId(bookingId)` - Get all payment attempts
- `createPayment(bookingId, amount, paymentMethod, transactionRef)` - Create payment record
- `updatePaymentStatus(paymentId, status, transactionRef)` - Update payment status
- `markPaymentAsPaid(paymentId, transactionRef)` - Mark as paid
- `markPaymentAsFailed(paymentId)` - Mark as failed
- `markPaymentAsRefunded(paymentId)` - Mark as refunded
- `getPaymentsByStatus(status)` - Get payments by status

**Usage:**
```typescript
import { createPayment, markPaymentAsPaid } from '@/lib/services';

// Create payment
const payment = await createPayment(
  bookingId,
  150,
  'credit_card',
  'txn_12345'
);

// Mark as paid
const updated = await markPaymentAsPaid(paymentId, 'txn_67890');
```

## Custom Hooks

### useAuth Hook

Manage authentication state in components.

**Usage:**
```typescript
import { useAuth } from '@/hooks/useAuth';

export function MyComponent() {
  const { user, isAuthenticated, signIn, signOut, loading, error } = useAuth();

  const handleLogin = async () => {
    const success = await signIn('user@example.com', 'password');
    if (success) {
      // Handle successful login
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please login</div>;

  return (
    <div>
      <p>Welcome, {user?.full_name}</p>
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

### useQuery Hook

Fetch data in components.

**Usage:**
```typescript
import { useQuery } from '@/hooks/useApi';
import { getAllProviders } from '@/lib/services';

export function ProvidersList() {
  const { data: providers, loading, error, refetch } = useQuery(() => getAllProviders());

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {providers?.map(provider => (
        <div key={provider.id}>{provider.business_name}</div>
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

### useMutation Hook

Handle data mutations in components.

**Usage:**
```typescript
import { useMutation } from '@/hooks/useApi';
import { createService } from '@/lib/services';

export function CreateServiceForm() {
  const { mutate, loading, error } = useMutation(async (formData) => {
    return await createService(
      formData.providerId,
      formData.title,
      formData.category,
      formData.price
    );
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await mutate(formData);
    if (result) {
      // Success
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Service'}
      </button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

## Error Handling

All services return `null` on error and log errors to console. Check the return value:

```typescript
const result = await createBooking(...);
if (!result) {
  // Handle error
}
```

## Environment Variables

Required in `.env`:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Best Practices

1. **Always check for null returns** - Services return null on error
2. **Use hooks in components** - Use `useQuery` and `useMutation` in React components
3. **Handle loading states** - Always show loading indicators
4. **Reuse services** - Don't duplicate API calls, use these services
5. **Add error boundaries** - Wrap components with error boundaries
6. **Cache data** - Use hooks to cache data and avoid redundant calls

## Example: Complete Booking Flow

```typescript
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@/hooks/useApi';
import { getAllProviders, createBooking } from '@/lib/services';

export function BookingFlow() {
  const { user } = useAuth();
  const { data: providers } = useQuery(() => getAllProviders());

  const handleBooking = async (providerId, serviceId) => {
    if (!user) return;

    const booking = await createBooking(
      user.id,
      providerId,
      serviceId,
      '2026-07-15',
      '09:00:00',
      '10:30:00',
      150
    );

    if (booking) {
      // Navigate to payment
    }
  };

  return (
    <div>
      {providers?.map(provider => (
        <button
          key={provider.id}
          onClick={() => handleBooking(provider.id, 'service123')}
        >
          Book {provider.business_name}
        </button>
      ))}
    </div>
  );
}
```
