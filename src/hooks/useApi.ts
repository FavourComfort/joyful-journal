import { useState, useEffect, useCallback } from 'react';

interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for data fetching
 * Usage: const { data, loading, error, refetch } = useQuery(async () => fetchSomething());
 */
export function useQuery<T>(
  queryFn: () => Promise<T | null>,
  dependencies: any[] = []
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await queryFn();
      setData(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Query error:', err);
    } finally {
      setLoading(false);
    }
  }, [queryFn]);

  useEffect(() => {
    refetch();
  }, dependencies);

  return { data, loading, error, refetch };
}

interface UseMutationResult<T, R> {
  mutate: (payload: T) => Promise<R | null>;
  loading: boolean;
  error: string | null;
  data: R | null;
}

/**
 * Custom hook for mutations (POST, PUT, DELETE operations)
 * Usage: const { mutate, loading, error } = useMutation(async (data) => createSomething(data));
 */
export function useMutation<T, R>(
  mutationFn: (payload: T) => Promise<R | null>
): UseMutationResult<T, R> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<R | null>(null);

  const mutate = useCallback(
    async (payload: T): Promise<R | null> => {
      try {
        setLoading(true);
        setError(null);
        const result = await mutationFn(payload);
        setData(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        console.error('Mutation error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [mutationFn]
  );

  return { mutate, loading, error, data };
}
