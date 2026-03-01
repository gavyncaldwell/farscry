import {ContactsService, type Contact} from './ContactsService';

export const FavoritesService = {
  async getFavorites(): Promise<Contact[]> {
    const contacts = await ContactsService.getContacts();
    return contacts.filter(c => c.is_favorite);
  },

  toggleFavorite: ContactsService.toggleFavorite,
};
