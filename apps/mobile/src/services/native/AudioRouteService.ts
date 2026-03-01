import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';

export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth' | 'wired';

export type AudioRouteChangeListener = (route: AudioRoute) => void;

class AudioRouteServiceImpl {
  private currentRoute: AudioRoute = 'earpiece';
  private listeners = new Set<AudioRouteChangeListener>();
  private eventSubscription: { remove: () => void } | null = null;

  start(isVideo = false) {
    // Start InCallManager — routes audio to earpiece for voice, speaker for video
    InCallManager.start({ media: isVideo ? 'video' : 'audio' });
    InCallManager.setKeepScreenOn(true);

    this.currentRoute = isVideo ? 'speaker' : 'earpiece';
    this.listenForRouteChanges();
  }

  stop() {
    InCallManager.stop();
    InCallManager.setKeepScreenOn(false);
    this.eventSubscription?.remove();
    this.eventSubscription = null;
    this.currentRoute = 'earpiece';
  }

  getActiveRoute(): AudioRoute {
    return this.currentRoute;
  }

  setSpeakerEnabled(enabled: boolean) {
    InCallManager.setSpeakerphoneOn(enabled);
    this.currentRoute = enabled ? 'speaker' : 'earpiece';
    this.notifyListeners();
  }

  toggleSpeaker() {
    this.setSpeakerEnabled(this.currentRoute !== 'speaker');
  }

  isSpeakerOn(): boolean {
    return this.currentRoute === 'speaker';
  }

  onRouteChange(listener: AudioRouteChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private listenForRouteChanges() {
    if (this.eventSubscription) return;

    // react-native-incall-manager emits audio route change events
    if (NativeModules.InCallManager) {
      const emitter = new NativeEventEmitter(NativeModules.InCallManager);
      this.eventSubscription = emitter.addListener('onAudioDeviceChanged', (event) => {
        const route = this.mapNativeRoute(event?.selectedAudioDevice);
        if (route !== this.currentRoute) {
          this.currentRoute = route;
          this.notifyListeners();
        }
      });
    }
  }

  private mapNativeRoute(device: string | undefined): AudioRoute {
    if (!device) return this.currentRoute;

    const normalized = device.toLowerCase();
    if (normalized.includes('speaker')) return 'speaker';
    if (normalized.includes('bluetooth') || normalized.includes('a2dp')) return 'bluetooth';
    if (normalized.includes('wired') || normalized.includes('headset')) return 'wired';
    return 'earpiece';
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn(this.currentRoute));
  }
}

export const AudioRouteService = new AudioRouteServiceImpl();
