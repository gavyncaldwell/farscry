import { Platform, Linking, Alert } from 'react-native';
import {
  check,
  request,
  checkNotifications,
  requestNotifications,
  PERMISSIONS,
  RESULTS,
  type Permission,
  type PermissionStatus,
  openSettings,
} from 'react-native-permissions';

export type PermissionType = 'camera' | 'microphone' | 'notifications';

export type PermissionState = 'granted' | 'denied' | 'blocked' | 'unavailable' | 'undetermined';

/**
 * Notifications are not a standard permission in react-native-permissions.
 * They use checkNotifications/requestNotifications instead.
 * Only camera and microphone are in this map.
 */
const PERMISSION_MAP: Record<'camera' | 'microphone', { ios: Permission; android: Permission }> = {
  camera: {
    ios: PERMISSIONS.IOS.CAMERA,
    android: PERMISSIONS.ANDROID.CAMERA,
  },
  microphone: {
    ios: PERMISSIONS.IOS.MICROPHONE,
    android: PERMISSIONS.ANDROID.RECORD_AUDIO,
  },
};

function mapStatus(status: PermissionStatus): PermissionState {
  switch (status) {
    case RESULTS.GRANTED:
    case RESULTS.LIMITED:
      return 'granted';
    case RESULTS.DENIED:
      return 'undetermined';
    case RESULTS.BLOCKED:
      return 'blocked';
    case RESULTS.UNAVAILABLE:
      return 'unavailable';
    default:
      return 'undetermined';
  }
}

function getPlatformPermission(type: 'camera' | 'microphone'): Permission {
  const entry = PERMISSION_MAP[type];
  return Platform.OS === 'ios' ? entry.ios : entry.android;
}

class PermissionsServiceImpl {
  async checkPermission(type: PermissionType): Promise<PermissionState> {
    if (type === 'notifications') {
      const { status } = await checkNotifications();
      return mapStatus(status);
    }
    const permission = getPlatformPermission(type);
    const status = await check(permission);
    return mapStatus(status);
  }

  async requestPermission(type: PermissionType): Promise<PermissionState> {
    if (type === 'notifications') {
      const { status } = await requestNotifications(['alert', 'sound', 'badge']);
      return mapStatus(status);
    }
    const permission = getPlatformPermission(type);
    const status = await request(permission);
    return mapStatus(status);
  }

  /**
   * Request a permission, and if blocked, prompt the user to open Settings.
   * Returns the final permission state.
   */
  async ensurePermission(type: PermissionType, rationale?: string): Promise<PermissionState> {
    let state = await this.checkPermission(type);

    if (state === 'granted') return state;

    if (state === 'undetermined') {
      state = await this.requestPermission(type);
    }

    if (state === 'blocked') {
      await this.promptOpenSettings(type, rationale);
      // Re-check in case user toggled it in settings and came back
      state = await this.checkPermission(type);
    }

    return state;
  }

  async checkCallPermissions(): Promise<{ camera: PermissionState; microphone: PermissionState }> {
    const [camera, microphone] = await Promise.all([
      this.checkPermission('camera'),
      this.checkPermission('microphone'),
    ]);
    return { camera, microphone };
  }

  async requestCallPermissions(): Promise<{ camera: PermissionState; microphone: PermissionState }> {
    // Request sequentially — stacking permission dialogs confuses users
    const microphone = await this.ensurePermission('microphone', 'Farscry needs microphone access for calls.');
    const camera = await this.ensurePermission('camera', 'Farscry needs camera access for video calls.');
    return { camera, microphone };
  }

  private promptOpenSettings(type: PermissionType, rationale?: string): Promise<void> {
    const labels: Record<PermissionType, string> = {
      camera: 'Camera',
      microphone: 'Microphone',
      notifications: 'Notifications',
    };

    const message = rationale || `Farscry needs ${labels[type].toLowerCase()} access. Please enable it in Settings.`;

    return new Promise<void>((resolve) => {
      Alert.alert(`${labels[type]} Access Required`, message, [
        { text: 'Not Now', style: 'cancel', onPress: () => resolve() },
        {
          text: 'Open Settings',
          onPress: () => {
            openSettings().catch(() => {
              // Fallback for older react-native-permissions versions
              Linking.openSettings();
            });
            resolve();
          },
        },
      ]);
    });
  }
}

export const PermissionsService = new PermissionsServiceImpl();
