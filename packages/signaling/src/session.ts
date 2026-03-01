import type { CallSession, CallEndReason } from '@farscry/shared';
import { CALL_TIMEOUT_MS } from '@farscry/shared';
import { logger } from './logger.js';

export type TimeoutCallback = (session: CallSession) => void;

export class CallSessionManager {
  private sessions = new Map<string, CallSession>();
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  create(callId: string, callerId: string, calleeId: string, onTimeout: TimeoutCallback): CallSession {
    this.cleanup(callId);

    const session: CallSession = {
      id: callId,
      callerId,
      calleeId,
      status: 'ringing',
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(callId, session);

    const timer = setTimeout(() => {
      const s = this.sessions.get(callId);
      if (s && s.status === 'ringing') {
        logger.info('Call timed out', { callId });
        s.status = 'ended';
        s.endedAt = new Date().toISOString();
        s.endReason = 'timeout';
        onTimeout(s);
        this.cleanup(callId);
      }
    }, CALL_TIMEOUT_MS);

    this.timeouts.set(callId, timer);
    logger.info('Call session created', { callId, callerId, calleeId });

    return session;
  }

  get(callId: string): CallSession | undefined {
    return this.sessions.get(callId);
  }

  answer(callId: string): CallSession | undefined {
    const session = this.sessions.get(callId);
    if (!session || session.status !== 'ringing') return undefined;

    session.status = 'connecting';
    session.answeredAt = new Date().toISOString();

    // Cancel ring timeout
    const timer = this.timeouts.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(callId);
    }

    return session;
  }

  end(callId: string, reason: CallEndReason): CallSession | undefined {
    const session = this.sessions.get(callId);
    if (!session) return undefined;

    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    session.endReason = reason;
    this.cleanup(callId);

    logger.info('Call session ended', { callId, reason });
    return session;
  }

  findByUser(userId: string): CallSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.status !== 'ended' &&
          (session.callerId === userId || session.calleeId === userId)) {
        return session;
      }
    }
    return undefined;
  }

  get activeCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.status !== 'ended') count++;
    }
    return count;
  }

  private cleanup(callId: string): void {
    this.sessions.delete(callId);
    const timer = this.timeouts.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(callId);
    }
  }

  dispose(): void {
    for (const timer of this.timeouts.values()) {
      clearTimeout(timer);
    }
    this.sessions.clear();
    this.timeouts.clear();
  }
}
