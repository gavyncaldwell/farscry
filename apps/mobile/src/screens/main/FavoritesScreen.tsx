import React, {useEffect} from 'react';
import {View, FlatList, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ContactCard} from '../../components/ContactCard';
import {EmptyState} from '../../components/EmptyState';
import {useContacts} from '../../stores/contactsStore';
import {colors} from '../../theme/colors';
import {spacing} from '../../theme/spacing';
import type {MainTabScreenProps} from '../../navigation/types';

function StarIcon() {
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        stroke={colors.textMuted}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FavoritesScreen({navigation}: MainTabScreenProps<'Favorites'>) {
  const insets = useSafeAreaInsets();
  const {favorites, fetchContacts} = useContacts();

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={<StarIcon />}
        title="No favorites yet"
        message="Star contacts to add them here for quick calling."
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={favorites}
        numColumns={2}
        contentContainerStyle={[
          styles.grid,
          {paddingBottom: insets.bottom + spacing.base},
        ]}
        columnWrapperStyle={styles.row}
        keyExtractor={item => item.contact_user_id}
        renderItem={({item}) => (
          <ContactCard
            name={item.profile?.display_name ?? '?'}
            onPress={() =>
              navigation.navigate('OutgoingCall', {
                contactId: item.contact_user_id,
                contactName: item.profile?.display_name ?? '?',
              })
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  grid: {
    padding: spacing.base,
  },
  row: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
});
