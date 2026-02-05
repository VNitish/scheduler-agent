'use client';

import { useEffect, useRef } from 'react';
import { useGoogleAuth } from './google-auth';

/**
 * Hook to automatically sync tokens from backend every 5 minutes
 * This ensures the client always has the latest token if it was refreshed server-side
 *
 * Usage: Just call this hook once in your main dashboard/app component
 * Example: useTokenSync();
 */
export function useTokenSync(intervalMs: number = 5 * 60 * 1000) {
  const { syncToken, getAccessToken } = useGoogleAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only run if user is logged in
    if (!getAccessToken()) return;

    // Sync immediately on mount
    syncToken();

    // Then sync periodically
    intervalRef.current = setInterval(() => {
      syncToken();
    }, intervalMs);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [syncToken, getAccessToken, intervalMs]);
}
