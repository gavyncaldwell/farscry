# Supabase Setup for Family Testing

**Date:** 2026-03-01
**Goal:** Connect existing stub services to a real Supabase backend so the app can be tested with real accounts.
**Out of scope:** Subscriptions, payments, entitlement gates. Everyone who signs up gets full access.

## Architecture

No structural changes. The existing service layer (AuthService, UserService, ContactsService) already models Supabase patterns. Replace stubs with real SDK calls and create the database schema.

## Auth Method

Email + password via Supabase Auth. Simple, works immediately.

## Config

`react-native-config` with `.env` at mobile app root:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

`.env` in `.gitignore`, `.env.example` committed with placeholder values.

## Database Schema

### users
- `id` uuid PRIMARY KEY (synced from auth.users via trigger)
- `display_name` text NOT NULL
- `avatar_url` text
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

### contacts
- `user_id` uuid REFERENCES users(id) ON DELETE CASCADE
- `contact_user_id` uuid REFERENCES users(id) ON DELETE CASCADE
- `is_favorite` boolean DEFAULT false
- `added_at` timestamptz DEFAULT now()
- PRIMARY KEY (user_id, contact_user_id)
- CHECK (user_id != contact_user_id)

### push_tokens
- `user_id` uuid REFERENCES users(id) ON DELETE CASCADE
- `token` text NOT NULL
- `platform` text NOT NULL CHECK (platform IN ('ios', 'android'))
- `voip_token` text
- `updated_at` timestamptz DEFAULT now()
- PRIMARY KEY (user_id, platform)

### Trigger
Auto-create `users` row when someone signs up via Supabase Auth, using email prefix as initial display_name.

### RLS Policies
- users: read own profile, read others' profiles (for contact search), update own profile only
- contacts: read/write own contacts, read contacts where you are the contact_user_id
- push_tokens: read/write own tokens only

## Changes

| Area | Change |
|------|--------|
| New deps | `@supabase/supabase-js`, `react-native-config`, `@react-native-async-storage/async-storage` |
| `supabase/client.ts` | Replace stub with real createClient() |
| `AuthService.ts` | Rewrite to use real supabase.auth.* methods |
| `SessionManager.ts` | Simplify — SDK handles token persistence |
| `UserService.ts` | Rewrite to use real supabase.from('users').* |
| `ContactsService.ts` | Rewrite with real queries + joins |
| `authStore.ts` | Use supabase.auth.onAuthStateChange() |
| `RootNavigator.tsx` | Wire isAuthenticated to auth state |
| SQL migration | Script for tables + RLS + triggers |
| signaling auth.ts | Real JWT verification with Supabase JWT secret |

## Unchanged
- Screen UI
- Navigation structure
- WebRTC/signaling infrastructure
- Call flow
- Native integrations (CallKit, push)
