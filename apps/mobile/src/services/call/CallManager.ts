import type { ServerMessage, CallEndReason } from '@farscry/shared';
import { CALL_TIMEOUT_MS } from '@farscry/shared';
import { SignalingClient } from '../signaling/SignalingClient';
import { WebRTCService } from '../webrtc/WebRTCService';
import { MediaService } from '../webrtc/MediaService';
import { configureIce, type IceConfig } from '../webrtc/IceConfig';
import {
  type CallStateValue,
  type CallPhase,
  createIdleState,
  createOutgoingCall,
  createIncomingCall,
  transitionTo,
} from './CallState';

export type CallStateListener = (state: CallStateValue) => void;

export class CallManager {
  private signaling: SignalingClient;
  private webrtc = new WebRTCService();
  private media = new MediaService();
  private iceConfig: IceConfig;
  private _state: CallStateValue = createIdleState();
  private stateListeners = new Set<CallStateListener>();
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubSignaling: (() => void) | null = null;

  constructor(signaling: SignalingClient, turnCredentials?: { username: string; credential: string }) {
    this.signaling = signaling;
    this.iceConfig = configureIce(turnCredentials);
    this.listenToSignaling();
  }

  get state(): CallStateValue {
    return this._state;
  }

  get mediaService(): MediaService {
    return this.media;
  }

  get webrtcService(): WebRTCService {
    return this.webrtc;
  }

  onStateChange(listener: CallStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  async startCall(remoteUserId: string): Promise<string> {
    if (this._state.phase !== 'idle') {
      throw new Error(`Cannot start call in phase: ${this._state.phase}`);
    }

    const callId = generateCallId();
    this.setState(createOutgoingCall(callId, remoteUserId));
    this.listenToSignaling();

    try {
      const stream = await this.media.acquireStream();
      this.webrtc.createConnection(this.iceConfig, {
        onIceCandidate: (candidate) => {
          this.signaling.sendIceCandidate({ callId, targetUserId: remoteUserId, ...candidate });
        },
        onRemoteStream: () => {},
        onConnectionStateChange: (state) => this.handleConnectionState(state),
      });
      this.webrtc.attachLocalStream(stream);
      const sdp = await this.webrtc.createOffer();
      this.signaling.sendOffer({ callId, targetUserId: remoteUserId, sdp });
      this.startTimeout();
      return callId;
    } catch (err) {
      this.endCall('failed');
      throw err;
    }
  }

  async acceptCall(): Promise<void> {
    if (this._state.phase !== 'incoming_ringing') {
      throw new Error(`Cannot accept call in phase: ${this._state.phase}`);
    }

    const { callId, remoteUserId } = this._state.call;
    this.clearTimeout();
    this.transition('connecting');

    try {
      const stream = await this.media.acquireStream();
      this.webrtc.attachLocalStream(stream);
      const sdp = await this.webrtc.createAnswer();
      this.signaling.sendAnswer({ callId, targetUserId: remoteUserId, sdp });
    } catch (err) {
      this.endCall('failed');
      throw err;
    }
  }

  declineCall() {
    if (this._state.phase !== 'incoming_ringing') return;
    const { callId, remoteUserId } = this._state.call;
    this.signaling.sendDecline({ callId, targetUserId: remoteUserId, reason: 'declined' });
    this.endCall('declined');
  }

  cancelCall() {
    if (this._state.phase !== 'outgoing_ringing') return;
    const { callId, remoteUserId } = this._state.call;
    this.signaling.sendCancel({ callId, targetUserId: remoteUserId });
    this.endCall('cancelled');
  }

  hangup() {
    if (this._state.phase === 'idle' || this._state.phase === 'ended') return;
    const { callId, remoteUserId } = this._state.call;
    this.signaling.sendHangup({ callId, targetUserId: remoteUserId });
    this.endCall('completed');
  }

  private handleSignalingMessage = (message: ServerMessage) => {
    if (this._state.phase === 'idle' && message.type === 'call:incoming') {
      this.handleIncomingCall(message.callId, message.callerId, message.callerName, message.sdp);
      return;
    }

    if (this._state.phase === 'idle') return;
    const { callId } = this._state.call;

    switch (message.type) {
      case 'call:answered':
        if (message.callId === callId) this.handleAnswered(message.sdp);
        break;
      case 'ice:candidate':
        if (message.callId === callId) {
          this.webrtc.addIceCandidate(message.candidate, message.sdpMid, message.sdpMLineIndex);
        }
        break;
      case 'call:declined':
        if (message.callId === callId) this.endCall(message.reason === 'busy' ? 'busy' : 'declined');
        break;
      case 'call:hungup':
        if (message.callId === callId) this.endCall('completed');
        break;
      case 'call:cancelled':
        if (message.callId === callId) this.endCall('cancelled');
        break;
      case 'call:timeout':
        if (message.callId === callId) this.endCall('timeout');
        break;
    }
  };

  private async handleIncomingCall(callId: string, callerId: string, callerName: string, sdp: string) {
    this.setState(createIncomingCall(callId, callerId, callerName));
    this.listenToSignaling();

    this.webrtc.createConnection(this.iceConfig, {
      onIceCandidate: (candidate) => {
        this.signaling.sendIceCandidate({ callId, targetUserId: callerId, ...candidate });
      },
      onRemoteStream: () => {},
      onConnectionStateChange: (state) => this.handleConnectionState(state),
    });

    await this.webrtc.setRemoteDescription('offer', sdp);
    this.startTimeout();
  }

  private async handleAnswered(sdp: string) {
    this.clearTimeout();
    this.transition('connecting');
    await this.webrtc.setRemoteDescription('answer', sdp);
  }

  private handleConnectionState(state: string) {
    if (state === 'connected' && this._state.phase === 'connecting') {
      this.transition('active');
    }
    if (state === 'failed' || state === 'disconnected') {
      if (this._state.phase === 'active' || this._state.phase === 'connecting') {
        this.endCall('failed');
      }
    }
  }

  private endCall(reason: CallEndReason) {
    this.clearTimeout();
    this.setState(transitionTo(this._state, 'ended', reason));
    this.teardown();

    setTimeout(() => {
      this.setState(createIdleState());
    }, 3000);
  }

  private transition(phase: CallPhase) {
    this.setState(transitionTo(this._state, phase));
  }

  private setState(state: CallStateValue) {
    this._state = state;
    this.stateListeners.forEach((fn) => fn(state));
  }

  private listenToSignaling() {
    if (this.unsubSignaling) return;
    this.unsubSignaling = this.signaling.onMessage(this.handleSignalingMessage);
  }

  private startTimeout() {
    this.clearTimeout();
    this.timeoutTimer = setTimeout(() => {
      if (this._state.phase === 'outgoing_ringing' || this._state.phase === 'incoming_ringing') {
        this.endCall('timeout');
      }
    }, CALL_TIMEOUT_MS);
  }

  private clearTimeout() {
    if (this.timeoutTimer) {
      globalThis.clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private teardown() {
    this.webrtc.cleanup();
    this.media.release();
    // Don't unsubscribe from signaling here — the listener persists
    // for the lifetime of the CallManager to handle subsequent calls.
  }

  destroy() {
    this.teardown();
    this.clearTimeout();
    this.stateListeners.clear();
  }
}

function generateCallId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
