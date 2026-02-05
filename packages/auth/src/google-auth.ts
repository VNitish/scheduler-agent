'use client';

import { useGoogleLogin, TokenResponse } from '@react-oauth/google';
import { useState, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string;
  role: string;
  calendarConnected?: boolean;
}

export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setLoading(true);
      setError(null);
      try {
        // Exchange authorization code with backend for access + refresh tokens
        const response = await fetch('/api/auth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: codeResponse.code,
          }),
        });

        if (!response.ok) {
          throw new Error('Authentication failed');
        }

        const data = await response.json();

        // Store user session
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('access_token', data.access_token);

        // Redirect based on role
        if (data.user.role === 'ADMIN') {
          window.location.href = '/admin';
        } else {
          window.location.href = '/dashboard';
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        console.error('Auth error:', err);
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google authentication failed');
    },
    scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
    flow: 'auth-code',
    // Request offline access to get refresh token
    // @ts-expect-error - access_type is a valid OAuth param but not in types
    access_type: 'offline',
    prompt: 'consent',
  });

  const logout = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    window.location.href = '/login';
  }, []);

  const getUser = useCallback((): AuthUser | null => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  }, []);

  const getAccessToken = useCallback((): string | null => {
    return localStorage.getItem('access_token');
  }, []);

  // Sync token from backend (in case it was refreshed server-side)
  const syncToken = useCallback(async (): Promise<boolean> => {
    try {
      const currentToken = localStorage.getItem('access_token');
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;

      if (!currentToken || !user) return false;

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      if (!response.ok) {
        // If unauthorized, user needs to log in again
        if (response.status === 401) {
          localStorage.removeItem('user');
          localStorage.removeItem('access_token');
          window.location.href = '/login';
        }
        return false;
      }

      const data = await response.json();

      // Update localStorage with fresh token
      if (data.access_token && data.access_token !== currentToken) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return true;
      }

      return false;
    } catch (error) {
      console.error('[Auth] Token sync failed:', error);
      return false;
    }
  }, []);

  return { login, logout, loading, error, getUser, getAccessToken, syncToken };
}

// Calendar-specific OAuth
export function useCalendarAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectCalendar = useGoogleLogin({
    onSuccess: async (tokenResponse: TokenResponse) => {
      setLoading(true);
      setError(null);
      try {
        const userAccessToken = localStorage.getItem('access_token');
        if (!userAccessToken) {
          throw new Error('User not authenticated');
        }

        const response = await fetch('/api/calendar/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userAccessToken}`,
          },
          body: JSON.stringify({
            access_token: tokenResponse.access_token,
          }),
        });

        if (!response.ok) {
          throw new Error('Calendar connection failed');
        }

        const data = await response.json();

        // Update user in localStorage
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        user.calendarConnected = true;
        localStorage.setItem('user', JSON.stringify(user));

        // Refresh page or update state
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Calendar connection failed');
        console.error('Calendar connection error:', err);
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google Calendar authorization failed');
    },
    scope: 'https://www.googleapis.com/auth/calendar',
    flow: 'implicit',
  });

  return { connectCalendar, loading, error };
}
