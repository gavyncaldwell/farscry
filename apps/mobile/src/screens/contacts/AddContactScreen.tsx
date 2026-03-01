import React, {useState} from 'react';
import {View, Text, TouchableOpacity, FlatList, StyleSheet, Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SearchBar} from '../../components/SearchBar';
import {Avatar} from '../../components/Avatar';
import {EmptyState} from '../../components/EmptyState';
import {UserService, type UserProfile} from '../../services/user/UserService';
import {useContacts} from '../../stores/contactsStore';
import {colors} from '../../theme/colors';
import {typography} from '../../theme/typography';
import {spacing} from '../../theme/spacing';

export function AddContactScreen() {
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const {addContact} = useContacts();

  async function handleSearch(text: string) {
    setQuery(text);
    if (text.trim().length >= 2) {
      try {
        const users = await UserService.searchUsers(text);
        setResults(users);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      }
    } else {
      setResults([]);
      setSearched(false);
    }
  }

  async function handleAdd(user: UserProfile) {
    try {
      await addContact(user.id);
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add contact');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <SearchBar
          value={query}
          onChangeText={handleSearch}
          placeholder="Search by name"
        />
      </View>

      {!searched ? (
        <EmptyState
          title="Find people"
          message="Search by name to add them to your contacts."
        />
      ) : results.length === 0 ? (
        <EmptyState
          title="No one found"
          message={`No users matching "${query}"`}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={styles.row}>
              <Avatar name={item.display_name} size={44} />
              <View style={styles.info}>
                <Text style={styles.name}>{item.display_name}</Text>
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => handleAdd(item)}
                activeOpacity={0.7}>
                <Text style={styles.addText}>Add</Text>
              </TouchableOpacity>
            </View>
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
  searchContainer: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
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
  addButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  addText: {
    ...typography.subhead,
    color: colors.white,
    fontWeight: '600',
  },
});
