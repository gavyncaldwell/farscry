declare module 'react-native-webrtc' {
  export class RTCPeerConnection {
    constructor(configuration?: RTCConfiguration);
    createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit>;
    createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
    addStream(stream: MediaStream): void;
    removeStream(stream: MediaStream): void;
    close(): void;

    localDescription: RTCSessionDescription | null;
    remoteDescription: RTCSessionDescription | null;
    connectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
    iceGatheringState: RTCIceGatheringState;
    signalingState: RTCSignalingState;

    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
    oniceconnectionstatechange: (() => void) | null;
    onconnectionstatechange: (() => void) | null;
    ontrack: ((event: RTCTrackEvent) => void) | null;
    onnegotiationneeded: (() => void) | null;
  }

  export class MediaStream {
    constructor(tracks?: MediaStreamTrack[]);
    id: string;
    active: boolean;
    getTracks(): MediaStreamTrack[];
    getAudioTracks(): MediaStreamTrack[];
    getVideoTracks(): MediaStreamTrack[];
    addTrack(track: MediaStreamTrack): void;
    removeTrack(track: MediaStreamTrack): void;
    release(): void;
    toURL(): string;
  }

  export class MediaStreamTrack {
    id: string;
    kind: 'audio' | 'video';
    enabled: boolean;
    muted: boolean;
    readyState: 'live' | 'ended';
    stop(): void;
    _switchCamera(): void;
  }

  export const mediaDevices: {
    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
    enumerateDevices(): Promise<MediaDeviceInfo[]>;
  };

  export class RTCSessionDescription {
    constructor(init: RTCSessionDescriptionInit);
    type: RTCSdpType;
    sdp: string;
  }

  export class RTCIceCandidate {
    constructor(init: RTCIceCandidateInit);
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
  }

  export const RTCView: React.ComponentType<{
    streamURL: string;
    style?: any;
    objectFit?: 'contain' | 'cover';
    mirror?: boolean;
    zOrder?: number;
  }>;

  interface RTCConfiguration {
    iceServers?: RTCIceServer[];
    iceTransportPolicy?: 'all' | 'relay';
    bundlePolicy?: 'balanced' | 'max-compat' | 'max-bundle';
  }

  interface RTCIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
  }

  interface RTCOfferOptions {
    offerToReceiveAudio?: boolean;
    offerToReceiveVideo?: boolean;
  }

  interface RTCAnswerOptions {}

  interface RTCSessionDescriptionInit {
    type: RTCSdpType;
    sdp: string;
  }

  interface RTCIceCandidateInit {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  }

  type RTCSdpType = 'offer' | 'answer' | 'pranswer' | 'rollback';
  type RTCPeerConnectionState =
    | 'new'
    | 'connecting'
    | 'connected'
    | 'disconnected'
    | 'failed'
    | 'closed';
  type RTCIceConnectionState =
    | 'new'
    | 'checking'
    | 'connected'
    | 'completed'
    | 'disconnected'
    | 'failed'
    | 'closed';
  type RTCIceGatheringState = 'new' | 'gathering' | 'complete';
  type RTCSignalingState =
    | 'stable'
    | 'have-local-offer'
    | 'have-remote-offer'
    | 'have-local-pranswer'
    | 'have-remote-pranswer'
    | 'closed';

  interface RTCPeerConnectionIceEvent {
    candidate: RTCIceCandidate | null;
  }

  interface RTCTrackEvent {
    track: MediaStreamTrack;
    streams: MediaStream[];
  }

  interface MediaStreamConstraints {
    audio?: boolean | MediaTrackConstraints;
    video?: boolean | MediaTrackConstraints;
  }

  interface MediaTrackConstraints {
    width?: number | { ideal?: number; min?: number; max?: number };
    height?: number | { ideal?: number; min?: number; max?: number };
    frameRate?: number | { ideal?: number; min?: number; max?: number };
    facingMode?: string | { ideal?: string };
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  }

  interface MediaDeviceInfo {
    deviceId: string;
    groupId: string;
    kind: 'audioinput' | 'audiooutput' | 'videoinput';
    label: string;
  }
}
