import { supabase } from '../supabase';

export interface CustomerRequest {
  id: string;
  customer_id: string;
  title: string;
  description: string;
  location?: string;
  budget_min?: number | null;
  budget_max?: number | null;
  created_at: string;
}

export interface RequestNotification {
  id: string;
  request_id: string;
  provider_id: string;
  subject: string;
  message: string;
  link?: string | null;
  status: 'new' | 'viewed' | 'dismissed';
  created_at: string;
  read_at?: string | null;
}

export interface ProviderOffer {
  id: string;
  request_id: string;
  provider_id: string;
  message?: string;
  price?: number | null;
  estimated_start?: string | null;
  created_at: string;
}

// Post a new customer request
export async function createCustomerRequest(data: Partial<CustomerRequest>) {
  try {
    const { data: created, error } = await supabase
      .from('requests')
      .insert([data])
      .select()
      .single();

    if (error) {
      console.error('Error creating request:', error);
      return null;
    }

    return created as CustomerRequest;
  } catch (err) {
    console.error('Exception creating request:', err);
    return null;
  }
}

export async function findMatchingProvidersForRequest(location?: string) {
  try {
    let qb = supabase
      .from('providers')
      .select('*')
      .eq('verified', true);

    if (location) {
      qb = qb.ilike('location', `%${location}%`);
    }

    const { data, error } = await qb.order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching matching providers:', error);
      return [];
    }

    return (data || []) as Array<{
      id: string;
      user_id: string;
      business_name: string;
      location?: string | null;
      verified: boolean;
    }>;
  } catch (err) {
    console.error('Exception fetching matching providers:', err);
    return [];
  }
}

export async function createRequestNotificationsForProviders(
  requestId: string,
  providerIds: string[],
  requestTitle: string,
  requestLink: string
) {
  try {
    if (!providerIds.length) return [];

    const rows = providerIds.map((providerId) => ({
      request_id: requestId,
      provider_id: providerId,
      subject: 'You have a new service request from ExpertHub',
      message: `A new request, "${requestTitle}", is waiting for you. View it here: ${requestLink}`,
      link: requestLink,
      status: 'new',
    }));

    const { data, error } = await supabase
      .from('request_notifications')
      .insert(rows)
      .select();

    if (error) {
      console.error('Error creating provider notifications:', error);
      return [];
    }

    return (data || []) as RequestNotification[];
  } catch (err) {
    console.error('Exception creating provider notifications:', err);
    return [];
  }
}

// Placeholder for real email delivery once you have a verified domain and Resend config.
// Leave this as the integration point for later so the app flow stays stable today.
export async function queueProviderRequestEmailDelivery(
  requestId: string,
  requestTitle: string,
  providerIds: string[],
  requestLink: string
) {
  try {
    const notifications = await createRequestNotificationsForProviders(
      requestId,
      providerIds,
      requestTitle,
      requestLink
    );

    return {
      queued: true,
      notificationsCount: notifications.length,
      requestId,
      requestLink,
      emailProvider: 'resend-pending-domain-setup',
    };
  } catch (err) {
    console.error('Exception queueing provider request email delivery:', err);
    return {
      queued: false,
      notificationsCount: 0,
      requestId,
      requestLink,
      emailProvider: 'resend-pending-domain-setup',
    };
  }
}

// Search public requests (basic text/location search)
export async function searchRequests(query: string, location?: string) {
  try {
    let qb = supabase.from('requests').select('*');
    if (query) qb = qb.ilike('title', `%${query}%`);
    if (location) qb = qb.ilike('location', `%${location}%`);
    const { data, error } = await qb.order('created_at', { ascending: false });
    if (error) {
      console.error('Error searching requests:', error);
      return [];
    }
    return (data || []) as CustomerRequest[];
  } catch (err) {
    console.error('Exception searching requests:', err);
    return [];
  }
}

// Provider creates an offer for a request
export async function createOffer(offer: Partial<ProviderOffer>) {
  try {
    const { data: created, error } = await supabase
      .from('offers')
      .insert([offer])
      .select()
      .single();

    if (error) {
      console.error('Error creating offer:', error);
      return null;
    }

    return created as ProviderOffer;
  } catch (err) {
    console.error('Exception creating offer:', err);
    return null;
  }
}

export async function getOffersForRequest(requestId: string) {
  try {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching offers:', error);
      return [];
    }
    return (data || []) as ProviderOffer[];
  } catch (err) {
    console.error('Exception fetching offers:', err);
    return [];
  }
}

export async function getNotificationsForProvider(providerId: string) {
  try {
    const { data, error } = await supabase
      .from('request_notifications')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching provider notifications:', error);
      return [] as RequestNotification[];
    }

    return (data || []) as RequestNotification[];
  } catch (err) {
    console.error('Exception fetching provider notifications:', err);
    return [] as RequestNotification[];
  }
}

// Get requests relevant to a provider (simple location match — can be extended)
export async function getRequestsForProvider(location?: string) {
  try {
    let qb = supabase.from('requests').select('*');
    if (location) qb = qb.ilike('location', `%${location}%`);
    const { data, error } = await qb.order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching requests for provider:', error);
      return [];
    }
    return (data || []) as CustomerRequest[];
  } catch (err) {
    console.error('Exception fetching requests for provider:', err);
    return [];
  }
}

export default {};
