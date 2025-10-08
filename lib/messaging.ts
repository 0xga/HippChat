// Mock S3 client type for demo purposes
import {
  decryptFrom,
  encryptFor,
  generateMessageId
} from './crypto';
import {
  appendInboxLine,
  getInboxRecentLines,
  getUserProfile,
  Message,
  pollInboxTail,
  putUserProfile,
  UserProfile
} from './s3';
import { useChatStore } from './store';

// Guard against duplicate initial history loads per contact across renders/instances
const __initialHistory = {
  inFlight: new Map<string, Promise<Message[]>>(),
  done: new Set<string>()
};

export interface SendMessageParams {
  to: string;
  content: string;
  type?: string;
}

export class MessagingService {
  private s3: any;
  private chatBucket: string;
  private profileBucket: string;
  private currentUser: { sk: Uint8Array; pk: Uint8Array; ss58Address: string };

  constructor(s3: any, currentUser: { sk: Uint8Array; pk: Uint8Array; ss58Address: string }) {
    this.s3 = s3;
    this.chatBucket = `chat-${currentUser.ss58Address}`;
    this.profileBucket = `profile-${currentUser.ss58Address}`;
    this.currentUser = currentUser;
  }

  /**
   * Send a message to a contact
   */
  async sendMessage({ to, content, type = 'text' }: SendMessageParams): Promise<Message> {
    try {
      console.log('[sendMessage] to:', to, 'type:', type);
      // Get recipient's public key from their profile bucket
      const recipientProfile = await getUserProfile(this.s3, `profile-${to}`);
      if (!recipientProfile) {
        throw new Error('Recipient profile not found');
      }

      const recipientPk = Buffer.from(recipientProfile.pk, 'hex');
      const plaintext = Buffer.from(content, 'utf8');
      console.log('[sendMessage] recipientPk[0..3]:', Array.from(recipientPk.slice(0, 4)), 'plaintext.len:', plaintext.length);
      
      // Encrypt for recipient
      const { nonce: nonceForRecipient, ciphertext: ctForRecipient } = encryptFor(recipientPk, plaintext);
      console.log('[sendMessage] for recipient nonce.len:', nonceForRecipient.length, 'ciphertext.len:', ctForRecipient.length);

      // Encrypt a self-copy so sender can read their own history
      const { nonce: nonceForSelf, ciphertext: ctForSelf } = encryptFor(this.currentUser.pk, plaintext);
      console.log('[sendMessage] for self nonce.len:', nonceForSelf.length, 'ciphertext.len:', ctForSelf.length);
      
      // Create message
      const timestamp = new Date().toISOString();
      const messageForRecipient: Message = {
        v: 1,
        msg_id: generateMessageId(timestamp, this.currentUser.ss58Address, to, nonceForRecipient, ctForRecipient),
        ts: timestamp,
        from: this.currentUser.ss58Address,
        to,
        nonce: nonceForRecipient,
        ciphertext: ctForRecipient,
        media: null,
        meta: { t: type }
      };
      const messageForSelf: Message = {
        v: 1,
        msg_id: generateMessageId(timestamp, this.currentUser.ss58Address, to, nonceForSelf, ctForSelf),
        ts: timestamp,
        from: this.currentUser.ss58Address,
        to,
        nonce: nonceForSelf,
        ciphertext: ctForSelf,
        media: null,
        meta: { t: type }
      };

      // Append to recipient's inbox (their chat bucket)
      const lineRecipient = JSON.stringify(messageForRecipient);
      console.log('[sendMessage] appendInboxLine (recipient) bucket:', `chat-${to}`, 'line.len:', lineRecipient.length);
      await appendInboxLine(this.s3, `chat-${to}`, lineRecipient);

      // Append to sender's own inbox (self history)
      const lineSelf = JSON.stringify(messageForSelf);
      console.log('[sendMessage] appendInboxLine (self) bucket:', this.chatBucket, 'line.len:', lineSelf.length);
      await appendInboxLine(this.s3, this.chatBucket, lineSelf);

      // Return a message usable by UI immediately (include decryptedContent for local echo)
      return { ...messageForSelf, meta: { t: type }, decryptedContent: content } as Message & { decryptedContent?: string };
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Load initial history for a contact (both directions), decrypt, and persist offset.
   */
  async loadInitialHistory(contactAddress: string, maxLines: number): Promise<Message[]> {
    try {
      if (__initialHistory.done.has(contactAddress)) {
        // console.log('[loadInitialHistory] already done for', contactAddress);
        return [];
      }
      const existingInFlight = __initialHistory.inFlight.get(contactAddress);
      if (existingInFlight) {
        // console.log('[loadInitialHistory] awaiting in-flight for', contactAddress);
        return existingInFlight;
      }

      const run = (async () => {
      // console.log('[loadInitialHistory] contact:', contactAddress, 'maxLines:', maxLines, 'bucket:', this.chatBucket);
      const { lines, newOffset } = await getInboxRecentLines(this.s3, this.chatBucket, maxLines);
      // console.log('[loadInitialHistory] fetched lines:', lines.length, 'newOffset:', newOffset, 'bucket:', this.chatBucket);

      // Persist latest offset for this contact
      try {
        const { updateLastReadOffset } = useChatStore.getState();
        updateLastReadOffset(contactAddress, newOffset);
      } catch (e) {
        console.error('[loadInitialHistory] Failed to persist newOffset:', e);
      }

        const existing = useChatStore.getState().messages[contactAddress] || [];
        const existingIds = new Set(existing.map(m => m.msg_id));
        const messages: Message[] = [];

      for (const line of lines) {
        try {
          const message: Message = JSON.parse(line);
          const isIncoming = message.to === this.currentUser.ss58Address && message.from === contactAddress;
          const isOutgoing = message.from === this.currentUser.ss58Address && message.to === contactAddress;
          if (!isIncoming && !isOutgoing) continue;

          const senderProfile = await getUserProfile(this.s3, `profile-${message.from}`);
          if (!senderProfile) {
            console.error('[loadInitialHistory] Sender profile not found for:', message.from);
            continue;
          }

          const senderPk = Buffer.from(senderProfile.pk, 'hex');
          const decrypted = decryptFrom(senderPk, this.currentUser.sk, {
            nonce: message.nonce,
            ciphertext: message.ciphertext
          });
          const decryptedMessage = {
            ...message,
            decryptedContent: Buffer.from(decrypted).toString('utf8')
          } as Message & { decryptedContent: string };

          if (!existingIds.has(decryptedMessage.msg_id)) {
            messages.push(decryptedMessage);
            existingIds.add(decryptedMessage.msg_id);
          }
        } catch (e) {
          console.error('[loadInitialHistory] Failed to parse/decrypt line:', e);
        }
      }

        // Sort messages by timestamp to ensure stable order
        messages.sort((a: any, b: any) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

        // Push into store
        const { addMessages } = useChatStore.getState();
        if (messages.length > 0) {
          addMessages(contactAddress, messages);
        }

        __initialHistory.done.add(contactAddress);
        return messages;
      })();

      __initialHistory.inFlight.set(contactAddress, run);
      const result = await run;
      __initialHistory.inFlight.delete(contactAddress);
      return result;
    } catch (error) {
      __initialHistory.inFlight.delete(contactAddress);
      console.error('Failed to load initial history:', error);
      throw error;
    }
  }

  /**
   * Poll for new messages from a specific contact
   */
  async pollMessages(contactAddress: string, fromOffset: number): Promise<Message[]> {
    try {
      // console.log('[pollMessages] contact:', contactAddress, 'fromOffset:', fromOffset);
      const { lines, newOffset } = await pollInboxTail(this.s3, this.chatBucket, fromOffset);
      // console.log('[pollMessages] fetched lines:', lines.length, 'newOffset:', newOffset);
      
      const existing = useChatStore.getState().messages[contactAddress] || [];
      const existingIds = new Set(existing.map(m => m.msg_id));
      const messages: Message[] = [];
      let considered = 0;
      let matched = 0;
      let loggedSamples = 0;
      for (const line of lines) {
        try {
          // console.log('[pollMessages] parse line.len:', line.length);
          const message: Message = JSON.parse(line);
          const isIncoming = message.to === this.currentUser.ss58Address && message.from === contactAddress;
          const isOutgoing = message.from === this.currentUser.ss58Address && message.to === contactAddress;
          considered++;
          if (loggedSamples < 5) {
            // console.log('[pollMessages] sample', {
            //   from: message.from,
            //   to: message.to,
            //   currentUser: this.currentUser.ss58Address,
            //   contact: contactAddress,
            //   isIncoming,
            //   isOutgoing,
            //   ts: message.ts
            // });
            loggedSamples++;
          }
          if (isIncoming || isOutgoing) {
            matched++;
            // Get sender's public key from their profile bucket
            const senderProfile = await getUserProfile(this.s3, `profile-${message.from}`);
            if (!senderProfile) {
              console.error('Sender profile not found for:', message.from);
              continue;
            }
            
            const senderPk = Buffer.from(senderProfile.pk, 'hex');
            // console.log('[pollMessages] decrypt using senderPk[0..3]:', Array.from(senderPk.slice(0, 4)));
            const decrypted = decryptFrom(senderPk, this.currentUser.sk, {
              nonce: message.nonce,
              ciphertext: message.ciphertext
            });
            
            // Add decrypted content to message metadata
            const decryptedMessage = {
              ...message,
              decryptedContent: Buffer.from(decrypted).toString('utf8')
            };
            // console.log('[pollMessages] decryptedContent.len:', (decryptedMessage.decryptedContent || '').length);
            
            if (!existingIds.has(decryptedMessage.msg_id)) {
              messages.push(decryptedMessage as Message & { decryptedContent: string });
              existingIds.add(decryptedMessage.msg_id);
            }
          }
        } catch (parseError) {
          console.error('Failed to parse message line:', parseError);
        }
      }

      // Sort messages by timestamp to ensure stable order
      messages.sort((a: any, b: any) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      const maxMessageTs = messages.reduce((mx, m: any) => Math.max(mx, new Date(m.ts).getTime() || 0), 0);
      const bestOffset = Math.max(newOffset || 0, maxMessageTs || 0, fromOffset || 0);
      try {
        const { updateLastReadOffset } = useChatStore.getState();
        updateLastReadOffset(contactAddress, bestOffset);
        // console.log('[pollMessages] persist offset:', { fromOffset, newOffset, maxMessageTs, bestOffset });
      } catch (e) {
        console.error('[pollMessages] Failed to persist bestOffset:', e);
      }
      // console.log('[pollMessages] considered:', considered, 'matched:', matched, 'toAppend:', messages.length, 'existingInStore:', existing.length);
      return messages;
    } catch (error) {
      console.error('Failed to poll messages:', error);
      throw error;
    }
  }

  /**
   * Check if there is a recent incoming message from contact within lookbackMs.
   * Useful for diagnostics to ensure Alice's send appears on Bob's side.
   */
  async hasRecentIncoming(contactAddress: string, lookbackMs: number = 5 * 60 * 1000): Promise<boolean> {
    try {
      const { lines } = await getInboxRecentLines(this.s3, this.chatBucket, 50);
      const threshold = Date.now() - Math.max(0, lookbackMs);
      let found = false;
      for (const line of lines) {
        try {
          const msg: Message = JSON.parse(line);
          const isIncoming = msg.to === this.currentUser.ss58Address && msg.from === contactAddress;
          if (!isIncoming) continue;
          const t = new Date(msg.ts).getTime();
          if (isFinite(t) && t >= threshold) {
            found = true;
            break;
          }
        } catch {}
      }
      console.log('[hasRecentIncoming]', { contactAddress, lookbackMs, found });
      return found;
    } catch (e) {
      console.error('[hasRecentIncoming] failed:', e);
      return false;
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(address: string): Promise<UserProfile | null> {
    return getUserProfile(this.s3, this.profileBucket);
  }

  /**
   * Update user profile
   */
  async updateUserProfile(profile: UserProfile): Promise<void> {
    return putUserProfile(this.s3, this.profileBucket, profile);
  }
}

/**
 * Hook for messaging operations
 */
export function useMessaging() {
  const { s3Client, currentUser } = useChatStore();
  
  if (!s3Client || !currentUser) {
    return null;
  }

  return new MessagingService(s3Client, currentUser);
}
