import React, {createContext, useContext, useEffect, useRef, useState, useCallback} from 'react';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Config from 'react-native-config';
import {SignalingClient, type ConnectionState} from '../services/signaling/SignalingClient';
import {CallManager} from '../services/call/CallManager';
import {type CallStateValue, createIdleState} from '../services/call/CallState';
import {PermissionsService} from '../services/native/PermissionsService';
import {useAuth} from './authStore';
import type {RootStackParamList} from '../navigation/types';
import type {ServerMessage} from '@farscry/shared';

const SIGNALING_URL = Config.SIGNALING_URL ?? 'ws://localhost:8080';

type CallContextValue = {
  callManager: CallManager | null;
  signalingState: ConnectionState;
  callState: CallStateValue;
  startCall: (remoteUserId: string, remoteName: string) => Promise<void>;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({children}: {children: React.ReactNode}) {
  const {user, session} = useAuth();
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

  const startCall = useCallback(
    async (remoteUserId: string, remoteName: string) => {
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
    },
    [navigation],
  );

  const value: CallContextValue = {
    callManager: callManagerRef.current,
    signalingState,
    callState,
    startCall,
  };

  return React.createElement(CallContext.Provider, {value}, children);
}

export function useCallContext(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCallContext must be used within CallProvider');
  }
  return ctx;
}
