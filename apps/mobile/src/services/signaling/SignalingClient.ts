import type {
  ClientMessage,
  ServerMessage,
  CallOfferMessage,
  CallAnswerMessage,
  IceCandidateMessage,
  CallDeclineMessage,
  CallHangupMessage,
  CallCancelMessage,
} from '@farscry/shared';
import { HEARTBEAT_INTERVAL_MS, WS_CLOSE_NORMAL } from '@farscry/shared';
import { ReconnectionManager } from './ReconnectionManager';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
export type SignalingListener = (message: ServerMessage) => void;
export type ConnectionStateListener = (state: ConnectionState) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnection = new ReconnectionManager();
  private listeners = new Set<SignalingListener>();
  private stateListeners = new Set<ConnectionStateListener>();
  private _state: ConnectionState = 'disconnected';
  private serverUrl: string;
  private authToken: string = '';
  private userId: string = '';
  private shouldReconnect = false;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  get state(): ConnectionState {
    return this._state;
  }

  connect(userId: string, token: string) {
    this.userId = userId;
    this.authToken = token;
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect() {
    this.cleanup();
    this.setState('connecting');

    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnection.reset();
      this.startHeartbeat();
      this.send({ type: 'register', userId: this.userId, token: this.authToken });
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;

      if (message.type === 'pong') return;

      this.listeners.forEach((fn) => fn(message));
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      this.setState('disconnected');

      if (this.shouldReconnect && event.code !== WS_CLOSE_NORMAL) {
        this.reconnection.scheduleReconnect(() => this.doConnect());
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this, handling reconnection
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.reconnection.cancelPending();
    if (this.ws) {
      this.ws.close(WS_CLOSE_NORMAL);
    }
    this.cleanup();
    this.setState('disconnected');
  }

  onMessage(listener: SignalingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  sendOffer(msg: Omit<CallOfferMessage, 'type'>) {
    this.send({ type: 'call:offer', ...msg });
  }

  sendAnswer(msg: Omit<CallAnswerMessage, 'type'>) {
    this.send({ type: 'call:answer', ...msg });
  }

  sendIceCandidate(msg: Omit<IceCandidateMessage, 'type'>) {
    this.send({ type: 'ice:candidate', ...msg });
  }

  sendDecline(msg: Omit<CallDeclineMessage, 'type'>) {
    this.send({ type: 'call:decline', ...msg });
  }

  sendHangup(msg: Omit<CallHangupMessage, 'type'>) {
    this.send({ type: 'call:hangup', ...msg });
  }

  sendCancel(msg: Omit<CallCancelMessage, 'type'>) {
    this.send({ type: 'call:cancel', ...msg });
  }

  private send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(state: ConnectionState) {
    if (this._state === state) return;
    this._state = state;
    this.stateListeners.forEach((fn) => fn(state));
  }

  private cleanup() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws = null;
    }
  }
}
