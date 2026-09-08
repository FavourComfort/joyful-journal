import { supabase } from '../supabase';
import { normalizeCategory } from './categories';

export interface Service {
  id: string;
  provider_id: string;
  title: string;
  description?: string;
  category: string;
  price: number;
  duration_minutes?: number;
  active: boolean;
  created_at: string;
}

// Get all active services
export async function getAllServices(): Promise<Service[]> {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching services:', error);
      return [];
    }

    return (data || []) as Service[];
  } catch (error) {
    console.error('Error getting services:', error);
    return [];
  }
}

// Get services by provider ID
export async function getServicesByProviderId(providerId: string): Promise<Service[]> {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', providerId)
      .eq('active', true);

    if (error) {
      console.error('Error fetching services:', error);
      return [];
    }

    return (data || []) as Service[];
  } catch (error) {
    console.error('Error getting services:', error);
    return [];
  }
}

// Get service by ID
export async function getServiceById(serviceId: string): Promise<Service | null> {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error) {
      console.error('Error fetching service:', error);
      return null;
    }

    return data as Service;
  } catch (error) {
    console.error('Error getting service:', error);
    return null;
  }
}

// Create service
export async function createService(
  providerId: string,
  title: string,
  category: string,
  price: number,
  description?: string,
  durationMinutes?: number
): Promise<Service | null> {
  try {
    const { data, error } = await supabase
      .from('services')
      .insert([
        {
          provider_id: providerId,
          title,
          category: normalizeCategory(category),
          price,
          description,
          duration_minutes: durationMinutes,
          active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating service:', error);
      return null;
    }

    return data as Service;
  } catch (error) {
    console.error('Error creating service:', error);
    return null;
  }
}

// Update service
export async function updateService(
  serviceId: string,
  updates: Partial<Service>
): Promise<Service | null> {
  try {
    const { data, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', serviceId)
      .select()
      .single();

    if (error) {
      console.error('Error updating service:', error);
      return null;
    }

    return data as Service;
  } catch (error) {
    console.error('Error updating service:', error);
    return null;
  }
}

// Delete service (soft delete by setting active to false)
export async function deleteService(serviceId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('services')
      .update({ active: false })
      .eq('id', serviceId);

    if (error) {
      console.error('Error deleting service:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting service:', error);
    return false;
  }
}

// Search services by category
export async function searchServicesByCategory(category: string): Promise<Service[]> {
  try {
    const normalized = normalizeCategory(category);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .ilike('category', normalized)
      .eq('active', true);

    if (error) {
      console.error('Error searching services:', error);
      return [];
    }

    return (data || []) as Service[];
  } catch (error) {
    console.error('Error searching services:', error);
    return [];
  }
}

// Search services by title
export async function searchServicesByTitle(title: string): Promise<Service[]> {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .ilike('title', `%${title}%`)
      .eq('active', true);

    if (error) {
      console.error('Error searching services:', error);
      return [];
    }

    return (data || []) as Service[];
  } catch (error) {
    console.error('Error searching services:', error);
    return [];
  }
}
