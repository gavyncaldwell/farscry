import React, {useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, Animated, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Avatar} from '../../components/Avatar';
import {useCallContext} from '../../stores/callStore';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';
import type {RootStackScreenProps} from '../../navigation/types';

function PhoneIcon({color}: {color: string}) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DeclineIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 18L18 6M6 6l12 12"
        stroke={colors.white}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IncomingCallScreen({
  navigation,
  route,
}: RootStackScreenProps<'IncomingCall'>) {
  const insets = useSafeAreaInsets();
  const {callManager} = useCallContext();
  const {callerName} = route.params;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1.15, duration: 800, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: 800, useNativeDriver: true}),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  function handleAccept() {
    callManager?.acceptCall();
    navigation.replace('ActiveCall', {
      contactId: route.params.callerId,
      contactName: callerName,
    });
  }

  function handleDecline() {
    callManager?.declineCall();
    navigation.goBack();
  }

  return (
    <View
      style={[
        styles.container,
        {paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl},
      ]}>
      <View style={styles.callerInfo}>
        <Animated.View style={{transform: [{scale: pulse}]}}>
          <Avatar name={callerName} size={96} />
        </Animated.View>
        <Text style={styles.name}>{callerName}</Text>
        <Text style={styles.status}>Incoming video call...</Text>
      </View>

      <View style={styles.actions}>
        <View style={styles.actionWrapper}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={handleDecline}
            activeOpacity={0.8}>
            <DeclineIcon />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Decline</Text>
        </View>
        <View style={styles.actionWrapper}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={handleAccept}
            activeOpacity={0.8}>
            <PhoneIcon color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Accept</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callerInfo: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xxxl,
  },
  name: {
    ...typography.title,
    color: colors.text,
    marginTop: spacing.base,
  },
  status: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xxxl,
  },
  actionWrapper: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  declineButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.callRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.callGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...typography.footnote,
    color: colors.textSecondary,
  },
});
