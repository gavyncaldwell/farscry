# Call Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install native dependencies, configure iOS, and wire signaling + call management into the app so two authenticated users on the same WiFi can make a real video call.

**Architecture:** Add a `CallProvider` (React context) that creates `SignalingClient` + `CallManager` when the user is authenticated, connects to the signaling server with the Supabase JWT, and navigates to call screens on incoming calls. Update existing call screens to use `useCallContext()` for real call actions.

**Tech Stack:** `react-native-webrtc`, `react-native-callkeep`, `react-native-incall-manager`, `react-native-permissions`, `react-native-voip-push-notification`, React Context

---

## Task 1: Install Native Dependencies

**Files:**
- Modify: `apps/mobile/package.json`

**Step 1: Install npm packages**

```bash
cd /Users/gav/Programming/personal/farscry
npm install --workspace=com.farscry.app react-native-webrtc react-native-callkeep react-native-incall-manager react-native-permissions react-native-voip-push-notification
```

**Step 2: Install iOS pods**

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile/ios && pod install
```

If `pod install` fails with version conflicts, try:

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile/ios && pod install --repo-update
```

**Step 3: Verify**

Check that `package.json` now lists all 5 packages in `dependencies`. Check that `Podfile.lock` has entries for the new pods.

**Step 4: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/package.json package-lock.json apps/mobile/ios/Podfile.lock apps/mobile/ios/Pods
git commit -m "Add native call dependencies (WebRTC, CallKeep, InCallManager, permissions, VoIP push)"
```

---

## Task 2: iOS Configuration (Info.plist)

**Files:**
- Modify: `apps/mobile/ios/Farscry/Info.plist`

**Step 1: Add permission strings and background modes**

Add these entries to `Info.plist` (inside the top-level `<dict>`):

```xml
<key>NSMicrophoneUsageDescription</key>
<string>Farscry needs microphone access for voice and video calls</string>
<key>NSCameraUsageDescription</key>
<string>Farscry needs camera access for video calls</string>
<key>UIBackgroundModes</key>
<array>
    <string>voip</string>
    <string>audio</string>
</array>
```

**Step 2: Verify**

Open `Info.plist` and confirm:
- `NSMicrophoneUsageDescription` is present
- `NSCameraUsageDescription` is present
- `UIBackgroundModes` contains `voip` and `audio`
- The old empty `NSLocationWhenInUseUsageDescription` can optionally be removed (it's not needed)

**Step 3: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/ios/Farscry/Info.plist
git commit -m "Add camera/mic permissions and VoIP background modes to Info.plist"
```

---

## Task 3: Add SIGNALING_URL to Environment Config

**Files:**
- Modify: `apps/mobile/.env`
- Modify: `apps/mobile/.env.example`

**Step 1: Add SIGNALING_URL to .env.example**

Append to `apps/mobile/.env.example`:

```
SIGNALING_URL=ws://localhost:8080
```

**Step 2: Add SIGNALING_URL to .env**

Append to `apps/mobile/.env`:

```
SIGNALING_URL=ws://localhost:8080
```

Note: For testing on physical devices, replace `localhost` with the Mac's LAN IP (e.g., `ws://192.168.1.42:8080`). The `NSAllowsLocalNetworking` key in `Info.plist` is already set to `true`, so local WebSocket connections will work.

**Step 3: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/.env.example
git commit -m "Add SIGNALING_URL to environment config"
```

Do NOT commit `.env` — it should be in `.gitignore`.

---

## Task 4: Create CallProvider (callStore.ts)

**Files:**
- Create: `apps/mobile/src/stores/callStore.ts`

**Step 1: Create the CallProvider**

This follows the exact same pattern as `authStore.ts` and `contactsStore.ts`. It:
- Reads auth state from `useAuth()`
- Creates `SignalingClient` and `CallManager` when session is available
- Connects to signaling server with user ID and access token
- Listens for incoming calls and navigates to `IncomingCallScreen`
- Disconnects on sign-out or unmount
- Exposes `callManager`, `signalingState`, and `callState` via context

```typescript
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Config from 'react-native-config';
import { SignalingClient, type ConnectionState } from '../services/signaling/SignalingClient';
import { CallManager } from '../services/call/CallManager';
import { type CallStateValue, createIdleState } from '../services/call/CallState';
import { PermissionsService } from '../services/native/PermissionsService';
import { useAuth } from './authStore';
import type { RootStackParamList } from '../navigation/types';
import type { ServerMessage } from '@farscry/shared';

const SIGNALING_URL = Config.SIGNALING_URL ?? 'ws://localhost:8080';

type CallContextValue = {
  callManager: CallManager | null;
  signalingState: ConnectionState;
  callState: CallStateValue;
  startCall: (remoteUserId: string, remoteName: string) => Promise<void>;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const signalingRef = useRef<SignalingClient | null>(null);
  const callManagerRef = useRef<CallManager | null>(null);

  const [signalingState, setSignalingState] = useState<ConnectionState>('disconnected');
  const [callState, setCallState] = useState<CallStateValue>(createIdleState());

  // Connect to signaling server when authenticated
  useEffect(() => {
    if (!user || !session?.access_token) {
      // Not authenticated — tear down if exists
      if (signalingRef.current) {
        signalingRef.current.disconnect();
        signalingRef.current = null;
      }
      if (callManagerRef.current) {
        callManagerRef.current.destroy();
        callManagerRef.current = null;
      }
      setSignalingState('disconnected');
      setCallState(createIdleState());
      return;
    }

    // Create signaling client and call manager
    const signaling = new SignalingClient(SIGNALING_URL);
    const manager = new CallManager(signaling);

    signalingRef.current = signaling;
    callManagerRef.current = manager;

    // Track signaling connection state
    const unsubState = signaling.onStateChange(setSignalingState);

    // Track call state
    const unsubCall = manager.onStateChange(setCallState);

    // Listen for incoming calls to navigate
    const unsubMessage = signaling.onMessage((message: ServerMessage) => {
      if (message.type === 'call:incoming') {
        navigation.navigate('IncomingCall', {
          callerId: message.callerId,
          callerName: message.callerName,
        });
      }
    });

    // Connect with auth
    signaling.connect(user.id, session.access_token);

    return () => {
      unsubState();
      unsubCall();
      unsubMessage();
      signaling.disconnect();
      manager.destroy();
      signalingRef.current = null;
      callManagerRef.current = null;
    };
  }, [user?.id, session?.access_token, navigation]);

  const startCall = useCallback(async (remoteUserId: string, remoteName: string) => {
    if (!callManagerRef.current) {
      throw new Error('Not connected to signaling server');
    }

    // Request permissions before starting call
    const perms = await PermissionsService.requestCallPermissions();
    if (perms.microphone !== 'granted') {
      throw new Error('Microphone permission is required for calls');
    }

    await callManagerRef.current.startCall(remoteUserId);
    navigation.navigate('OutgoingCall', {
      contactId: remoteUserId,
      contactName: remoteName,
    });
  }, [navigation]);

  const value: CallContextValue = {
    callManager: callManagerRef.current,
    signalingState,
    callState,
    startCall,
  };

  return React.createElement(CallContext.Provider, { value }, children);
}

export function useCallContext(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCallContext must be used within CallProvider');
  }
  return ctx;
}
```

**Step 2: Verify**

Run TypeScript type checking:

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile && npx tsc --noEmit
```

Fix any type errors. Note: there may be type errors from other files that import uninstalled packages — focus only on errors in `callStore.ts`.

**Step 3: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/src/stores/callStore.ts
git commit -m "Add CallProvider context for signaling and call management"
```

---

## Task 5: Wire CallProvider into App.tsx

**Files:**
- Modify: `apps/mobile/App.tsx`

**Step 1: Add CallProvider inside NavigationContainer**

The current `App.tsx` structure is:

```
GestureHandlerRootView
  AuthProvider
    ContactsProvider
      SafeAreaProvider
        StatusBar
        NavigationContainer
          RootNavigator
```

Change it to:

```
GestureHandlerRootView
  AuthProvider
    ContactsProvider
      SafeAreaProvider
        StatusBar
        NavigationContainer
          CallProvider          ← new
            RootNavigator
```

The diff: import `CallProvider` from `./src/stores/callStore` and wrap `<RootNavigator />` with `<CallProvider>`.

```typescript
import {CallProvider} from './src/stores/callStore';

// ... in the render:
<NavigationContainer theme={navTheme}>
  <CallProvider>
    <RootNavigator />
  </CallProvider>
</NavigationContainer>
```

**Step 2: Verify**

Run TypeScript type checking:

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile && npx tsc --noEmit
```

**Step 3: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/App.tsx
git commit -m "Wire CallProvider into app component tree"
```

---

## Task 6: Wire IncomingCallScreen to CallManager

**Files:**
- Modify: `apps/mobile/src/screens/call/IncomingCallScreen.tsx`

**Step 1: Connect accept/decline buttons to real call actions**

Currently the screen just navigates on accept and goes back on decline. Update it to:
- Import `useCallContext` from `../../stores/callStore`
- On accept: call `callManager.acceptCall()`, then navigate to `ActiveCall`
- On decline: call `callManager.declineCall()`, then go back

Replace `handleAccept` and `handleDecline`:

```typescript
import { useCallContext } from '../../stores/callStore';

// Inside the component:
const { callManager } = useCallContext();

function handleAccept() {
  callManager?.acceptCall();
  navigation.replace('ActiveCall', {
    contactId: route.params.callerId,
    contactName: callerName,
  });
}

function handleDecline() {
  callManager?.declineCall();
  navigation.goBack();
}
```

**Step 2: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/src/screens/call/IncomingCallScreen.tsx
git commit -m "Wire IncomingCallScreen to real CallManager actions"
```

---

## Task 7: Wire OutgoingCallScreen to CallManager

**Files:**
- Modify: `apps/mobile/src/screens/call/OutgoingCallScreen.tsx`

**Step 1: Connect cancel button and listen for call state changes**

The outgoing screen needs to:
- Call `callManager.cancelCall()` on cancel
- Listen for call state changes — when the call transitions to `connecting` or `active`, navigate to `ActiveCall`
- When the call ends (declined, timeout), go back

```typescript
import { useCallContext } from '../../stores/callStore';

// Inside the component:
const { callManager, callState } = useCallContext();

// Navigate on state transitions
useEffect(() => {
  if (callState.phase === 'connecting' || callState.phase === 'active') {
    navigation.replace('ActiveCall', {
      contactId: route.params.contactId,
      contactName: route.params.contactName,
    });
  }
  if (callState.phase === 'ended') {
    navigation.goBack();
  }
}, [callState.phase, navigation, route.params]);

function handleCancel() {
  callManager?.cancelCall();
  navigation.goBack();
}
```

**Step 2: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/src/screens/call/OutgoingCallScreen.tsx
git commit -m "Wire OutgoingCallScreen to real CallManager actions"
```

---

## Task 8: Wire ActiveCallScreen to CallManager

**Files:**
- Modify: `apps/mobile/src/screens/call/ActiveCallScreen.tsx`

**Step 1: Connect controls to real media and call actions**

The active call screen needs to:
- Use `useCallContext()` to get `callManager`
- Use `useCallControls(callManager.mediaService)` for mute/camera/speaker
- Call `callManager.hangup()` on hangup
- Listen for call state `ended` to navigate back

Replace the local state controls with real ones:

```typescript
import { useCallContext } from '../../stores/callStore';
import { useCallControls } from '../../hooks/useCallControls';

// Inside the component:
const { callManager, callState } = useCallContext();
const controls = callManager
  ? useCallControls(callManager.mediaService)
  : { isMuted: false, isCameraOff: false, isSpeakerOn: false, toggleMute: () => {}, toggleCamera: () => {}, toggleSpeaker: () => {} };

// Navigate back when call ends
useEffect(() => {
  if (callState.phase === 'ended' || callState.phase === 'idle') {
    navigation.goBack();
  }
}, [callState.phase, navigation]);

function handleHangup() {
  callManager?.hangup();
}

// In the render, replace the local state variables:
// muted → controls.isMuted
// cameraOff → controls.isCameraOff
// speakerOn → controls.isSpeakerOn
// onToggleMute → controls.toggleMute
// onToggleCamera → controls.toggleCamera
// onToggleSpeaker → controls.toggleSpeaker
```

Remove the old `useState` for `muted`, `cameraOff`, `speakerOn` — they're replaced by the hook.

**Step 2: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/src/screens/call/ActiveCallScreen.tsx
git commit -m "Wire ActiveCallScreen to real CallManager and media controls"
```

---

## Task 9: Add Call Button to Contact Screens

**Files:**
- Modify: `apps/mobile/src/screens/contacts/ContactDetailScreen.tsx`

**Step 1: Read the existing ContactDetailScreen**

Check what UI exists. If there's already a "Call" button that navigates to `OutgoingCall`, update it to use `useCallContext().startCall()` instead of raw navigation. If there's no call button, add one.

The `startCall` from `useCallContext` handles:
1. Requesting mic/camera permissions
2. Starting the call via `CallManager`
3. Navigating to `OutgoingCallScreen`

```typescript
import { useCallContext } from '../../stores/callStore';

// Inside the component:
const { startCall } = useCallContext();

async function handleCall() {
  try {
    await startCall(contactId, contactName);
  } catch (err) {
    // Show error (permission denied, not connected, etc.)
    console.error('Failed to start call:', err);
  }
}
```

**Step 2: Commit**

```bash
cd /Users/gav/Programming/personal/farscry
git add apps/mobile/src/screens/contacts/ContactDetailScreen.tsx
git commit -m "Wire contact detail call button to real call flow"
```

---

## Task 10: Verify End-to-End Build

**Step 1: TypeScript check**

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile && npx tsc --noEmit
```

Fix any type errors.

**Step 2: Build iOS**

```bash
cd /Users/gav/Programming/personal/farscry/apps/mobile && npx react-native run-ios
```

The app should build and launch in the simulator. Verify:
- App launches without crashes
- Auth screens render
- No red screen errors

Note: WebRTC camera/mic won't work in the simulator — that's expected. This step just verifies the build succeeds and the provider wiring doesn't crash.

**Step 3: Build signaling server**

```bash
cd /Users/gav/Programming/personal/farscry/packages/signaling && npm run build
```

**Step 4: Commit any remaining fixes**

```bash
cd /Users/gav/Programming/personal/farscry
git add -A
git commit -m "Fix build issues from call infrastructure integration"
```
