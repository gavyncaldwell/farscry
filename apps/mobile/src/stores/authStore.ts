import React, {createContext, useContext, useEffect, useReducer, useCallback} from 'react';
import {AuthService, type AuthUser} from '../services/auth/AuthService';
import {supabase} from '../services/supabase/client';
import type {Session} from '@supabase/supabase-js';

type AuthState = {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
};

type AuthAction =
  | {type: 'LOADING'}
  | {type: 'SIGNED_IN'; user: AuthUser; session: Session}
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

  // Restore session on mount + listen for auth changes
  useEffect(() => {
    // Get initial session from SDK (auto-persisted in AsyncStorage)
    supabase.auth.getSession().then(({data: {session}}) => {
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

    // Listen for auth state changes
    const {data: {subscription}} = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          dispatch({
            type: 'SIGNED_IN',
            user: {id: session.user.id, email: session.user.email},
            session,
          });
        } else {
          dispatch({type: 'SIGNED_OUT'});
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      dispatch({type: 'LOADING'});
      try {
        const result = await AuthService.signUp(email, password, displayName);
        if (result.session && result.user) {
          dispatch({
            type: 'SIGNED_IN',
            user: result.user,
            session: result.session,
          });
        } else {
          // Email confirmation required (shouldn't happen if disabled)
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
      if (!result.user || !result.session) throw new Error('Sign in failed');
      dispatch({
        type: 'SIGNED_IN',
        user: result.user,
        session: result.session,
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
