import React from 'react';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Avatar} from '../../components/Avatar';
import {CallButton} from '../../components/CallButton';
import {useCallContext} from '../../stores/callStore';
import {useContacts} from '../../stores/contactsStore';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';
import type {RootStackScreenProps} from '../../navigation/types';

function StarIcon({filled}: {filled: boolean}) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill={filled ? colors.accent : 'none'}>
      <Path
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        stroke={colors.accent}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ContactDetailScreen({
  navigation,
  route,
}: RootStackScreenProps<'ContactDetail'>) {
  const insets = useSafeAreaInsets();
  const {contactId, name} = route.params;
  const {startCall} = useCallContext();
  const {contacts, removeContact, toggleFavorite} = useContacts();

  const contact = contacts.find(c => c.contact_user_id === contactId);
  const isFavorite = contact?.is_favorite ?? false;

  function handleCall() {
    startCall(contactId, name);
  }

  function handleRemove() {
    Alert.alert(
      'Remove contact',
      `Remove ${name} from your contacts?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeContact(contactId);
            navigation.goBack();
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {paddingBottom: insets.bottom + spacing.xxl},
      ]}>
      <View style={styles.profile}>
        <Avatar name={name} size={88} />
        <Text style={styles.name}>{name}</Text>
      </View>

      <View style={styles.actions}>
        <CallButton size={60} onPress={handleCall} />
        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={() => toggleFavorite(contactId)}
          activeOpacity={0.7}>
          <StarIcon filled={isFavorite} />
          <Text style={styles.favoriteLabel}>
            {isFavorite ? 'Favorited' : 'Favorite'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.removeButton}
        onPress={handleRemove}
        activeOpacity={0.7}>
        <Text style={styles.removeText}>Remove contact</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  profile: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.title2,
    color: colors.text,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
    marginTop: spacing.xxl,
  },
  favoriteButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  favoriteLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  removeButton: {
    marginTop: spacing.xxxl * 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  removeText: {
    ...typography.body,
    color: colors.callRed,
  },
});
