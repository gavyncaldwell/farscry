import React, {createContext, useContext, useReducer, useCallback, useEffect} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@farscry/call_history';
const MAX_RECENT_CALLS = 50;

export type CallRecord = {
  id: string;
  contactId: string;
  contactName: string;
  direction: 'incoming' | 'outgoing';
  status: 'answered' | 'missed' | 'declined';
  startedAt: string;
  duration: number; // seconds, 0 if not answered
};

type CallHistoryState = {
  recents: CallRecord[];
  loading: boolean;
};

type CallHistoryAction =
  | {type: 'LOADED'; recents: CallRecord[]}
  | {type: 'ADDED'; call: CallRecord}
  | {type: 'CLEARED'};

const initialState: CallHistoryState = {
  recents: [],
  loading: true,
};

function callHistoryReducer(
  state: CallHistoryState,
  action: CallHistoryAction,
): CallHistoryState {
  switch (action.type) {
    case 'LOADED':
      return {recents: action.recents, loading: false};
    case 'ADDED':
      return {
        recents: [action.call, ...state.recents].slice(0, MAX_RECENT_CALLS),
        loading: false,
      };
    case 'CLEARED':
      return {recents: [], loading: false};
  }
}

async function persistHistory(recents: CallRecord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
}

type CallHistoryContextValue = CallHistoryState & {
  addCall: (call: CallRecord) => void;
  clearHistory: () => void;
};

const CallHistoryContext = createContext<CallHistoryContextValue | null>(null);

export function CallHistoryProvider({children}: {children: React.ReactNode}) {
  const [state, dispatch] = useReducer(callHistoryReducer, initialState);

  // Load from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          dispatch({type: 'LOADED', recents: JSON.parse(raw)});
        } catch {
          dispatch({type: 'LOADED', recents: []});
        }
      } else {
        dispatch({type: 'LOADED', recents: []});
      }
    });
  }, []);

  const addCall = useCallback(
    (call: CallRecord) => {
      dispatch({type: 'ADDED', call});
      const updated = [call, ...state.recents].slice(0, MAX_RECENT_CALLS);
      persistHistory(updated);
    },
    [state.recents],
  );

  const clearHistory = useCallback(() => {
    dispatch({type: 'CLEARED'});
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: CallHistoryContextValue = {
    ...state,
    addCall,
    clearHistory,
  };

  return React.createElement(CallHistoryContext.Provider, {value}, children);
}

export function useRecents(): CallHistoryContextValue {
  const ctx = useContext(CallHistoryContext);
  if (!ctx) {
    throw new Error('useRecents must be used within CallHistoryProvider');
  }
  return ctx;
}
