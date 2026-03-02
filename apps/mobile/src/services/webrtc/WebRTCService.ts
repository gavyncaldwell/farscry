import {
  RTCPeerConnection,
  RTCSessionDescription,
  MediaStream,
} from 'react-native-webrtc';
import { buildRTCConfiguration, type IceConfig } from './IceConfig';

export type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface WebRTCCallbacks {
  onIceCandidate: (candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: PeerConnectionState) => void;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private remoteStream: MediaStream | null = null;
  private callbacks: WebRTCCallbacks | null = null;

  createConnection(iceConfig: IceConfig, callbacks: WebRTCCallbacks) {
    this.cleanup();
    this.callbacks = callbacks;

    const config = buildRTCConfiguration(iceConfig);
    this.pc = new RTCPeerConnection(config);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        callbacks.onIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.remoteStream = event.streams[0];
        callbacks.onRemoteStream(this.remoteStream);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        callbacks.onConnectionStateChange(this.pc.connectionState);
      }
    };

    return this.pc;
  }

  attachLocalStream(stream: MediaStream) {
    if (!this.pc) throw new Error('No peer connection');
    stream.getTracks().forEach(track => {
      this.pc!.addTrack(track, stream);
    });
  }

  async createOffer(): Promise<string> {
    if (!this.pc) throw new Error('No peer connection');

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);
    return offer.sdp;
  }

  async createAnswer(): Promise<string> {
    if (!this.pc) throw new Error('No peer connection');

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer.sdp;
  }

  async setRemoteDescription(type: 'offer' | 'answer', sdp: string) {
    if (!this.pc) throw new Error('No peer connection');
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type, sdp }));
  }

  async addIceCandidate(candidate: string, sdpMid: string | null, sdpMLineIndex: number | null) {
    if (!this.pc) throw new Error('No peer connection');
    await this.pc.addIceCandidate({ candidate, sdpMid, sdpMLineIndex });
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getConnectionState(): PeerConnectionState {
    return this.pc?.connectionState ?? 'closed';
  }

  cleanup() {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.remoteStream = null;
    this.callbacks = null;
  }
}
