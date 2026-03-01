import type { PushToken } from '@farscry/shared';
import { logger } from './logger.js';

export interface IncomingCallPush {
  callId: string;
  callerId: string;
  callerName: string;
}

export interface PushProvider {
  send(token: PushToken, payload: IncomingCallPush): Promise<void>;
}

// TODO: Implement with @parse/node-apn or a direct HTTP/2 APNs client
class ApnsProvider implements PushProvider {
  async send(token: PushToken, payload: IncomingCallPush): Promise<void> {
    const pushTarget = token.voipToken ?? token.token;
    logger.info('APNs push (stub)', { callId: payload.callId, target: pushTarget.slice(0, 8) });
  }
}

// TODO: Implement with firebase-admin SDK
class FcmProvider implements PushProvider {
  async send(token: PushToken, payload: IncomingCallPush): Promise<void> {
    logger.info('FCM push (stub)', { callId: payload.callId, target: token.token.slice(0, 8) });
  }
}

export class PushNotificationService {
  private apns = new ApnsProvider();
  private fcm = new FcmProvider();

  async sendIncomingCall(token: PushToken, payload: IncomingCallPush): Promise<void> {
    const provider = token.platform === 'ios' ? this.apns : this.fcm;
    try {
      await provider.send(token, payload);
    } catch (err) {
      logger.error('Push notification failed', {
        platform: token.platform,
        callId: payload.callId,
        error: String(err),
      });
    }
  }
}
