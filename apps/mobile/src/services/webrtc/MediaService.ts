import { mediaDevices, MediaStream } from 'react-native-webrtc';
import { VIDEO_CONSTRAINTS, AUDIO_CONSTRAINTS } from '@farscry/shared';

export class MediaService {
  private localStream: MediaStream | null = null;

  async acquireStream(options: { video: boolean; audio: boolean } = { video: true, audio: true }): Promise<MediaStream> {
    if (this.localStream) return this.localStream;

    this.localStream = await mediaDevices.getUserMedia({
      video: options.video ? { ...VIDEO_CONSTRAINTS, facingMode: 'user' } : false,
      audio: options.audio ? AUDIO_CONSTRAINTS : false,
    });

    return this.localStream;
  }

  getStream(): MediaStream | null {
    return this.localStream;
  }

  setMicEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  setCameraEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  async switchCamera() {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack._switchCamera();
    }
  }

  isMicEnabled(): boolean {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    return audioTrack?.enabled ?? false;
  }

  isCameraEnabled(): boolean {
    const videoTrack = this.localStream?.getVideoTracks()[0];
    return videoTrack?.enabled ?? false;
  }

  release() {
    if (!this.localStream) return;
    this.localStream.getTracks().forEach((track) => track.stop());
    this.localStream.release();
    this.localStream = null;
  }
}
