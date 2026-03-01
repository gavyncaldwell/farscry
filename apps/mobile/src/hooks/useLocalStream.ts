import { useState, useEffect, useCallback } from 'react';
import type { MediaStream } from 'react-native-webrtc';
import { MediaService } from '../services/webrtc/MediaService';

export function useLocalStream(mediaService: MediaService) {
  const [stream, setStream] = useState<MediaStream | null>(mediaService.getStream());
  const [error, setError] = useState<Error | null>(null);

  const acquire = useCallback(
    async (options?: { video: boolean; audio: boolean }) => {
      try {
        setError(null);
        const s = await mediaService.acquireStream(options);
        setStream(s);
        return s;
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to acquire media');
        setError(e);
        throw e;
      }
    },
    [mediaService],
  );

  const release = useCallback(() => {
    mediaService.release();
    setStream(null);
  }, [mediaService]);

  const switchCamera = useCallback(
    () => mediaService.switchCamera(),
    [mediaService],
  );

  useEffect(() => {
    return () => {
      // Don't auto-release — CallManager handles lifecycle
    };
  }, []);

  return {
    stream,
    error,
    streamUrl: stream?.toURL() ?? null,
    acquire,
    release,
    switchCamera,
  };
}
