# Call Infrastructure Setup for Family Testing

**Date:** 2026-03-01
**Goal:** Install native dependencies, configure iOS, wire signaling + call management into the app so two authenticated users on the same WiFi can make a real call.
**Prerequisites:** Supabase auth (being implemented separately).
**Out of scope:** TURN server, VoIP push notifications, Android-specific push (FCM). Both users will have the app foregrounded.

## Native Dependencies

| Package | Purpose |
|---------|---------|
| `react-native-webrtc` | RTCPeerConnection, MediaStream, getUserMedia |
| `react-native-callkeep` | CallKit (iOS) / ConnectionService (Android) native call UI |
| `react-native-incall-manager` | Earpiece/speaker routing, proximity sensor |
| `react-native-permissions` | Runtime mic + camera permission requests |
| `react-native-voip-push-notification` | iOS VoIP push token registration (installed now, wired later) |

## iOS Configuration

**Info.plist:**
- `NSMicrophoneUsageDescription` — "Farscry needs microphone access for voice and video calls"
- `NSCameraUsageDescription` — "Farscry needs camera access for video calls"
- `UIBackgroundModes` — `voip`, `audio`

No entitlements changes needed yet.

## Signaling URL

Add `SIGNALING_URL` to `.env` and `.env.example`. For local testing: `ws://<mac-ip>:8080`. The signaling server already listens on port 8080.

## CallProvider (Approach A — Context Provider)

New file: `src/stores/callStore.ts`, matching existing `authStore.ts` / `contactsStore.ts` pattern.

### Lifecycle

- When auth session is available: create `SignalingClient(SIGNALING_URL)`, create `CallManager(signalingClient)`, call `signalingClient.connect(userId, accessToken)`
- When auth session is gone: disconnect signaling, destroy CallManager
- On incoming call message: navigate to `IncomingCallScreen`

### Context Shape

```typescript
{
  callManager: CallManager | null;
  signalingState: 'disconnected' | 'connecting' | 'connected';
  callState: CallStateValue;
  startCall: (remoteUserId: string) => Promise<void>;
}
```

## App.tsx Wiring

```
AuthProvider
  ContactsProvider
    NavigationContainer
      CallProvider        ← new, inside NavigationContainer for navigation access
        RootNavigator
```

## Screen Updates

Call screens (`IncomingCallScreen`, `OutgoingCallScreen`, `ActiveCallScreen`) will use `useCallContext()` to wire buttons to `acceptCall()`, `declineCall()`, `hangup()`, etc.

Contact screens that initiate calls will use `useCallContext()` to call `startCall(userId)`.

## Network

Same WiFi only for initial testing. STUN servers (Google) are sufficient — no TURN needed.

## Unchanged

- Signaling server code (already functional)
- WebRTC/media service implementations (already written, just need the dependency installed)
- Call state machine
- Screen UI layouts
