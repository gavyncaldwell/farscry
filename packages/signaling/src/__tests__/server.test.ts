import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// Mock auth module so tests don't need a real JWT secret.
// vi.mock is hoisted before imports by vitest, so the static import below
// will receive the mocked version.
vi.mock('../auth.js', () => ({
  validateToken: vi.fn(async (token: string) => {
    if (token === 'not-a-jwt') {
      return { valid: false, error: 'invalid token' };
    }
    try {
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return { valid: true, userId: payload.sub };
    } catch {
      return { valid: false, error: 'invalid token' };
    }
  }),
}));

import { SignalingServer } from '../server.js';

function makeToken(sub: string, exp?: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub, exp: exp ?? Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const sig = Buffer.from('stub-signature').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage<T = unknown>(ws: WebSocket): Promise<T> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

function register(ws: WebSocket, userId: string): Promise<unknown> {
  const promise = waitForMessage(ws);
  ws.send(JSON.stringify({
    type: 'register',
    userId,
    token: makeToken(userId),
  }));
  return promise;
}

describe('SignalingServer', () => {
  let httpServer: Server;
  let wss: WebSocketServer;
  let signaling: SignalingServer;
  let port: number;

  beforeEach(async () => {
    httpServer = createServer();
    wss = new WebSocketServer({ server: httpServer });
    signaling = new SignalingServer(wss);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' ? addr!.port : 0;
        resolve();
      });
    });
  });

  afterEach(() => {
    signaling.dispose();
    httpServer.close();
  });

  it('registers a client', async () => {
    const ws = await connect(port);
    const resp = await register(ws, 'alice') as { type: string; userId: string };
    expect(resp.type).toBe('registered');
    expect(resp.userId).toBe('alice');
    expect(signaling.connectionCount).toBe(1);
    ws.close();
  });

  it('rejects invalid token', async () => {
    const ws = await connect(port);
    const promise = waitForMessage(ws);
    ws.send(JSON.stringify({
      type: 'register',
      userId: 'alice',
      token: 'not-a-jwt',
    }));
    const resp = await promise as { type: string; code: string };
    expect(resp.type).toBe('error');
    expect(resp.code).toBe('auth_failed');
    ws.close();
  });

  it('rejects token with mismatched userId', async () => {
    const ws = await connect(port);
    const promise = waitForMessage(ws);
    ws.send(JSON.stringify({
      type: 'register',
      userId: 'alice',
      token: makeToken('bob'),
    }));
    const resp = await promise as { type: string; code: string };
    expect(resp.type).toBe('error');
    expect(resp.code).toBe('auth_failed');
    ws.close();
  });

  it('handles duplicate connections', async () => {
    const ws1 = await connect(port);
    await register(ws1, 'alice');

    const ws1Error = waitForMessage(ws1);

    const ws2 = await connect(port);
    await register(ws2, 'alice');

    const errorMsg = await ws1Error as { type: string; code: string };
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.code).toBe('duplicate');

    expect(signaling.connectionCount).toBe(1);
    ws1.close();
    ws2.close();
  });

  it('responds to ping with pong', async () => {
    const ws = await connect(port);
    await register(ws, 'alice');

    const promise = waitForMessage(ws);
    ws.send(JSON.stringify({ type: 'ping' }));
    const resp = await promise as { type: string };
    expect(resp.type).toBe('pong');
    ws.close();
  });

  it('relays a call offer to callee', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    const bobMessage = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));

    const incoming = await bobMessage as { type: string; callId: string; callerId: string; sdp: string };
    expect(incoming.type).toBe('call:incoming');
    expect(incoming.callId).toBe('call-1');
    expect(incoming.callerId).toBe('alice');
    expect(incoming.sdp).toBe('offer-sdp');

    wsAlice.close();
    wsBob.close();
  });

  it('relays a call answer to caller', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    const aliceMessage = waitForMessage(wsAlice);
    wsBob.send(JSON.stringify({
      type: 'call:answer',
      callId: 'call-1',
      targetUserId: 'alice',
      sdp: 'answer-sdp',
    }));

    const answered = await aliceMessage as { type: string; sdp: string };
    expect(answered.type).toBe('call:answered');
    expect(answered.sdp).toBe('answer-sdp');

    wsAlice.close();
    wsBob.close();
  });

  it('relays ICE candidates', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    // Set up a call first
    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    const bobCandidate = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'ice:candidate',
      callId: 'call-1',
      targetUserId: 'bob',
      candidate: 'candidate-data',
      sdpMid: '0',
      sdpMLineIndex: 0,
    }));

    const relayed = await bobCandidate as { type: string; candidate: string };
    expect(relayed.type).toBe('ice:candidate');
    expect(relayed.candidate).toBe('candidate-data');

    wsAlice.close();
    wsBob.close();
  });

  it('handles call decline', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    const aliceMessage = waitForMessage(wsAlice);
    wsBob.send(JSON.stringify({
      type: 'call:decline',
      callId: 'call-1',
      targetUserId: 'alice',
      reason: 'declined',
    }));

    const declined = await aliceMessage as { type: string; reason: string };
    expect(declined.type).toBe('call:declined');
    expect(declined.reason).toBe('declined');

    wsAlice.close();
    wsBob.close();
  });

  it('handles call hangup', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    // Set up and answer call
    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    const aliceAnswer = waitForMessage(wsAlice);
    wsBob.send(JSON.stringify({
      type: 'call:answer',
      callId: 'call-1',
      targetUserId: 'alice',
      sdp: 'answer-sdp',
    }));
    await aliceAnswer;

    const bobHangup = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:hangup',
      callId: 'call-1',
      targetUserId: 'bob',
    }));

    const hungup = await bobHangup as { type: string; callId: string };
    expect(hungup.type).toBe('call:hungup');
    expect(hungup.callId).toBe('call-1');

    wsAlice.close();
    wsBob.close();
  });

  it('handles call cancel', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    const bobCancel = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:cancel',
      callId: 'call-1',
      targetUserId: 'bob',
    }));

    const cancelled = await bobCancel as { type: string; callId: string };
    expect(cancelled.type).toBe('call:cancelled');
    expect(cancelled.callId).toBe('call-1');

    wsAlice.close();
    wsBob.close();
  });

  it('rejects messages before registration', async () => {
    const ws = await connect(port);
    const promise = waitForMessage(ws);
    ws.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'sdp',
    }));
    const resp = await promise as { type: string; code: string };
    expect(resp.type).toBe('error');
    expect(resp.code).toBe('not_registered');
    ws.close();
  });

  it('prevents calling when already in a call', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    // Try to start a second call
    const errorMsg = waitForMessage(wsAlice);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-2',
      targetUserId: 'bob',
      sdp: 'offer-sdp-2',
    }));

    const error = await errorMsg as { type: string; code: string };
    expect(error.type).toBe('error');
    expect(error.code).toBe('already_in_call');

    wsAlice.close();
    wsBob.close();
  });

  it('cleans up calls when a user disconnects', async () => {
    const wsAlice = await connect(port);
    const wsBob = await connect(port);
    await register(wsAlice, 'alice');
    await register(wsBob, 'bob');

    const bobIncoming = waitForMessage(wsBob);
    wsAlice.send(JSON.stringify({
      type: 'call:offer',
      callId: 'call-1',
      targetUserId: 'bob',
      sdp: 'offer-sdp',
    }));
    await bobIncoming;

    // Alice disconnects during the call
    const bobHangup = waitForMessage(wsBob);
    wsAlice.close();

    const hungup = await bobHangup as { type: string; callId: string };
    expect(hungup.type).toBe('call:hungup');
    expect(hungup.callId).toBe('call-1');

    wsBob.close();
  });
});
