// Mock S3 client type for demo purposes
import { create } from 'zustand';
import { KeyPair } from './crypto';
import { Message } from './s3';

export interface Contact {
  address: string;
  displayName: string;
  pk: string;
  avatarUrl?: string;
  about?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
}

export interface ChatState {
  // Authentication
  isAuthenticated: boolean;
  currentUser: KeyPair | null;
  s3Client: any | null;
  hasHydrated: boolean;
  
  // Contacts and messages
  contacts: Contact[];
  messages: { [contactAddress: string]: Message[] };
  lastReadOffsets: { [contactAddress: string]: number };
  
  // UI state
  selectedContact: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (user: KeyPair, s3Client: any) => void;
  logout: () => void;
  setSelectedContact: (address: string | null) => void;
  addContact: (contact: Contact) => void;
  updateContact: (address: string, updates: Partial<Contact>) => void;
  addMessage: (contactAddress: string, message: Message) => void;
  addMessages: (contactAddress: string, messages: Message[]) => void;
  updateLastReadOffset: (contactAddress: string, offset: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  // Initial state
  isAuthenticated: false,
  currentUser: null,
  s3Client: null,
  hasHydrated: true, // Always true since we're not using persistence for now
  contacts: [],
  messages: {},
  lastReadOffsets: {},
  selectedContact: null,
  isLoading: false,
  error: null,

  // Actions
  login: (user: KeyPair, s3Client: any) => {
    set({
      isAuthenticated: true,
      currentUser: user,
      s3Client,
      error: null
    });
  },

  logout: () => {
    set({
      isAuthenticated: false,
      currentUser: null,
      s3Client: null,
      contacts: [],
      messages: {},
      lastReadOffsets: {},
      selectedContact: null,
      error: null
    });
  },

  setSelectedContact: (address: string | null) => {
    set({ selectedContact: address });
  },

  addContact: (contact: Contact) => {
    set(state => ({
      contacts: [...state.contacts.filter(c => c.address !== contact.address), contact]
    }));
  },

  updateContact: (address: string, updates: Partial<Contact>) => {
    set(state => ({
      contacts: state.contacts.map(contact =>
        contact.address === address ? { ...contact, ...updates } : contact
      )
    }));
  },

  addMessage: (contactAddress: string, message: Message) => {
    set(state => {
      const existing = state.messages[contactAddress] || [];
      const exists = existing.some(m => m.msg_id === message.msg_id);
      if (exists) return { messages: state.messages } as any;
      return {
        messages: {
          ...state.messages,
          [contactAddress]: [...existing, message]
        }
      } as any;
    });
  },

  addMessages: (contactAddress: string, messages: Message[]) => {
    set(state => {
      const existing = state.messages[contactAddress] || [];
      const existingIds = new Set(existing.map(m => m.msg_id));
      const deduped = messages.filter(m => !existingIds.has(m.msg_id));
      if (deduped.length === 0) return { messages: state.messages } as any;
      return {
        messages: {
          ...state.messages,
          [contactAddress]: [...existing, ...deduped]
        }
      } as any;
    });
  },

  updateLastReadOffset: (contactAddress: string, offset: number) => {
    set(state => ({
      lastReadOffsets: {
        ...state.lastReadOffsets,
        [contactAddress]: offset
      }
    }));
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  clearError: () => {
    set({ error: null });
  }
}));
