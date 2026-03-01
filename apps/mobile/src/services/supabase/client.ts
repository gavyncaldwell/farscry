// Placeholder Supabase client — replace URL and anon key with real values
// after installing @supabase/supabase-js.

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: {
    id: string;
    email?: string;
  };
};

export type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'USER_DELETED';

type AuthChangeCallback = (
  event: AuthChangeEvent,
  session: SupabaseSession | null,
) => void;

type Unsubscribe = { unsubscribe: () => void };

type QueryBuilder<T = Record<string, unknown>> = {
  select: (columns?: string) => QueryBuilder<T>;
  insert: (data: Partial<T> | Partial<T>[]) => QueryBuilder<T>;
  update: (data: Partial<T>) => QueryBuilder<T>;
  delete: () => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  neq: (column: string, value: unknown) => QueryBuilder<T>;
  ilike: (column: string, value: string) => QueryBuilder<T>;
  or: (filters: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  single: () => Promise<{ data: T | null; error: SupabaseError | null }>;
  maybeSingle: () => Promise<{ data: T | null; error: SupabaseError | null }>;
  then: Promise<{ data: T[] | null; error: SupabaseError | null }>['then'];
};

export type SupabaseError = {
  message: string;
  code?: string;
  status?: number;
};

type SupabaseAuth = {
  signUp: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ data: { user: { id: string } | null; session: SupabaseSession | null }; error: SupabaseError | null }>;

  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ data: { session: SupabaseSession | null }; error: SupabaseError | null }>;

  signOut: () => Promise<{ error: SupabaseError | null }>;

  getSession: () => Promise<{
    data: { session: SupabaseSession | null };
    error: SupabaseError | null;
  }>;

  refreshSession: () => Promise<{
    data: { session: SupabaseSession | null };
    error: SupabaseError | null;
  }>;

  resetPasswordForEmail: (
    email: string,
    options?: { redirectTo?: string },
  ) => Promise<{ error: SupabaseError | null }>;

  onAuthStateChange: (callback: AuthChangeCallback) => {
    data: { subscription: Unsubscribe };
  };

  admin: {
    deleteUser: (userId: string) => Promise<{ error: SupabaseError | null }>;
  };
};

export type SupabaseClient = {
  auth: SupabaseAuth;
  from: <T = Record<string, unknown>>(table: string) => QueryBuilder<T>;
  rpc: <T = unknown>(
    fn: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: SupabaseError | null }>;
};

// Stub — will throw at runtime until supabase-js is installed
function createClient(_url: string, _key: string): SupabaseClient {
  throw new Error(
    'Supabase client not configured. Install @supabase/supabase-js and update this file.',
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

export { SUPABASE_URL };
