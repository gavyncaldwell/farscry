import { Platform } from 'react-native';
import { CallKeepService } from './CallKeepService';

// ============================================================================
// iOS 13+ REQUIREMENT: Every VoIP push notification MUST immediately report
// a call to CallKit. If a VoIP push arrives and CallKit is not notified,
// the system will terminate the app and may revoke the PushKit token.
//
// The flow is: VoIP push received → parse payload → reportIncomingCall()
// There is NO optional step here. Even if the call is invalid, you must
// report and then immediately end it.
// ============================================================================

export interface PushTokens {
  /** FCM token (Android) or APN device token (iOS, for non-VoIP pushes) */
  pushToken: string | null;
  /** PushKit VoIP token, iOS only */
  voipToken: string | null;
}

export type TokenUpdateListener = (tokens: PushTokens) => void;

interface IncomingCallPayload {
  callId: string;
  callerId: string;
  callerName: string;
  hasVideo: boolean;
  uuid: string;
}

class PushServiceImpl {
  private tokens: PushTokens = { pushToken: null, voipToken: null };
  private tokenListeners = new Set<TokenUpdateListener>();
  private initialized = false;

  async initialize(): Promise<PushTokens> {
    if (this.initialized) return this.tokens;

    if (Platform.OS === 'ios') {
      await this.setupIOSPushKit();
    } else {
      await this.setupAndroidFCM();
    }

    this.initialized = true;
    return this.tokens;
  }

  onTokenUpdate(listener: TokenUpdateListener): () => void {
    this.tokenListeners.add(listener);
    return () => this.tokenListeners.delete(listener);
  }

  getTokens(): PushTokens {
    return { ...this.tokens };
  }

  // ---------------------------------------------------------------------------
  // iOS PushKit VoIP
  // ---------------------------------------------------------------------------

  private async setupIOSPushKit() {
    // Dynamic import — module only exists on iOS
    const VoipPushNotification = (await import('react-native-voip-push-notification')).default;

    // Handle events that fired before JS was ready
    VoipPushNotification.addEventListener('didLoadWithEvents', (events) => {
      if (!events || events.length === 0) return;

      for (const event of events) {
        if (event.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') {
          this.onVoipTokenReceived(event.data as string);
        }
        if (event.name === 'RNVoipPushRemoteNotificationReceivedEvent') {
          this.handleVoipPush(event.data as IncomingCallPayload);
        }
      }
    });

    VoipPushNotification.addEventListener('register', (token: string) => {
      this.onVoipTokenReceived(token);
    });

    VoipPushNotification.addEventListener('notification', (notification) => {
      this.handleVoipPush(notification as IncomingCallPayload);
    });

    // registerVoipToken() registers for VoIP pushes — on iOS, VoIP push
    // permissions are implicitly granted when registering for PushKit.
    VoipPushNotification.registerVoipToken();
  }

  /**
   * CRITICAL PATH: VoIP push received on iOS.
   * Must call CallKeepService.reportIncomingCall() synchronously.
   * Failure to do so will cause iOS to kill the app.
   */
  private handleVoipPush(payload: IncomingCallPayload) {
    const { callId, callerName, hasVideo, uuid } = payload;
    const callUUID = uuid || callId;

    // Report to CallKit IMMEDIATELY — this is non-negotiable on iOS 13+
    CallKeepService.reportIncomingCall(callUUID, callerName || 'Unknown', hasVideo ?? true);

    // Tell PushKit we've handled this notification
    const VoipPushNotification = require('react-native-voip-push-notification').default;
    VoipPushNotification.onVoipNotificationCompleted(callUUID);
  }

  private onVoipTokenReceived(token: string) {
    this.tokens.voipToken = token;
    this.notifyTokenListeners();
  }

  // ---------------------------------------------------------------------------
  // Android FCM
  // ---------------------------------------------------------------------------

  private async setupAndroidFCM() {
    // TODO: Wire up @react-native-firebase/messaging
    // The setup follows this pattern:
    //
    // import messaging from '@react-native-firebase/messaging';
    //
    // // Request permission
    // await messaging().requestPermission();
    //
    // // Get FCM token
    // const token = await messaging().getToken();
    // this.onFCMTokenReceived(token);
    //
    // // Listen for token refresh
    // messaging().onTokenRefresh((token) => this.onFCMTokenReceived(token));
    //
    // // Foreground messages
    // messaging().onMessage(async (remoteMessage) => {
    //   if (remoteMessage.data?.type === 'incoming_call') {
    //     this.handleFCMCall(remoteMessage.data);
    //   }
    // });
    //
    // // Background/killed handler (must be registered at app entry point)
    // messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    //   if (remoteMessage.data?.type === 'incoming_call') {
    //     this.handleFCMCall(remoteMessage.data);
    //   }
    // });
  }

  private handleFCMCall(data: Record<string, string>) {
    const callUUID = data.callId || data.uuid || '';
    const callerName = data.callerName || 'Unknown';
    const hasVideo = data.hasVideo !== 'false';

    CallKeepService.reportIncomingCall(callUUID, callerName, hasVideo);
  }

  private onFCMTokenReceived(token: string) {
    this.tokens.pushToken = token;
    this.notifyTokenListeners();
  }

  // ---------------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------------

  private notifyTokenListeners() {
    const snapshot = { ...this.tokens };
    this.tokenListeners.forEach((fn) => fn(snapshot));
  }
}

export const PushService = new PushServiceImpl();

/**
 * Must be called from the app entry point (index.js) BEFORE AppRegistry.registerComponent.
 * Android FCM background handler needs to be registered at the top level.
 *
 * Usage in index.js:
 *   import { registerBackgroundHandler } from './src/services/native/PushService';
 *   registerBackgroundHandler();
 */
export function registerBackgroundHandler() {
  if (Platform.OS !== 'android') return;

  // TODO: Wire up @react-native-firebase/messaging background handler
  // import messaging from '@react-native-firebase/messaging';
  // messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  //   if (remoteMessage.data?.type === 'incoming_call') {
  //     const data = remoteMessage.data;
  //     CallKeepService.reportIncomingCall(
  //       data.callId || '',
  //       data.callerName || 'Unknown',
  //       data.hasVideo !== 'false',
  //     );
  //   }
  // });
}
