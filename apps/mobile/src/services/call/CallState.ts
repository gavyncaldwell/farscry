import type { CallEndReason } from '@farscry/shared';

export type CallDirection = 'outgoing' | 'incoming';

export type CallPhase =
  | 'idle'
  | 'outgoing_ringing'
  | 'incoming_ringing'
  | 'connecting'
  | 'active'
  | 'ended';

export interface CallInfo {
  callId: string;
  remoteUserId: string;
  remoteName?: string;
  direction: CallDirection;
  phase: CallPhase;
  endReason?: CallEndReason;
  startedAt: number;
  connectedAt?: number;
}

export type CallStateValue =
  | { phase: 'idle' }
  | { phase: Exclude<CallPhase, 'idle'>; call: CallInfo };

const VALID_TRANSITIONS: Record<CallPhase, CallPhase[]> = {
  idle: ['outgoing_ringing', 'incoming_ringing'],
  outgoing_ringing: ['connecting', 'ended'],
  incoming_ringing: ['connecting', 'ended'],
  connecting: ['active', 'ended'],
  active: ['ended'],
  ended: ['idle'],
};

export function canTransition(from: CallPhase, to: CallPhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createIdleState(): CallStateValue {
  return { phase: 'idle' };
}

export function createOutgoingCall(callId: string, remoteUserId: string): CallStateValue {
  return {
    phase: 'outgoing_ringing',
    call: {
      callId,
      remoteUserId,
      direction: 'outgoing',
      phase: 'outgoing_ringing',
      startedAt: Date.now(),
    },
  };
}

export function createIncomingCall(callId: string, callerId: string, callerName: string): CallStateValue {
  return {
    phase: 'incoming_ringing',
    call: {
      callId,
      remoteUserId: callerId,
      remoteName: callerName,
      direction: 'incoming',
      phase: 'incoming_ringing',
      startedAt: Date.now(),
    },
  };
}

export function transitionTo(state: CallStateValue, newPhase: CallPhase, endReason?: CallEndReason): CallStateValue {
  if (state.phase === 'idle' || newPhase === 'idle') {
    return createIdleState();
  }

  if (!canTransition(state.phase, newPhase)) {
    return state;
  }

  const call = { ...state.call, phase: newPhase };

  if (newPhase === 'active') {
    call.connectedAt = Date.now();
  }
  if (newPhase === 'ended' && endReason) {
    call.endReason = endReason;
  }

  return { phase: newPhase, call } as CallStateValue;
}
