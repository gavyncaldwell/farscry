import {supabase} from '../supabase/client';

export type UserProfile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = {
  display_name?: string;
  avatar_url?: string | null;
};

export const UserService = {
  async getProfile(userId: string): Promise<UserProfile> {
    const {data, error} = await supabase
      .from<UserProfile>('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('User not found');
    return data;
  },

  async updateProfile(updates: ProfileUpdate): Promise<UserProfile> {
    const {data: sessionData} = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Not authenticated');

    if (updates.display_name !== undefined) {
      const name = updates.display_name.trim();
      if (!name) throw new Error('Display name cannot be empty');
      updates.display_name = name;
    }

    const {data, error} = await supabase
      .from<UserProfile>('users')
      .update({...updates, updated_at: new Date().toISOString()})
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error('Profile update failed');
    return data;
  },

  async searchUsers(query: string): Promise<UserProfile[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const {data, error} = await supabase
      .from<UserProfile>('users')
      .select('*')
      .ilike('display_name', `%${trimmed}%`)
      .limit(20);

    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getUserById(id: string): Promise<UserProfile | null> {
    const {data, error} = await supabase
      .from<UserProfile>('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  },
};
