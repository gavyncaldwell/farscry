import AsyncStorage from '@react-native-async-storage/async-storage';
import type {SupabaseSession} from '../supabase/client';

const SESSION_KEY = '@farscry/session';
const EXPIRY_BUFFER_MS = 60_000; // refresh 1 minute before expiry

export const SessionManager = {
  async persistSession(session: SupabaseSession): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },

  async loadSession(): Promise<SupabaseSession | null> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
      const session: SupabaseSession = JSON.parse(raw);
      return this.isSessionValid(session) ? session : null;
    } catch {
      await this.clearSession();
      return null;
    }
  },

  async clearSession(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  },

  isSessionValid(session: SupabaseSession): boolean {
    if (!session.access_token || !session.refresh_token) return false;
    if (!session.expires_at) return false;
    // Expired sessions can still be refreshed, so only reject
    // if we have no refresh token to work with
    return true;
  },

  isExpiringSoon(session: SupabaseSession): boolean {
    return session.expires_at * 1000 - Date.now() < EXPIRY_BUFFER_MS;
  },
};
