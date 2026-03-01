import {supabase} from '../supabase/client';
import type {UserProfile} from './UserService';

export type Contact = {
  user_id: string;
  contact_user_id: string;
  is_favorite: boolean;
  added_at: string;
  profile?: UserProfile;
};

export const ContactsService = {
  async getContacts(): Promise<Contact[]> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    const {data, error} = await supabase
      .from<Contact>('contacts')
      .select('*, profile:users!contact_user_id(*)')
      .eq('user_id', userId)
      .order('added_at', {ascending: false});

    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async addContact(contactUserId: string): Promise<Contact> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    if (contactUserId === userId) {
      throw new Error('Cannot add yourself as a contact');
    }

    const {data, error} = await supabase
      .from<Contact>('contacts')
      .insert({user_id: userId, contact_user_id: contactUserId})
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Contact already added');
      }
      throw new Error(error.message);
    }
    if (!data) throw new Error('Failed to add contact');
    return data;
  },

  async removeContact(contactUserId: string): Promise<void> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    const {error} = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', userId)
      .eq('contact_user_id', contactUserId);

    if (error) throw new Error(error.message);
  },

  async toggleFavorite(contactUserId: string): Promise<boolean> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    // Fetch current state
    const {data: existing, error: fetchError} = await supabase
      .from<Contact>('contacts')
      .select('is_favorite')
      .eq('user_id', userId)
      .eq('contact_user_id', contactUserId)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    if (!existing) throw new Error('Contact not found');

    const newValue = !existing.is_favorite;

    const {error} = await supabase
      .from('contacts')
      .update({is_favorite: newValue})
      .eq('user_id', userId)
      .eq('contact_user_id', contactUserId);

    if (error) throw new Error(error.message);
    return newValue;
  },
};
