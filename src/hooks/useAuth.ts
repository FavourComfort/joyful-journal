import { useState, useEffect, useCallback } from 'react';
import {
  getCurrentProfile,
  signIn,
  signUp,
  signOut,
  Profile,
} from '@/lib/services/auth.service';

interface UseAuthResult {
  user: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string,
    role?: 'customer' | 'provider'
  ) => Promise<boolean>;
  signOut: () => Promise<boolean>;
  error: string | null;
}

/**
 * Custom hook for authentication
 * Usage: const { user, isAuthenticated, signIn, signOut } = useAuth();
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is logged in on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true);
        const profile = await getCurrentProfile();
        setUser(profile);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Auth check failed';
        setError(errorMessage);
        console.error('Auth initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const handleSignIn = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setError(null);
      const { data, error: signInError } = await signIn(email, password);

      if (signInError) {
        setError(signInError);
        return false;
      }

      setUser(data);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign in failed';
      setError(errorMessage);
      return false;
    }
  }, []);

  const handleSignUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      phone: string,
      role: 'customer' | 'provider' = 'customer'
    ): Promise<boolean> => {
      try {
        setError(null);
        const { data, error: signUpError } = await signUp(email, password, fullName, phone, role);

        if (signUpError) {
          setError(signUpError);
          return false;
        }

        setUser(data);
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Sign up failed';
        setError(errorMessage);
        return false;
      }
    },
    []
  );

  const handleSignOut = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const { error: signOutError } = await signOut();

      if (signOutError) {
        setError(signOutError);
        return false;
      }

      setUser(null);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign out failed';
      setError(errorMessage);
      return false;
    }
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    error,
  };
}
