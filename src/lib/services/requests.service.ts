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
