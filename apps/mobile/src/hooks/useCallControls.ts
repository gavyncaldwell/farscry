import { useState, useCallback } from 'react';
import { MediaService } from '../services/webrtc/MediaService';

export function useCallControls(mediaService: MediaService) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    mediaService.setMicEnabled(!next);
    setIsMuted(next);
  }, [isMuted, mediaService]);

  const toggleCamera = useCallback(() => {
    const next = !isCameraOff;
    mediaService.setCameraEnabled(!next);
    setIsCameraOff(next);
  }, [isCameraOff, mediaService]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
    // Speaker routing is handled by react-native-incall-manager
    // or InCallManager.setSpeakerphoneOn() — left to native integration layer
  }, []);

  const switchCamera = useCallback(
    () => mediaService.switchCamera(),
    [mediaService],
  );

  return {
    isMuted,
    isCameraOff,
    isSpeakerOn,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    switchCamera,
  };
}
