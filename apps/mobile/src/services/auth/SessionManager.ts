import type {Session} from '@supabase/supabase-js';

export const SessionManager = {
  isExpiringSoon(session: Session): boolean {
    const EXPIRY_BUFFER_MS = 60_000;
    return (session.expires_at ?? 0) * 1000 - Date.now() < EXPIRY_BUFFER_MS;
  },
};
