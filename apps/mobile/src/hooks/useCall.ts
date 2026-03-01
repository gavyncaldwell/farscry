import { useState, useEffect, useCallback, useRef } from 'react';
import { CallManager } from '../services/call/CallManager';
import type { CallStateValue } from '../services/call/CallState';

export function useCall(callManager: CallManager) {
  const [state, setState] = useState<CallStateValue>(callManager.state);
  const managerRef = useRef(callManager);
  managerRef.current = callManager;

  useEffect(() => {
    return callManager.onStateChange(setState);
  }, [callManager]);

  const startCall = useCallback(
    (remoteUserId: string) => managerRef.current.startCall(remoteUserId),
    [],
  );

  const acceptCall = useCallback(
    () => managerRef.current.acceptCall(),
    [],
  );

  const declineCall = useCallback(
    () => managerRef.current.declineCall(),
    [],
  );

  const cancelCall = useCallback(
    () => managerRef.current.cancelCall(),
    [],
  );

  const hangup = useCallback(
    () => managerRef.current.hangup(),
    [],
  );

  return {
    state,
    phase: state.phase,
    call: state.phase !== 'idle' ? state.call : null,
    isIdle: state.phase === 'idle',
    isRinging: state.phase === 'outgoing_ringing' || state.phase === 'incoming_ringing',
    isActive: state.phase === 'active',
    startCall,
    acceptCall,
    declineCall,
    cancelCall,
    hangup,
  };
}
