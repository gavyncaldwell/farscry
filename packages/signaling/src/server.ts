import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type {
  ClientMessage,
  RegisterMessage,
  CallOfferMessage,
  CallAnswerMessage,
  IceCandidateMessage,
  CallDeclineMessage,
  CallHangupMessage,
  CallCancelMessage,
} from '@farscry/shared';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS, WS_CLOSE_AUTH_FAILED, WS_CLOSE_DUPLICATE } from '@farscry/shared';
import { ClientConnection } from './connection.js';
import { CallSessionManager } from './session.js';
import { validateToken } from './auth.js';
import { PushNotificationService } from './push.js';
import { logger } from './logger.js';

const AUTH_TIMEOUT_MS = 10_000;

export class SignalingServer {
  private wss: WebSocketServer;
  private connections = new Map<string, ClientConnection>();
  private sessions = new CallSessionManager();
  private push = new PushNotificationService();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.startHeartbeat();
    logger.info('Signaling server started');
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get activeCallCount(): number {
    return this.sessions.activeCount;
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const conn = new ClientConnection(ws);
    const remoteAddr = req.socket.remoteAddress ?? 'unknown';
    logger.debug('New WebSocket connection', { remoteAddr });

    // Require authentication within a time window
    const authTimer = setTimeout(() => {
      if (!conn.isAuthenticated) {
        conn.sendError('auth_timeout', 'Authentication required');
        conn.close(WS_CLOSE_AUTH_FAILED, 'auth timeout');
      }
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(conn, message);
      } catch {
        conn.sendError('parse_error', 'Invalid message format');
      }
    });

    ws.on('pong', () => conn.recordPong());

    ws.on('close', () => {
      clearTimeout(authTimer);
      this.handleDisconnect(conn);
    });

    ws.on('error', (err) => {
      logger.warn('WebSocket error', { userId: conn.userId, error: err.message });
    });
  }

  private handleMessage(conn: ClientConnection, message: ClientMessage): void {
    if (message.type === 'register') {
      void this.handleRegister(conn, message);
      return;
    }

    if (message.type === 'ping') {
      conn.send({ type: 'pong' });
      return;
    }

    if (!conn.isAuthenticated) {
      conn.sendError('not_registered', 'Must register before sending messages');
      return;
    }

    switch (message.type) {
      case 'call:offer':
        this.handleOffer(conn, message);
        break;
      case 'call:answer':
        this.handleAnswer(conn, message);
        break;
      case 'ice:candidate':
        this.handleIceCandidate(conn, message);
        break;
      case 'call:decline':
        this.handleDecline(conn, message);
        break;
      case 'call:hangup':
        this.handleHangup(conn, message);
        break;
      case 'call:cancel':
        this.handleCancel(conn, message);
        break;
    }
  }

  private async handleRegister(conn: ClientConnection, msg: RegisterMessage): Promise<void> {
    const authResult = await validateToken(msg.token);
    if (!authResult.valid) {
      conn.sendError('auth_failed', authResult.error ?? 'Invalid token');
      conn.close(WS_CLOSE_AUTH_FAILED, 'auth failed');
      return;
    }

    // The userId in the register message must match the token's subject
    if (authResult.userId !== msg.userId) {
      conn.sendError('auth_failed', 'Token subject mismatch');
      conn.close(WS_CLOSE_AUTH_FAILED, 'subject mismatch');
      return;
    }

    // Close existing connection for this user (duplicate handling)
    const existing = this.connections.get(msg.userId);
    if (existing) {
      logger.info('Closing duplicate connection', { userId: msg.userId });
      existing.sendError('duplicate', 'Connected from another device');
      existing.close(WS_CLOSE_DUPLICATE, 'duplicate connection');
      this.connections.delete(msg.userId);
    }

    conn.userId = msg.userId;
    if (msg.pushToken) {
      conn.pushToken = msg.pushToken;
    }
    this.connections.set(msg.userId, conn);

    conn.send({ type: 'registered', userId: msg.userId });
    logger.info('Client registered', { userId: msg.userId });
  }

  private handleOffer(conn: ClientConnection, msg: CallOfferMessage): void {
    const callerId = conn.userId!;

    // Check if caller is already in a call
    const existingCall = this.sessions.findByUser(callerId);
    if (existingCall) {
      conn.sendError('already_in_call', 'You are already in a call');
      return;
    }

    const session = this.sessions.create(msg.callId, callerId, msg.targetUserId, (timedOut) => {
      // Ring timeout — notify both sides
      const callerConn = this.connections.get(timedOut.callerId);
      const calleeConn = this.connections.get(timedOut.calleeId);
      callerConn?.send({ type: 'call:timeout', callId: timedOut.id });
      calleeConn?.send({ type: 'call:timeout', callId: timedOut.id });
    });

    const callee = this.connections.get(msg.targetUserId);
    if (callee) {
      callee.send({
        type: 'call:incoming',
        callId: msg.callId,
        callerId,
        callerName: callerId, // TODO: Look up display name from user service
        sdp: msg.sdp,
      });
    } else if (conn.pushToken) {
      // Callee is offline — send push notification
      // TODO: look up callee's push token from DB instead of using caller's
      logger.info('Callee offline, would send push', { callId: msg.callId, calleeId: msg.targetUserId });
      // this.push.sendIncomingCall(calleePushToken, { ... });
    } else {
      // Nobody to notify — still create session for timeout handling
      logger.info('Callee offline, no push token available', { callId: session.id });
    }
  }

  private handleAnswer(conn: ClientConnection, msg: CallAnswerMessage): void {
    const session = this.sessions.get(msg.callId);
    if (!session) {
      conn.sendError('no_call', 'Call not found');
      return;
    }

    if (session.calleeId !== conn.userId) {
      conn.sendError('not_callee', 'Only the callee can answer');
      return;
    }

    const answered = this.sessions.answer(msg.callId);
    if (!answered) {
      conn.sendError('invalid_state', 'Call cannot be answered in current state');
      return;
    }

    const caller = this.connections.get(session.callerId);
    caller?.send({
      type: 'call:answered',
      callId: msg.callId,
      sdp: msg.sdp,
    });
  }

  private handleIceCandidate(conn: ClientConnection, msg: IceCandidateMessage): void {
    const session = this.sessions.get(msg.callId);
    if (!session) return; // Silently ignore stale candidates

    const target = this.connections.get(msg.targetUserId);
    target?.send({
      type: 'ice:candidate',
      callId: msg.callId,
      candidate: msg.candidate,
      sdpMid: msg.sdpMid,
      sdpMLineIndex: msg.sdpMLineIndex,
    });
  }

  private handleDecline(conn: ClientConnection, msg: CallDeclineMessage): void {
    const session = this.sessions.end(msg.callId, msg.reason);
    if (!session) return;

    const caller = this.connections.get(session.callerId);
    caller?.send({
      type: 'call:declined',
      callId: msg.callId,
      reason: msg.reason,
    });
  }

  private handleHangup(conn: ClientConnection, msg: CallHangupMessage): void {
    const session = this.sessions.end(msg.callId, 'completed');
    if (!session) return;

    const target = this.connections.get(msg.targetUserId);
    target?.send({ type: 'call:hungup', callId: msg.callId });
  }

  private handleCancel(conn: ClientConnection, msg: CallCancelMessage): void {
    const session = this.sessions.end(msg.callId, 'cancelled');
    if (!session) return;

    const callee = this.connections.get(session.calleeId);
    callee?.send({ type: 'call:cancelled', callId: msg.callId });
  }

  private handleDisconnect(conn: ClientConnection): void {
    if (!conn.userId) return;

    // Only remove if this is still the active connection for the user
    const current = this.connections.get(conn.userId);
    if (current === conn) {
      this.connections.delete(conn.userId);
      logger.info('Client disconnected', { userId: conn.userId });

      // End any active call for the disconnected user
      const session = this.sessions.findByUser(conn.userId);
      if (session) {
        const endedSession = this.sessions.end(session.id, 'failed');
        if (endedSession) {
          const peerId = endedSession.callerId === conn.userId
            ? endedSession.calleeId
            : endedSession.callerId;
          const peer = this.connections.get(peerId);
          peer?.send({ type: 'call:hungup', callId: endedSession.id });
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [userId, conn] of this.connections) {
        if (conn.isStale(HEARTBEAT_TIMEOUT_MS)) {
          logger.info('Terminating stale connection', { userId });
          conn.socket.terminate();
          this.connections.delete(userId);
          continue;
        }
        if (conn.isAlive) {
          conn.socket.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  dispose(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.sessions.dispose();
    for (const conn of this.connections.values()) {
      conn.close(1001, 'server shutting down');
    }
    this.connections.clear();
    this.wss.close();
    logger.info('Signaling server stopped');
  }
}
