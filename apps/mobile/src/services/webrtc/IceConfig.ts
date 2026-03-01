import type { IceServer } from '@farscry/shared';

const GOOGLE_STUN: IceServer = {
  urls: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
};

const CLOUDFLARE_TURN: IceServer = {
  urls: 'turn:turn.cloudflare.com:3478',
  username: '', // loaded from config at runtime
  credential: '',
};

export interface IceConfig {
  stunServers: IceServer[];
  turnServers: IceServer[];
}

const defaultConfig: IceConfig = {
  stunServers: [GOOGLE_STUN],
  turnServers: [],
};

export function configureIce(turnCredentials?: {
  username: string;
  credential: string;
  urls?: string;
}): IceConfig {
  if (!turnCredentials) return defaultConfig;

  return {
    stunServers: [GOOGLE_STUN],
    turnServers: [
      {
        urls: turnCredentials.urls ?? CLOUDFLARE_TURN.urls,
        username: turnCredentials.username,
        credential: turnCredentials.credential,
      },
    ],
  };
}

export function buildRTCConfiguration(config: IceConfig = defaultConfig) {
  return {
    iceServers: [...config.stunServers, ...config.turnServers],
    iceTransportPolicy: config.turnServers.length > 0 ? 'all' as const : 'all' as const,
    bundlePolicy: 'max-bundle' as const,
  };
}
