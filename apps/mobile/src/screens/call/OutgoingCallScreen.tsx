import React, {useEffect, useRef} from 'react';
import {View, Text, TouchableOpacity, Animated, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Avatar} from '../../components/Avatar';
import {useCallContext} from '../../stores/callStore';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';
import type {RootStackScreenProps} from '../../navigation/types';

export function OutgoingCallScreen({
  navigation,
  route,
}: RootStackScreenProps<'OutgoingCall'>) {
  const insets = useSafeAreaInsets();
  const {callManager, callState} = useCallContext();
  const {contactId, contactName} = route.params;

  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    function animateDot(dot: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {toValue: 1, duration: 400, useNativeDriver: true}),
          Animated.timing(dot, {toValue: 0.3, duration: 400, useNativeDriver: true}),
        ]),
      );
    }

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 200);
    const a3 = animateDot(dot3, 400);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  useEffect(() => {
    if (callState.phase === 'connecting' || callState.phase === 'active') {
      navigation.replace('ActiveCall', {contactId, contactName});
    } else if (callState.phase === 'ended') {
      navigation.goBack();
    }
  }, [callState.phase, navigation, contactId, contactName]);

  function handleCancel() {
    callManager?.cancelCall();
    navigation.goBack();
  }

  return (
    <View
      style={[
        styles.container,
        {paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl},
      ]}>
      <View style={styles.callerInfo}>
        <Avatar name={contactName} size={96} />
        <Text style={styles.name}>{contactName}</Text>
        <View style={styles.ringingRow}>
          <Text style={styles.ringing}>Calling</Text>
          <Animated.View style={[styles.dot, {opacity: dot1}]} />
          <Animated.View style={[styles.dot, {opacity: dot2}]} />
          <Animated.View style={[styles.dot, {opacity: dot3}]} />
        </View>
      </View>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={handleCancel}
        activeOpacity={0.8}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
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
  ringingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ringing: {
    ...typography.body,
    color: colors.textSecondary,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textSecondary,
  },
  cancelButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.callRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.footnote,
    color: colors.white,
    fontWeight: '600',
  },
});
