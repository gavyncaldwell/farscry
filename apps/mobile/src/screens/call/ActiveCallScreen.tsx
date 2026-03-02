import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  Dimensions,
  PanResponder,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CallControls} from '../../components/CallControls';
import {useCallContext} from '../../stores/callStore';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';
import type {RootStackScreenProps} from '../../navigation/types';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');
const PIP_WIDTH = 120;
const PIP_HEIGHT = 160;

export function ActiveCallScreen({
  navigation,
  route,
}: RootStackScreenProps<'ActiveCall'>) {
  const insets = useSafeAreaInsets();
  const {callManager, callState} = useCallContext();
  const {contactName} = route.params;

  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);

  // Poll for streams becoming available
  useEffect(() => {
    const interval = setInterval(() => {
      const local = callManager?.mediaService.getStream();
      const remote = callManager?.webrtcService.getRemoteStream();
      if (local) {
        const url = local.toURL();
        setLocalStreamUrl(prev => prev !== url ? url : prev);
      }
      if (remote) {
        const url = remote.toURL();
        setRemoteStreamUrl(prev => prev !== url ? url : prev);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [callManager]);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const pipPosition = useRef(
    new Animated.ValueXY({
      x: SCREEN_WIDTH - PIP_WIDTH - spacing.base,
      y: insets.top + spacing.base,
    }),
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pipPosition.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, {dx: pipPosition.x, dy: pipPosition.y}],
        {useNativeDriver: false},
      ),
      onPanResponderRelease: () => {
        pipPosition.flattenOffset();
      },
    }),
  ).current;

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    }, 4000);
  }, [controlsOpacity]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [scheduleHide]);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (callState.phase === 'ended') {
      const timer = setTimeout(() => navigation.goBack(), 500);
      return () => clearTimeout(timer);
    }
  }, [callState.phase, navigation]);

  function showControls() {
    setControlsVisible(true);
    controlsOpacity.setValue(1);
    scheduleHide();
  }

  function handleTap() {
    if (controlsVisible) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    } else {
      showControls();
    }
  }

  function handleToggleMute() {
    const next = !muted;
    if (callManager) {
      callManager.mediaService.setMicEnabled(!next);
    }
    setMuted(next);
  }

  function handleToggleCamera() {
    const next = !cameraOff;
    if (callManager) {
      callManager.mediaService.setCameraEnabled(!next);
    }
    setCameraOff(next);
  }

  function handleToggleSpeaker() {
    setSpeakerOn(s => !s);
    // Speaker routing is handled by react-native-incall-manager
  }

  function handleHangup() {
    callManager?.hangup();
  }

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <TouchableWithoutFeedback onPress={handleTap}>
      <View style={styles.container}>
        {/* Remote video */}
        <View style={styles.remoteVideo}>
          {remoteStreamUrl ? (
            <RTCView
              streamURL={remoteStreamUrl}
              style={StyleSheet.absoluteFill}
              objectFit="cover"
              zOrder={0}
            />
          ) : (
            <Text style={styles.placeholderText}>{contactName}</Text>
          )}
        </View>

        {/* Local video PiP */}
        <Animated.View
          style={[
            styles.localVideo,
            {
              transform: pipPosition.getTranslateTransform(),
            },
          ]}
          {...panResponder.panHandlers}>
          <View style={styles.localVideoInner}>
            {cameraOff ? (
              <Text style={styles.cameraOffText}>Camera off</Text>
            ) : localStreamUrl ? (
              <RTCView
                streamURL={localStreamUrl}
                style={StyleSheet.absoluteFill}
                objectFit="cover"
                zOrder={1}
                mirror
              />
            ) : (
              <Text style={styles.pipLabel}>You</Text>
            )}
          </View>
        </Animated.View>

        {/* Controls overlay */}
        {controlsVisible && (
          <Animated.View
            style={[
              styles.overlay,
              {
                opacity: controlsOpacity,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              },
            ]}>
            <View style={styles.topBar}>
              <Text style={styles.overlayName}>{contactName}</Text>
              <Text style={styles.timer}>{timeStr}</Text>
            </View>
            <View style={styles.bottomBar}>
              <CallControls
                muted={muted}
                cameraOff={cameraOff}
                speakerOn={speakerOn}
                onToggleMute={handleToggleMute}
                onToggleCamera={handleToggleCamera}
                onToggleSpeaker={handleToggleSpeaker}
                onHangup={handleHangup}
              />
            </View>
          </Animated.View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...typography.title2,
    color: colors.textMuted,
  },
  localVideo: {
    position: 'absolute',
    width: PIP_WIDTH,
    height: PIP_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  localVideoInner: {
    flex: 1,
    backgroundColor: '#2d2d44',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cameraOffText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  pipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    alignItems: 'center',
    paddingTop: spacing.base,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingBottom: spacing.md,
  },
  overlayName: {
    ...typography.headline,
    color: colors.text,
  },
  timer: {
    ...typography.subhead,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bottomBar: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingBottom: spacing.md,
  },
});
