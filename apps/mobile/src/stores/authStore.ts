import React, {createContext, useContext, useEffect, useReducer, useCallback} from 'react';
import {AuthService, type AuthUser} from '../services/auth/AuthService';
import {SessionManager} from '../services/auth/SessionManager';
import type {SupabaseSession} from '../services/supabase/client';

type AuthState = {
  user: AuthUser | null;
  session: SupabaseSession | null;
  loading: boolean;
  error: string | null;
};

type AuthAction =
  | {type: 'LOADING'}
  | {type: 'SIGNED_IN'; user: AuthUser; session: SupabaseSession}
  | {type: 'SIGNED_OUT'}
  | {type: 'ERROR'; error: string}
  | {type: 'CLEAR_ERROR'};

const initialState: AuthState = {
  user: null,
  session: null,
  loading: true,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOADING':
      return {...state, loading: true, error: null};
    case 'SIGNED_IN':
      return {user: action.user, session: action.session, loading: false, error: null};
    case 'SIGNED_OUT':
      return {user: null, session: null, loading: false, error: null};
    case 'ERROR':
      return {...state, loading: false, error: action.error};
    case 'CLEAR_ERROR':
      return {...state, error: null};
  }
}

type AuthContextValue = AuthState & {
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Restore session on mount
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const session = await SessionManager.loadSession();
        if (cancelled) return;

        if (session && SessionManager.isSessionValid(session)) {
          // Refresh if expiring soon
          let activeSession = session;
          if (SessionManager.isExpiringSoon(session)) {
            const refreshed = await AuthService.refreshToken();
            if (refreshed) activeSession = refreshed;
          }

          dispatch({
            type: 'SIGNED_IN',
            user: {id: activeSession.user.id, email: activeSession.user.email},
            session: activeSession,
          });
        } else {
          dispatch({type: 'SIGNED_OUT'});
        }
      } catch {
        if (!cancelled) dispatch({type: 'SIGNED_OUT'});
      }
    }

    restore();

    // Listen for external auth changes
    const sub = AuthService.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) {
        dispatch({
          type: 'SIGNED_IN',
          user: {id: session.user.id, email: session.user.email},
          session,
        });
      } else {
        dispatch({type: 'SIGNED_OUT'});
      }
    });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      dispatch({type: 'LOADING'});
      try {
        const result = await AuthService.signUp(email, password, displayName);
        if (result.session) {
          dispatch({
            type: 'SIGNED_IN',
            user: result.user!,
            session: result.session,
          });
        } else {
          // Email confirmation required
          dispatch({type: 'SIGNED_OUT'});
        }
      } catch (e: unknown) {
        dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Sign up failed'});
      }
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    dispatch({type: 'LOADING'});
    try {
      const result = await AuthService.signIn(email, password);
      dispatch({
        type: 'SIGNED_IN',
        user: result.user!,
        session: result.session!,
      });
    } catch (e: unknown) {
      dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Sign in failed'});
    }
  }, []);

  const signOut = useCallback(async () => {
    dispatch({type: 'LOADING'});
    try {
      await AuthService.signOut();
      dispatch({type: 'SIGNED_OUT'});
    } catch (e: unknown) {
      dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Sign out failed'});
    }
  }, []);

  const clearError = useCallback(() => dispatch({type: 'CLEAR_ERROR'}), []);

  const value: AuthContextValue = {
    ...state,
    signUp,
    signIn,
    signOut,
    clearError,
  };

  return React.createElement(AuthContext.Provider, {value}, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
