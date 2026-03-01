import {supabase} from '../supabase/client';
import type {Session} from '@supabase/supabase-js';

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthState = {
  user: AuthUser | null;
  session: Session | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new Error('Invalid email address');
  }
  return trimmed;
}

function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

export const AuthService = {
  async signUp(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthState> {
    const cleanEmail = validateEmail(email);
    validatePassword(password);

    const name = displayName.trim();
    if (!name) {
      throw new Error('Display name is required');
    }

    const {data, error} = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {display_name: name},
      },
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Sign up failed');

    // Update the user profile row created by the DB trigger
    // The trigger creates a row with email prefix as display_name,
    // so we update it with the user's chosen name
    const {error: profileError} = await supabase
      .from('users')
      .update({display_name: name})
      .eq('id', data.user.id);

    if (profileError) {
      console.warn('Failed to update display name:', profileError.message);
    }

    return {
      user: {id: data.user.id, email: cleanEmail},
      session: data.session,
    };
  },

  async signIn(email: string, password: string): Promise<AuthState> {
    const cleanEmail = validateEmail(email);
    if (!password) throw new Error('Password is required');

    const {data, error} = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Sign in failed');

    return {
      user: {id: data.session.user.id, email: cleanEmail},
      session: data.session,
    };
  },

  async signOut(): Promise<void> {
    const {error} = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async resetPassword(email: string): Promise<void> {
    const cleanEmail = validateEmail(email);
    const {error} = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) throw new Error(error.message);
  },

  async deleteAccount(): Promise<void> {
    const {data} = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    // Remove user data — cascade will handle contacts and push_tokens
    const {error} = await supabase.from('users').delete().eq('id', userId);
    if (error) throw new Error(error.message);

    await supabase.auth.signOut();
  },

  async getSession(): Promise<Session | null> {
    const {data, error} = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  },

  onAuthStateChange(
    callback: (event: string, session: Session | null) => void,
  ): {unsubscribe: () => void} {
    const {data} = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  },
};
