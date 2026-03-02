import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, SectionList, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ContactRow} from '../../components/ContactRow';
import {SearchBar} from '../../components/SearchBar';
import {EmptyState} from '../../components/EmptyState';
import {useContacts} from '../../stores/contactsStore';
import {useCallContext} from '../../stores/callStore';
import type {Contact} from '../../services/user/ContactsService';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';
import type {MainTabScreenProps} from '../../navigation/types';

function PlusIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4.5v15m7.5-7.5h-15"
        stroke={colors.accent}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PeopleIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        stroke={colors.textMuted}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type Section = {
  title: string;
  data: Contact[];
};

function buildSections(items: Contact[]): Section[] {
  const map = new Map<string, Contact[]>();
  for (const c of items) {
    const name = c.profile?.display_name ?? '?';
    const letter = name.charAt(0).toUpperCase();
    const group = map.get(letter) ?? [];
    group.push(c);
    map.set(letter, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({title, data}));
}

export function ContactsScreen({navigation}: MainTabScreenProps<'Contacts'>) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const {contacts, fetchContacts} = useContacts();
  const {startCall} = useCallContext();

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c => {
      const name = c.profile?.display_name ?? '';
      return name.toLowerCase().includes(q);
    });
  }, [search, contacts]);

  const sections = useMemo(() => buildSections(filtered), [filtered]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchBarWrapper}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts"
          />
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddContact')}
          activeOpacity={0.7}>
          <PlusIcon />
        </TouchableOpacity>
      </View>

      {sections.length === 0 ? (
        <EmptyState
          icon={<PeopleIcon />}
          title={search ? 'No results' : 'No contacts yet'}
          message={search ? undefined : 'Tap + to add someone.'}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.contact_user_id}
          contentContainerStyle={{paddingBottom: insets.bottom + spacing.base}}
          stickySectionHeadersEnabled
          renderSectionHeader={({section}) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({item}) => (
            <ContactRow
              name={item.profile?.display_name ?? '?'}
              onPress={() =>
                navigation.navigate('ContactDetail', {
                  contactId: item.contact_user_id,
                  name: item.profile?.display_name ?? '?',
                })
              }
              onCall={() =>
                startCall(item.contact_user_id, item.profile?.display_name ?? '?')
                  .catch((err: Error) => Alert.alert('Call failed', err.message))
              }
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchBarWrapper: {
    flex: 1,
  },
  addButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
  },
  sectionTitle: {
    ...typography.footnote,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
