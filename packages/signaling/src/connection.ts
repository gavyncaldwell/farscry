import WebSocket from 'ws';
import type { ServerMessage, PushToken } from '@farscry/shared';
import { logger } from './logger.js';

export class ClientConnection {
  readonly socket: WebSocket;
  userId: string | null = null;
  pushToken: PushToken | null = null;
  private lastPong: number = Date.now();

  constructor(socket: WebSocket) {
    this.socket = socket;
  }

  get isAuthenticated(): boolean {
    return this.userId !== null;
  }

  get isAlive(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  send(message: ServerMessage): void {
    if (!this.isAlive) return;
    this.socket.send(JSON.stringify(message));
  }

  sendError(code: string, message: string): void {
    this.send({ type: 'error', code, message });
  }

  recordPong(): void {
    this.lastPong = Date.now();
  }

  isStale(timeoutMs: number): boolean {
    return Date.now() - this.lastPong > timeoutMs;
  }

  close(code: number, reason: string): void {
    logger.debug('Closing connection', { userId: this.userId, code, reason });
    try {
      this.socket.close(code, reason);
    } catch {
      this.socket.terminate();
    }
  }
}
