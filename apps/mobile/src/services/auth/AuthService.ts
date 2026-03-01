/*
  Supabase schema:

  users
    id          uuid  primary key  (matches auth.users.id)
    display_name  text  not null
    avatar_url    text
    created_at    timestamptz  default now()
    updated_at    timestamptz  default now()

  contacts
    user_id         uuid  references users(id)
    contact_user_id uuid  references users(id)
    is_favorite     boolean  default false
    added_at        timestamptz  default now()
    primary key (user_id, contact_user_id)

  push_tokens
    user_id     uuid  references users(id)
    token       text  not null
    platform    text  not null  -- 'ios' | 'android'
    voip_token  text
    updated_at  timestamptz  default now()
*/

import {supabase, type SupabaseSession} from '../supabase/client';
import {SessionManager} from './SessionManager';

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthState = {
  user: AuthUser | null;
  session: SupabaseSession | null;
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
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Sign up failed');

    // Create user profile row
    const {error: profileError} = await supabase
      .from('users')
      .insert({id: data.user.id, display_name: name});

    if (profileError) throw new Error(profileError.message);

    if (data.session) {
      await SessionManager.persistSession(data.session);
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

    await SessionManager.persistSession(data.session);

    return {
      user: {id: data.session.user.id, email: cleanEmail},
      session: data.session,
    };
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
    await SessionManager.clearSession();
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

    // Remove user data in order: push_tokens, contacts, users profile
    await supabase.from('push_tokens').delete().eq('user_id', userId);
    await supabase
      .from('contacts')
      .delete()
      .or(`user_id.eq.${userId},contact_user_id.eq.${userId}`);
    await supabase.from('users').delete().eq('id', userId);

    // Delete auth account — requires service-role key on server in production
    await supabase.auth.admin.deleteUser(userId);
    await SessionManager.clearSession();
  },

  async getSession(): Promise<SupabaseSession | null> {
    const {data, error} = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
  },

  async refreshToken(): Promise<SupabaseSession | null> {
    const {data, error} = await supabase.auth.refreshSession();
    if (error) throw new Error(error.message);

    if (data.session) {
      await SessionManager.persistSession(data.session);
    }

    return data.session;
  },

  onAuthStateChange(
    callback: (event: string, session: SupabaseSession | null) => void,
  ): {unsubscribe: () => void} {
    const {data} = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  },
};
