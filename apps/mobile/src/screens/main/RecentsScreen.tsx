import React, {useMemo} from 'react';
import {View, Text, SectionList, TouchableOpacity, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Avatar} from '../../components/Avatar';
import {EmptyState} from '../../components/EmptyState';
import {useRecents, type CallRecord} from '../../stores/callHistoryStore';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';
import type {MainTabScreenProps} from '../../navigation/types';

type CallDirection = 'outgoing' | 'incoming' | 'missed';

function formatDuration(seconds: number): string {
  if (seconds === 0) {
    return 'No answer';
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

function getDateLabel(isoString: string): string {
  const date = new Date(isoString);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.getTime() === today.getTime()) {
    return 'Today';
  }
  if (d.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
}

function DirectionIcon({direction}: {direction: CallDirection}) {
  if (direction === 'missed') {
    return (
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <Path
          d="M2.25 6.75l9 9 3-3 7.5 7.5M15.75 21h5.25v-5.25"
          stroke={colors.missed}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  const isOutgoing = direction === 'outgoing';
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d={isOutgoing ? 'M4.5 19.5l15-15M8.25 4.5h11.25v11.25' : 'M19.5 4.5l-15 15M15.75 19.5H4.5V8.25'}
        stroke={colors.callGreen}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke={colors.textMuted}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function getDirection(record: CallRecord): CallDirection {
  if (record.status === 'missed') return 'missed';
  return record.direction;
}

type Section = {
  title: string;
  data: CallRecord[];
};

function groupByDay(calls: CallRecord[]): Section[] {
  const map = new Map<string, CallRecord[]>();
  for (const call of calls) {
    const label = getDateLabel(call.startedAt);
    const group = map.get(label) ?? [];
    group.push(call);
    map.set(label, group);
  }
  return Array.from(map.entries()).map(([title, data]) => ({title, data}));
}

export function RecentsScreen({navigation}: MainTabScreenProps<'Recents'>) {
  const insets = useSafeAreaInsets();
  const {recents, loading} = useRecents();
  const sections = useMemo(() => groupByDay(recents), [recents]);

  if (!loading && recents.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon />}
        title="No recent calls"
        message="Your call history will appear here."
      />
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={{paddingBottom: insets.bottom + spacing.base}}
        stickySectionHeadersEnabled
        renderSectionHeader={({section}) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({item}) => {
          const direction = getDirection(item);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate('ContactDetail', {
                  contactId: item.contactId,
                  name: item.contactName,
                })
              }
              activeOpacity={0.7}>
              <Avatar name={item.contactName} size={40} />
              <View style={styles.info}>
                <Text
                  style={[
                    styles.name,
                    direction === 'missed' && styles.missedName,
                  ]}
                  numberOfLines={1}>
                  {item.contactName}
                </Text>
                <View style={styles.meta}>
                  <DirectionIcon direction={direction} />
                  <Text style={styles.detail}>
                    {formatDuration(item.duration)}
                  </Text>
                </View>
              </View>
              <Text style={styles.time}>{formatTime(item.startedAt)}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    ...typography.footnote,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    gap: spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.body,
    color: colors.text,
  },
  missedName: {
    color: colors.missed,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detail: {
    ...typography.footnote,
    color: colors.textSecondary,
  },
  time: {
    ...typography.footnote,
    color: colors.textMuted,
  },
});
