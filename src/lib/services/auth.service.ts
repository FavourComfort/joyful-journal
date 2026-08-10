import { supabase } from '../supabase';

export interface Profile {
  id: string;
  full_name: string;
  phone?: string;
  role: 'customer' | 'provider' | 'admin';
  created_at: string;
}

export interface AuthResponse {
  data: Profile | null;
  error: string | null;
}

// Get current user profile
export async function getCurrentProfile(): Promise<Profile | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data as Profile;
  } catch (error) {
    console.error('Error getting current profile:', error);
    return null;
  }
}

// Create user profile
export async function createProfile(
  userId: string,
  fullName: string,
  phone: string,
  role: 'customer' | 'provider' = 'customer'
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert([
        {
          id: userId,
          full_name: fullName,
          phone,
          role,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error('Profile creation returned no data');
    }

    return data as Profile;
  } catch (error) {
    console.error('Error creating profile:', error);
    throw error instanceof Error ? error : new Error('Unknown profile creation error');
  }
}

// Update user profile
export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return null;
    }

    return data as Profile;
  } catch (error) {
    console.error('Error updating profile:', error);
    return null;
  }
}

// Sign up new user
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  phone: string,
  role: 'customer' | 'provider' = 'customer'
): Promise<AuthResponse> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return { data: null, error: authError.message };
    }

    if (!authData.user) {
      return {
        data: null,
        error:
          'Sign up requires email confirmation. Please check your inbox and confirm your email before signing in.',
      };
    }

    const profile = await createProfile(authData.user.id, fullName, phone, role);

    if (!profile) {
      return { data: null, error: 'Failed to create profile' };
    }

    return { data: profile, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
    return { data: null, error: errorMessage };
  }
}

// Sign in user
export async function signIn(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return { data: null, error: authError?.message || 'Sign in failed' };
    }

    const profile = await getCurrentProfile();

    return { data: profile, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
    return { data: null, error: errorMessage };
  }
}

// Sign out user
export async function signOut(): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sign out failed';
    return { error: errorMessage };
  }
}
