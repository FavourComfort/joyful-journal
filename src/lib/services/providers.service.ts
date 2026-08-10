import { supabase } from '../supabase';

export interface Provider {
  id: string;
  user_id: string;
  business_name: string;
  bio?: string;
  location?: string;
  profile_picture_url?: string;
  rating: number;
  verified: boolean;
  created_at: string;
}

// Get all providers
export async function getAllProviders(): Promise<Provider[]> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('verified', true)
      .order('rating', { ascending: false });

    if (error) {
      console.error('Error fetching providers:', error);
      return [];
    }

    return (data || []) as Provider[];
  } catch (error) {
    console.error('Error getting providers:', error);
    return [];
  }
}

// Get provider by ID
export async function getProviderById(providerId: string): Promise<Provider | null> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (error) {
      console.error('Error fetching provider:', error);
      return null;
    }

    return data as Provider;
  } catch (error) {
    console.error('Error getting provider:', error);
    return null;
  }
}

// Get provider by user ID
export async function getProviderByUserId(userId: string): Promise<Provider | null> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching provider:', error);
      return null;
    }

    return data as Provider;
  } catch (error) {
    console.error('Error getting provider:', error);
    return null;
  }
}

// Create provider
export async function createProvider(
  userId: string,
  businessName: string,
  bio?: string,
  location?: string,
  profilePictureUrl?: string
): Promise<Provider | null> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .insert([
        {
          user_id: userId,
          business_name: businessName,
          bio,
          location,
          profile_picture_url: profilePictureUrl,
          rating: 0,
          verified: false,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating provider:', error);
      return null;
    }

    return data as Provider;
  } catch (error) {
    console.error('Error creating provider:', error);
    return null;
  }
}

// Update provider
export async function updateProvider(
  providerId: string,
  updates: Partial<Provider>
): Promise<Provider | null> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .update(updates)
      .eq('id', providerId)
      .select()
      .single();

    if (error) {
      console.error('Error updating provider:', error);
      return null;
    }

    return data as Provider;
  } catch (error) {
    console.error('Error updating provider:', error);
    return null;
  }
}

// Search providers by location
export async function searchProvidersByLocation(location: string): Promise<Provider[]> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .ilike('location', `%${location}%`)
      .eq('verified', true)
      .order('rating', { ascending: false });

    if (error) {
      console.error('Error searching providers:', error);
      return [];
    }

    return (data || []) as Provider[];
  } catch (error) {
    console.error('Error searching providers:', error);
    return [];
  }
}
