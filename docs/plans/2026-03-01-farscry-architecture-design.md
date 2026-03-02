# Farscry Architecture Design

> Private, cross-platform video calling app. No chat. No bloat. Just calls.

## Status

**Phase:** Architecture design (pre-implementation)
**Approach:** Architecture-first deep dive. Gav leads engineering with AI assistance — no black-box vibe coding.

---

## Key Decisions

### Product & Business

- **v1:** Paid product on managed infrastructure (Supabase)
- **v2:** Self-hostable via Docker Compose (full self-hosted stack replacing Supabase)
- **Self-hosting is a selling point** but ships after launch. Communicated to users early.
- **Monetization:** Planned (details TBD in this doc)

### Identity & Auth

- **Primary identifier:** Phone number
- **Secondary identifier:** Email
- **Phone verification:** Skipped for now — phone numbers as identifiers without OTP verification
- **Current auth:** Supabase email/password (will be reworked)
- **v2 auth:** Custom auth service in Docker stack

### Data & Encryption

- **E2E encryption with user keys** — server is zero-knowledge
- **Client-side key management:** Each user has a keypair
- **Contact lists, metadata encrypted client-side** before storage
- **Contact discovery:** Hashed identifiers (phone number + email hashes) for matching
- **WebRTC media:** Already E2E encrypted (DTLS-SRTP)

### Native Integration

- **Full native call UI** — CallKit (iOS) + ConnectionService (Android)
- **Push notifications:** APNs VoIP push (iOS) + FCM high-priority data messages (Android)
- **Speakerphone by default** — remove ear speaker option entirely (this is video calling, not phone calling)
- **Native contacts integration** — read phone contacts, cross-reference against database

### Infrastructure

- **v1 backend:** Supabase (managed Postgres, Auth, hosting)
- **v1 signaling:** Node.js WebSocket server (existing, to be refined)
- **TURN servers:** Not bundled. Self-hosters set up their own if needed. v1 uses Cloudflare free TURN.
- **Push delivery:** TBD (signaling server vs separate service vs Supabase Edge Functions)

### UI/Theming

- **Color change:** Orange (#FF6B35) → Green (palette TBD)
- **Dark mode only** for v1
- **Material You on Android:** Future goal

---

## Architecture Layers (Deep Dive Plan)

Each layer to be discussed in detail across focused sessions. For each layer: what it does, how the protocol/technology works, design decisions, and how it connects to other layers.

1. **Identity & Auth** — How users exist in the system, phone number + email, JWT tokens
2. **Data Layer** — Postgres schema, what's stored, what's encrypted client-side
3. **E2E Encryption** — Key generation, storage, exchange, contact discovery with hashed identifiers
4. **Signaling** — WebSocket protocol, message types, call initiation flow
5. **Push Notifications** — APNs VoIP push, FCM high-priority, waking the app
6. **Native Call Integration** — CallKit (iOS), ConnectionService (Android), OS-level call UI
7. **WebRTC** — ICE/STUN/TURN, SDP offers/answers, media streams, audio routing
8. **Mobile App Architecture** — Screen flow, state management, service layer
9. **Theming** — Green palette, dark mode, Material You path
10. **Deployment** — Supabase v1 setup, Docker Compose v2 design

---

## Current State (Proof of Concept)

### What Exists

- React Native monorepo (iOS + Android)
- Node.js WebSocket signaling server
- Supabase for auth (email/password) + Postgres database
- WebRTC P2P calling with DTLS-SRTP
- CallKit/ConnectionService libraries installed but push not wired up
- Dark mode UI with orange accent

### What Works

- Basic video calling when both apps are open
- User registration and login
- Contact list (database-backed, no caching, no native contacts)
- Signaling with auto-reconnect

### Known Issues (tracked in GAV-77)

- Calls only work with app open (no push notifications)
- Audio through ear speaker only (should be speakerphone)
- Contacts not cached, slow to load
- No native phone contacts integration
- No encryption on stored data
- Orange theme (should be green)
- Xcode build warnings
- FCM not implemented (Android push)
- Push token delivery is stubbed out

---

## Engineering Approach

- **Gav does the engineering** — understands every line, can defend every decision
- **AI assists** — explains concepts, reviews code, helps with unfamiliar APIs
- **No black boxes** — if you don't understand it, don't ship it
- **Architecture-first** — full understanding before implementation
- **Small tasks** — each implementable in a focused evening session
- **Layer by layer** — learn, design, implement one component at a time

---

## Next Steps

1. Deep dive sessions on each architecture layer (2-3 layers per session)
2. After all layers are understood, produce implementation task breakdown
3. Create Linear tickets for each implementation task
4. Build layer by layer, testing each before moving to the next
