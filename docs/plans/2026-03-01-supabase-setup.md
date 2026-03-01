# Supabase Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the existing stub Supabase services to a real Supabase backend so the app can be tested with real user accounts and contacts.

**Architecture:** Replace the stub `supabase/client.ts` with a real `@supabase/supabase-js` client configured with AsyncStorage for session persistence. The existing service layer (AuthService, UserService, ContactsService) already follows Supabase's API patterns — update them for real SDK types. Create database tables + RLS policies via SQL migration script.

**Tech Stack:** `@supabase/supabase-js` v2, `react-native-config`, `@react-native-async-storage/async-storage`, Supabase Auth (email+password)

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/mobile/package.json`

**Step 1: Install npm packages**

Run from project root:

```bash
cd /Users/gav/Programming/personal/farscry
npm install --workspace=com.farscry.app @supabase/supabase-js @react-native-async-storage/async-storage react-native-config
```

**Step 2: Install iOS pods**

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile/ios && bundle exec pod install
```

If `bundle` is not set up, use:

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile/ios && pod install
```

**Step 3: Commit**

```bash
git add apps/mobile/package.json package-lock.json apps/mobile/ios/Podfile.lock
git commit -m "Add Supabase JS SDK, AsyncStorage, and react-native-config"
```

---

## Task 2: Environment Config

**Files:**
- Create: `apps/mobile/.env.example`
- Create: `apps/mobile/.env` (gitignored)
- Modify: `apps/mobile/ios/Farscry/Info.plist` (for react-native-config if needed)

**Step 1: Create .env.example**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

**Step 2: Create .env with real credentials**

Ask the user for their Supabase project URL and anon key from their Supabase dashboard (Settings → API). Create `apps/mobile/.env` with the real values.

**Step 3: Verify .env is gitignored**

The root `.gitignore` already has `.env` and `.env.local` entries. Verify with:

```bash
git check-ignore apps/mobile/.env
```

Expected: `apps/mobile/.env`

**Step 4: Commit**

```bash
git add apps/mobile/.env.example
git commit -m "Add .env.example for Supabase config"
```

---

## Task 3: Replace Supabase Client Stub

**Files:**
- Rewrite: `apps/mobile/src/services/supabase/client.ts`

**Step 1: Rewrite client.ts**

Replace the entire file with:

```typescript
import 'react-native-url-polyfill/polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
import {AppState} from 'react-native';
import Config from 'react-native-config';

const supabaseUrl = Config.SUPABASE_URL ?? '';
const supabaseAnonKey = Config.SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials missing. Create apps/mobile/.env with SUPABASE_URL and SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Auto-refresh tokens when app comes to foreground
AppState.addEventListener('change', state => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
```

Note: Check if `react-native-url-polyfill` is needed. If the project targets React Native 0.84+ with Hermes, the URL API may be built in. If the import fails, remove it — the polyfill may not be necessary.

**Step 2: Check if react-native-url-polyfill is needed**

Run:

```bash
cd /Users/gav/Programming/personal/farscry && node -e "const {URL} = require('url'); console.log(new URL('https://example.com').hostname)"
```

If `react-native-url-polyfill` is needed (Supabase SDK requires URL API):

```bash
npm install --workspace=com.farscry.app react-native-url-polyfill
```

If NOT needed (RN 0.84+ with Hermes has URL built in), remove the `import 'react-native-url-polyfill/polyfill'` line from client.ts.

**Step 3: Commit**

```bash
git add apps/mobile/src/services/supabase/client.ts
git commit -m "Replace Supabase stub client with real SDK"
```

---

## Task 4: Update AuthService for Real SDK

**Files:**
- Modify: `apps/mobile/src/services/auth/AuthService.ts`
- Modify: `apps/mobile/src/services/auth/SessionManager.ts`

**Step 1: Rewrite AuthService.ts**

The existing AuthService already calls the correct Supabase methods (`supabase.auth.signUp`, etc.). The changes needed:

1. Remove import of `SupabaseSession` type — use `Session` from `@supabase/supabase-js`
2. Remove manual `SessionManager.persistSession` calls — the SDK auto-persists via AsyncStorage
3. Remove the profile insert from `signUp` — the database trigger handles it (see Task 6)
4. Remove `admin.deleteUser` call — anon key can't call admin endpoints

Replace the entire file:

```typescript
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
```

**Step 2: Simplify SessionManager.ts**

The SDK now handles session persistence via AsyncStorage. SessionManager is no longer needed for persist/load but keep it as a thin utility for any manual session checks. Replace the file:

```typescript
import type {Session} from '@supabase/supabase-js';

export const SessionManager = {
  isExpiringSoon(session: Session): boolean {
    const EXPIRY_BUFFER_MS = 60_000;
    return (session.expires_at ?? 0) * 1000 - Date.now() < EXPIRY_BUFFER_MS;
  },
};
```

**Step 3: Commit**

```bash
git add apps/mobile/src/services/auth/AuthService.ts apps/mobile/src/services/auth/SessionManager.ts
git commit -m "Update auth services to use real Supabase SDK"
```

---

## Task 5: Update UserService and ContactsService

**Files:**
- Modify: `apps/mobile/src/services/user/UserService.ts`
- Modify: `apps/mobile/src/services/user/ContactsService.ts`

**Step 1: Rewrite UserService.ts**

Remove the `from<T>()` generic (real SDK doesn't support it on `from()`). Add `.select()` after mutations to return data. Replace the entire file:

```typescript
import {supabase} from '../supabase/client';

export type UserProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = {
  display_name?: string;
  avatar_url?: string | null;
};

export const UserService = {
  async getProfile(userId: string): Promise<UserProfile> {
    const {data, error} = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);
    return data as UserProfile;
  },

  async updateProfile(updates: ProfileUpdate): Promise<UserProfile> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    if (updates.display_name !== undefined) {
      const name = updates.display_name.trim();
      if (!name) throw new Error('Display name cannot be empty');
      updates.display_name = name;
    }

    const {data, error} = await supabase
      .from('users')
      .update({...updates, updated_at: new Date().toISOString()})
      .eq('id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as UserProfile;
  },

  async searchUsers(query: string): Promise<UserProfile[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const {data, error} = await supabase
      .from('users')
      .select('*')
      .ilike('display_name', `%${trimmed}%`)
      .limit(20);

    if (error) throw new Error(error.message);
    return (data ?? []) as UserProfile[];
  },

  async getUserById(id: string): Promise<UserProfile | null> {
    const {data, error} = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as UserProfile | null;
  },
};
```

**Step 2: Rewrite ContactsService.ts**

Same changes — remove `from<T>()` generic, add `.select()` after `.insert()`:

```typescript
import {supabase} from '../supabase/client';
import type {UserProfile} from './UserService';

export type Contact = {
  user_id: string;
  contact_user_id: string;
  is_favorite: boolean;
  added_at: string;
  profile?: UserProfile;
};

export const ContactsService = {
  async getContacts(): Promise<Contact[]> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    const {data, error} = await supabase
      .from('contacts')
      .select('*, profile:users!contact_user_id(*)')
      .eq('user_id', userId)
      .order('added_at', {ascending: false});

    if (error) throw new Error(error.message);
    return (data ?? []) as Contact[];
  },

  async addContact(contactUserId: string): Promise<Contact> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    if (contactUserId === userId) {
      throw new Error('Cannot add yourself as a contact');
    }

    const {data, error} = await supabase
      .from('contacts')
      .insert({user_id: userId, contact_user_id: contactUserId})
      .select('*, profile:users!contact_user_id(*)')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Contact already added');
      }
      throw new Error(error.message);
    }
    return data as Contact;
  },

  async removeContact(contactUserId: string): Promise<void> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    const {error} = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', userId)
      .eq('contact_user_id', contactUserId);

    if (error) throw new Error(error.message);
  },

  async toggleFavorite(contactUserId: string): Promise<boolean> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    const {data: existing, error: fetchError} = await supabase
      .from('contacts')
      .select('is_favorite')
      .eq('user_id', userId)
      .eq('contact_user_id', contactUserId)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!existing) throw new Error('Contact not found');

    const newValue = !existing.is_favorite;

    const {error} = await supabase
      .from('contacts')
      .update({is_favorite: newValue})
      .eq('user_id', userId)
      .eq('contact_user_id', contactUserId);

    if (error) throw new Error(error.message);
    return newValue;
  },
};
```

**Step 3: Commit**

```bash
git add apps/mobile/src/services/user/UserService.ts apps/mobile/src/services/user/ContactsService.ts
git commit -m "Update UserService and ContactsService for real Supabase SDK"
```

---

## Task 6: Create SQL Migration Script

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

**Step 1: Create migration directory**

```bash
mkdir -p /Users/gav/Programming/personal/farscry/supabase/migrations
```

**Step 2: Write the SQL migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Farscry initial schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============================================
-- TABLES
-- ============================================

-- User profiles (synced from auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contacts
create table if not exists public.contacts (
  user_id uuid not null references public.users(id) on delete cascade,
  contact_user_id uuid not null references public.users(id) on delete cascade,
  is_favorite boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (user_id, contact_user_id),
  constraint no_self_contact check (user_id != contact_user_id)
);

-- Push notification tokens
create table if not exists public.push_tokens (
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  voip_token text,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

-- ============================================
-- INDEXES
-- ============================================

create index if not exists idx_contacts_contact_user on public.contacts(contact_user_id);
create index if not exists idx_contacts_user on public.contacts(user_id);
create index if not exists idx_users_display_name on public.users using gin (display_name gin_trgm_ops);

-- Enable the trigram extension for fuzzy display_name search
create extension if not exists pg_trgm;

-- ============================================
-- TRIGGER: Auto-create user profile on signup
-- ============================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

-- Drop trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.users enable row level security;
alter table public.contacts enable row level security;
alter table public.push_tokens enable row level security;

-- Users: anyone authenticated can read profiles (for search/contacts)
create policy "Users can read all profiles"
  on public.users for select
  to authenticated
  using (true);

-- Users: can only update own profile
create policy "Users can update own profile"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users: can delete own profile
create policy "Users can delete own profile"
  on public.users for delete
  to authenticated
  using (auth.uid() = id);

-- Contacts: can read own contacts
create policy "Users can read own contacts"
  on public.contacts for select
  to authenticated
  using (auth.uid() = user_id);

-- Contacts: can insert own contacts
create policy "Users can add contacts"
  on public.contacts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Contacts: can update own contacts (favorite toggle)
create policy "Users can update own contacts"
  on public.contacts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Contacts: can delete own contacts
create policy "Users can remove contacts"
  on public.contacts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Push tokens: full access to own tokens only
create policy "Users can manage own push tokens"
  on public.push_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Step 3: Run the migration**

The user must run this SQL in their Supabase dashboard:
1. Go to Supabase Dashboard → SQL Editor
2. Click "New query"
3. Paste the entire contents of `001_initial_schema.sql`
4. Click "Run"

**Step 4: Disable email confirmation for testing**

In Supabase Dashboard:
1. Go to Authentication → Providers → Email
2. Turn OFF "Confirm email" (so users can sign in immediately after signup)
3. This is for testing only — re-enable before production

**Step 5: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "Add initial database schema migration for users, contacts, push_tokens"
```

---

## Task 7: Update Auth Store

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts`

**Step 1: Rewrite authStore.ts**

Update to use real SDK types. The SDK handles session persistence, so the restore logic simplifies to just calling `supabase.auth.getSession()`:

```typescript
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
        if (result.session) {
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
      dispatch({
        type: 'SIGNED_IN',
        user: result.user,
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
```

**Step 2: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "Update authStore to use real Supabase session management"
```

---

## Task 8: Wire App Providers and Navigation

**Files:**
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`

**Step 1: Wrap App.tsx with AuthProvider and ContactsProvider**

```typescript
import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AuthProvider} from './src/stores/authStore';
import {ContactsProvider} from './src/stores/contactsStore';
import {RootNavigator} from './src/navigation/RootNavigator';
import {colors} from './src/theme/colors';

const navTheme = {
  dark: true,
  colors: {
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
  fonts: {
    regular: {fontFamily: 'System', fontWeight: '400' as const},
    medium: {fontFamily: 'System', fontWeight: '500' as const},
    bold: {fontFamily: 'System', fontWeight: '700' as const},
    heavy: {fontFamily: 'System', fontWeight: '900' as const},
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <AuthProvider>
        <ContactsProvider>
          <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />
            <NavigationContainer theme={navTheme}>
              <RootNavigator />
            </NavigationContainer>
          </SafeAreaProvider>
        </ContactsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
```

**Step 2: Wire RootNavigator to real auth state**

Replace the `useState(false)` with `useAuth()`:

```typescript
import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuth} from '../stores/authStore';
import {MainTabs} from './MainTabs';
import {LoginScreen} from '../screens/auth/LoginScreen';
import {SignupScreen} from '../screens/auth/SignupScreen';
import {OnboardingScreen} from '../screens/auth/OnboardingScreen';
import {IncomingCallScreen} from '../screens/call/IncomingCallScreen';
import {OutgoingCallScreen} from '../screens/call/OutgoingCallScreen';
import {ActiveCallScreen} from '../screens/call/ActiveCallScreen';
import {AddContactScreen} from '../screens/contacts/AddContactScreen';
import {ContactDetailScreen} from '../screens/contacts/ContactDetailScreen';
import {colors} from '../theme/colors';
import type {RootStackParamList, AuthStackParamList} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const {user, loading} = useAuth();

  if (loading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      {user ? (
        <>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Group
            screenOptions={{
              presentation: 'fullScreenModal',
              animation: 'fade',
            }}>
            <RootStack.Screen name="IncomingCall" component={IncomingCallScreen} />
            <RootStack.Screen name="OutgoingCall" component={OutgoingCallScreen} />
            <RootStack.Screen name="ActiveCall" component={ActiveCallScreen} />
          </RootStack.Group>
          <RootStack.Group screenOptions={{presentation: 'card'}}>
            <RootStack.Screen
              name="AddContact"
              component={AddContactScreen}
              options={{
                headerShown: true,
                headerStyle: {backgroundColor: colors.background},
                headerTintColor: colors.text,
                title: 'Add Contact',
              }}
            />
            <RootStack.Screen
              name="ContactDetail"
              component={ContactDetailScreen}
              options={{
                headerShown: true,
                headerStyle: {backgroundColor: colors.background},
                headerTintColor: colors.text,
                title: '',
              }}
            />
          </RootStack.Group>
        </>
      ) : (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}
```

**Step 3: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/src/navigation/RootNavigator.tsx
git commit -m "Wire AuthProvider, ContactsProvider, and auth-gated navigation"
```

---

## Task 9: Wire Auth Screens

**Files:**
- Modify: `apps/mobile/src/screens/auth/LoginScreen.tsx`
- Modify: `apps/mobile/src/screens/auth/SignupScreen.tsx`

**Step 1: Wire LoginScreen**

Add `useAuth()` hook and connect `handleLogin`. Add loading and error display:

In `LoginScreen.tsx`, make these changes:

1. Add imports: `import {useAuth} from '../../stores/authStore';` and `import {ActivityIndicator} from 'react-native';`
2. Inside the component, add: `const {signIn, loading, error, clearError} = useAuth();`
3. Replace `handleLogin`:
```typescript
async function handleLogin() {
  await signIn(email, password);
}
```
4. Add error display after the form inputs (before the button):
```tsx
{error && (
  <Text style={styles.errorText}>{error}</Text>
)}
```
5. Update the button to show loading state:
```tsx
<TouchableOpacity
  style={[styles.button, (!email || !password || loading) && styles.buttonDisabled]}
  onPress={handleLogin}
  activeOpacity={0.8}
  disabled={!email || !password || loading}>
  {loading ? (
    <ActivityIndicator color={colors.white} />
  ) : (
    <Text style={styles.buttonText}>Sign in</Text>
  )}
</TouchableOpacity>
```
6. Add to styles:
```typescript
errorText: {
  ...typography.footnote,
  color: colors.callRed,
  textAlign: 'center',
},
```
7. Clear error when navigating away — add `onPress` to signup link:
```typescript
onPress={() => { clearError(); navigation.navigate('Signup'); }}
```

**Step 2: Wire SignupScreen**

Same pattern. In `SignupScreen.tsx`:

1. Add imports: `import {useAuth} from '../../stores/authStore';` and `import {ActivityIndicator} from 'react-native';`
2. Inside the component: `const {signUp, loading, error, clearError} = useAuth();`
3. Replace `handleSignup`:
```typescript
async function handleSignup() {
  await signUp(email, password, displayName);
}
```
4. Add error display (same as login)
5. Update button with loading state (same pattern, disabled when `!isValid || loading`)
6. Add `errorText` style (same)
7. Clear error on navigate: `onPress={() => { clearError(); navigation.navigate('Login'); }}`

**Step 3: Commit**

```bash
git add apps/mobile/src/screens/auth/LoginScreen.tsx apps/mobile/src/screens/auth/SignupScreen.tsx
git commit -m "Wire login and signup screens to auth service"
```

---

## Task 10: Wire Contacts and Favorites Screens

**Files:**
- Modify: `apps/mobile/src/screens/main/ContactsScreen.tsx`
- Modify: `apps/mobile/src/screens/main/FavoritesScreen.tsx`
- Modify: `apps/mobile/src/screens/contacts/AddContactScreen.tsx`
- Modify: `apps/mobile/src/screens/contacts/ContactDetailScreen.tsx`

**Step 1: Wire ContactsScreen to real data**

Replace mock data with `useContacts()`:

1. Add import: `import {useContacts} from '../../stores/contactsStore';`
2. Remove `MOCK_CONTACTS` array and the local `Contact` type
3. Inside component, add:
```typescript
const {contacts, fetchContacts, loading} = useContacts();
```
4. Add useEffect to fetch contacts on mount:
```typescript
useEffect(() => { fetchContacts(); }, [fetchContacts]);
```
5. Update the `filtered` memo to use `contacts` instead of `MOCK_CONTACTS`:
```typescript
const filtered = useMemo(() => {
  if (!search.trim()) return contacts;
  const q = search.toLowerCase();
  return contacts.filter(c => {
    const name = c.profile?.display_name ?? '';
    return name.toLowerCase().includes(q);
  });
}, [search, contacts]);
```
6. Update `buildSections` to work with Contact type:
```typescript
function buildSections(items: Contact[]): Section[] {
  const map = new Map<string, Contact[]>();
  for (const c of items) {
    const name = c.profile?.display_name ?? '?';
    const letter = name.charAt(0).toUpperCase();
    const group = map.get(letter) ?? [];
    group.push(c);
    map.set(letter, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({title, data}));
}
```
7. Update `Section` type to use `Contact` from contactsStore
8. Update `renderItem` to use `item.profile?.display_name` and `item.contact_user_id`

**Step 2: Wire FavoritesScreen to real data**

1. Add import: `import {useContacts} from '../../stores/contactsStore';`
2. Remove `MOCK_FAVORITES` and local `FavoriteContact` type
3. Inside component: `const {favorites, fetchContacts} = useContacts();`
4. Add useEffect: `useEffect(() => { fetchContacts(); }, [fetchContacts]);`
5. Update references from `MOCK_FAVORITES` to `favorites`
6. Update renderItem to use `item.profile?.display_name` and `item.contact_user_id`

**Step 3: Wire AddContactScreen to real services**

1. Add imports:
```typescript
import {UserService, type UserProfile} from '../../services/user/UserService';
import {useContacts} from '../../stores/contactsStore';
```
2. Replace `MOCK_RESULTS` with real search using `UserService.searchUsers()`
3. Inside component: `const {addContact} = useContacts();`
4. Replace `handleSearch` with debounced search:
```typescript
async function handleSearch(text: string) {
  setQuery(text);
  if (text.trim().length >= 2) {
    try {
      const users = await UserService.searchUsers(text);
      setResults(users);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    }
  } else {
    setResults([]);
    setSearched(false);
  }
}
```
5. Replace `handleAdd`:
```typescript
async function handleAdd(user: UserProfile) {
  try {
    await addContact(user.id);
    navigation.goBack();
  } catch (e: unknown) {
    Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add contact');
  }
}
```
6. Update `SearchResult` type references to `UserProfile`
7. Update renderItem to use `item.display_name` instead of `item.name`/`item.username`

**Step 4: Wire ContactDetailScreen to real services**

1. Add import: `import {useContacts} from '../../stores/contactsStore';`
2. Inside component: `const {contacts, removeContact, toggleFavorite} = useContacts();`
3. Derive `isFavorite` from real data:
```typescript
const contact = contacts.find(c => c.contact_user_id === contactId);
const isFavorite = contact?.is_favorite ?? false;
```
4. Wire `handleRemove`:
```typescript
onPress: async () => {
  await removeContact(contactId);
  navigation.goBack();
},
```
5. Wire favorite toggle:
```typescript
onPress={() => toggleFavorite(contactId)}
```

**Step 5: Commit**

```bash
git add apps/mobile/src/screens/main/ContactsScreen.tsx apps/mobile/src/screens/main/FavoritesScreen.tsx apps/mobile/src/screens/contacts/AddContactScreen.tsx apps/mobile/src/screens/contacts/ContactDetailScreen.tsx
git commit -m "Wire contacts, favorites, and search screens to real Supabase data"
```

---

## Task 11: Update Signaling Server JWT Verification

**Files:**
- Modify: `packages/signaling/package.json`
- Modify: `packages/signaling/src/auth.ts`

**Step 1: Install jose in signaling package**

```bash
cd /Users/gav/Programming/personal/farscry
npm install --workspace=@farscry/signaling jose
```

**Step 2: Update auth.ts with real JWT verification**

Replace the file:

```typescript
import {jwtVerify} from 'jose';
import {logger} from './logger.js';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

let secretKey: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!secretKey) {
    if (!SUPABASE_JWT_SECRET) {
      throw new Error('SUPABASE_JWT_SECRET environment variable is not set');
    }
    secretKey = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  }
  return secretKey;
}

export async function validateToken(token: string): Promise<AuthResult> {
  try {
    if (!token || typeof token !== 'string') {
      return {valid: false, error: 'missing token'};
    }

    const {payload} = await jwtVerify(token, getSecret(), {
      audience: 'authenticated',
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      return {valid: false, error: 'missing subject claim'};
    }

    return {valid: true, userId: payload.sub};
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid token';
    logger.warn(`Token validation failed: ${message}`);
    return {valid: false, error: message};
  }
}
```

Note: `validateToken` is now `async`. All callers in `server.ts` that call `validateToken()` must `await` it. Check `server.ts` for call sites and add `await`.

**Step 3: Update server.ts call sites**

Search for `validateToken` usage in `server.ts` and ensure all calls use `await`. The function signature changed from sync to async.

**Step 4: Commit**

```bash
git add packages/signaling/package.json package-lock.json packages/signaling/src/auth.ts packages/signaling/src/server.ts
git commit -m "Add real JWT verification to signaling server using jose"
```

---

## Task 12: Verify and Test

**Step 1: TypeScript check**

```bash
cd /Users/gav/Programming/personal/farscry && npm run typecheck
```

Fix any type errors.

**Step 2: Build and run iOS**

```bash
cd /Users/gav/Programming/personal/farscry && npm run mobile:ios
```

**Step 3: Manual test checklist**

- [ ] App launches and shows onboarding/login screen
- [ ] Can navigate to signup screen
- [ ] Can create account with display name, email, password
- [ ] After signup, navigates to main tabs
- [ ] Can sign out (from settings)
- [ ] Can sign back in
- [ ] Session persists across app restart
- [ ] Can search for other users by display name
- [ ] Can add a contact
- [ ] Contacts appear in contacts list
- [ ] Can favorite/unfavorite a contact
- [ ] Favorites appear in favorites tab
- [ ] Can remove a contact

**Step 4: Final commit**

Fix any issues found during testing, then:

```bash
git add -A
git commit -m "Fix issues found during Supabase integration testing"
```
