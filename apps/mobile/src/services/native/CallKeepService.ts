import { Platform } from 'react-native';
import RNCallKeep, { CONSTANTS } from 'react-native-callkeep';

export interface CallKeepEventHandlers {
  onAnswerCall: (callUUID: string) => void;
  onEndCall: (callUUID: string) => void;
  onMuteToggled: (callUUID: string, muted: boolean) => void;
  onHoldToggled: (callUUID: string, hold: boolean) => void;
  onAudioSessionActivated: () => void;
  onIncomingCallDisplayed: (callUUID: string) => void;
}

const SETUP_CONFIG = {
  ios: {
    appName: 'Farscry',
    supportsVideo: true,
    maximumCallGroups: '1',
    maximumCallsPerCallGroup: '1',
    includesCallsInRecents: true,
  },
  android: {
    alertTitle: 'Permissions Required',
    alertDescription: 'Farscry needs phone account access to manage calls',
    cancelButton: 'Cancel',
    okButton: 'OK',
    additionalPermissions: [],
    selfManaged: true,
    foregroundService: {
      channelId: 'farscry-call',
      channelName: 'Farscry Calls',
      notificationTitle: 'Farscry call in progress',
    },
  },
};

class CallKeepServiceImpl {
  private initialized = false;
  private handlers: CallKeepEventHandlers | null = null;

  async setup(): Promise<void> {
    if (this.initialized) return;

    try {
      await RNCallKeep.setup(SETUP_CONFIG);

      if (Platform.OS === 'android') {
        RNCallKeep.registerPhoneAccount(SETUP_CONFIG);
        RNCallKeep.registerAndroidEvents();
      }

      RNCallKeep.setAvailable(true);
      this.initialized = true;
    } catch (err) {
      console.error('[CallKeep] Setup failed:', err);
      throw err;
    }
  }

  registerEventHandlers(handlers: CallKeepEventHandlers) {
    this.handlers = handlers;

    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      this.handlers?.onAnswerCall(callUUID);
    });

    RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
      this.handlers?.onEndCall(callUUID);
    });

    RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ callUUID, muted }) => {
      this.handlers?.onMuteToggled(callUUID, muted);
    });

    RNCallKeep.addEventListener('didToggleHoldCallAction', ({ callUUID, hold }) => {
      this.handlers?.onHoldToggled(callUUID, hold);
    });

    RNCallKeep.addEventListener('didActivateAudioSession', () => {
      this.handlers?.onAudioSessionActivated();
    });

    RNCallKeep.addEventListener('didDisplayIncomingCall', ({ callUUID }) => {
      this.handlers?.onIncomingCallDisplayed(callUUID);
    });
  }

  removeEventHandlers() {
    this.handlers = null;
    RNCallKeep.removeEventListener('answerCall');
    RNCallKeep.removeEventListener('endCall');
    RNCallKeep.removeEventListener('didPerformSetMutedCallAction');
    RNCallKeep.removeEventListener('didToggleHoldCallAction');
    RNCallKeep.removeEventListener('didActivateAudioSession');
    RNCallKeep.removeEventListener('didDisplayIncomingCall');
  }

  /**
   * Report an incoming call to the native call UI (CallKit / ConnectionService).
   * On iOS, this MUST be called immediately when a VoIP push is received (iOS 13+).
   */
  reportIncomingCall(callUUID: string, callerName: string, hasVideo = true) {
    RNCallKeep.displayIncomingCall(
      callUUID,
      callerName, // handle
      callerName, // localizedCallerName
      'generic',
      hasVideo,
    );
  }

  reportOutgoingCall(callUUID: string, calleeName: string, hasVideo = true) {
    RNCallKeep.startCall(callUUID, calleeName, calleeName, 'generic', hasVideo);
  }

  reportOutgoingCallConnecting(callUUID: string) {
    RNCallKeep.reportConnectingOutgoingCallWithUUID(callUUID);
  }

  reportOutgoingCallConnected(callUUID: string) {
    RNCallKeep.reportConnectedOutgoingCallWithUUID(callUUID);
  }

  reportEndCall(callUUID: string, reason?: 'failed' | 'remote' | 'unanswered' | 'declined') {
    const reasonMap = {
      failed: CONSTANTS.END_CALL_REASONS.FAILED,
      remote: CONSTANTS.END_CALL_REASONS.REMOTE_ENDED,
      unanswered: CONSTANTS.END_CALL_REASONS.UNANSWERED,
      declined: CONSTANTS.END_CALL_REASONS.DECLINED_ELSEWHERE,
    };

    if (reason) {
      RNCallKeep.reportEndCallWithUUID(callUUID, reasonMap[reason]);
    } else {
      RNCallKeep.endCall(callUUID);
    }
  }

  setCallActive(callUUID: string) {
    RNCallKeep.setCurrentCallActive(callUUID);
  }

  setMuted(callUUID: string, muted: boolean) {
    RNCallKeep.setMutedCall(callUUID, muted);
  }

  setOnHold(callUUID: string, hold: boolean) {
    RNCallKeep.setOnHold(callUUID, hold);
  }

  updateCallerDisplay(callUUID: string, displayName: string) {
    RNCallKeep.updateDisplay(callUUID, displayName, displayName);
  }

  endAllCalls() {
    RNCallKeep.endAllCalls();
  }
}

export const CallKeepService = new CallKeepServiceImpl();
