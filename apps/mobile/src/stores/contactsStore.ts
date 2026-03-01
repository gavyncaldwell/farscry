import React, {createContext, useContext, useReducer, useCallback} from 'react';
import {ContactsService, type Contact} from '../services/user/ContactsService';

type ContactsState = {
  contacts: Contact[];
  favorites: Contact[];
  loading: boolean;
  error: string | null;
};

type ContactsAction =
  | {type: 'LOADING'}
  | {type: 'LOADED'; contacts: Contact[]}
  | {type: 'ERROR'; error: string}
  | {type: 'ADDED'; contact: Contact}
  | {type: 'REMOVED'; contactUserId: string}
  | {type: 'TOGGLED_FAVORITE'; contactUserId: string; isFavorite: boolean};

const initialState: ContactsState = {
  contacts: [],
  favorites: [],
  loading: false,
  error: null,
};

function deriveState(contacts: Contact[]): Pick<ContactsState, 'contacts' | 'favorites'> {
  return {
    contacts,
    favorites: contacts.filter(c => c.is_favorite),
  };
}

function contactsReducer(state: ContactsState, action: ContactsAction): ContactsState {
  switch (action.type) {
    case 'LOADING':
      return {...state, loading: true, error: null};
    case 'LOADED':
      return {...deriveState(action.contacts), loading: false, error: null};
    case 'ERROR':
      return {...state, loading: false, error: action.error};
    case 'ADDED': {
      const updated = [action.contact, ...state.contacts];
      return {...deriveState(updated), loading: false, error: null};
    }
    case 'REMOVED': {
      const updated = state.contacts.filter(
        c => c.contact_user_id !== action.contactUserId,
      );
      return {...deriveState(updated), loading: false, error: null};
    }
    case 'TOGGLED_FAVORITE': {
      const updated = state.contacts.map(c =>
        c.contact_user_id === action.contactUserId
          ? {...c, is_favorite: action.isFavorite}
          : c,
      );
      return {...deriveState(updated), loading: false, error: null};
    }
  }
}

type ContactsContextValue = ContactsState & {
  fetchContacts: () => Promise<void>;
  addContact: (userId: string) => Promise<void>;
  removeContact: (userId: string) => Promise<void>;
  toggleFavorite: (userId: string) => Promise<void>;
};

const ContactsContext = createContext<ContactsContextValue | null>(null);

export function ContactsProvider({children}: {children: React.ReactNode}) {
  const [state, dispatch] = useReducer(contactsReducer, initialState);

  const fetchContacts = useCallback(async () => {
    dispatch({type: 'LOADING'});
    try {
      const contacts = await ContactsService.getContacts();
      dispatch({type: 'LOADED', contacts});
    } catch (e: unknown) {
      dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Failed to load contacts'});
    }
  }, []);

  const addContact = useCallback(async (userId: string) => {
    try {
      const contact = await ContactsService.addContact(userId);
      dispatch({type: 'ADDED', contact});
    } catch (e: unknown) {
      dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Failed to add contact'});
    }
  }, []);

  const removeContact = useCallback(async (userId: string) => {
    try {
      await ContactsService.removeContact(userId);
      dispatch({type: 'REMOVED', contactUserId: userId});
    } catch (e: unknown) {
      dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Failed to remove contact'});
    }
  }, []);

  const toggleFavorite = useCallback(async (userId: string) => {
    try {
      const isFavorite = await ContactsService.toggleFavorite(userId);
      dispatch({type: 'TOGGLED_FAVORITE', contactUserId: userId, isFavorite});
    } catch (e: unknown) {
      dispatch({type: 'ERROR', error: e instanceof Error ? e.message : 'Failed to update favorite'});
    }
  }, []);

  const value: ContactsContextValue = {
    ...state,
    fetchContacts,
    addContact,
    removeContact,
    toggleFavorite,
  };

  return React.createElement(ContactsContext.Provider, {value}, children);
}

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) {
    throw new Error('useContacts must be used within ContactsProvider');
  }
  return ctx;
}
