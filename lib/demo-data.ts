import { generateMessageId } from './crypto';
import { Message } from './s3';

/**
 * Generate demo messages for testing
 */
export function generateDemoMessages(): Message[] {
  const now = new Date();
  const messages: Message[] = [];

  // Generate some sample conversations
  const conversations = [
    {
      from: 'alice',
      to: 'bob',
      content: 'Hey Bob! How are you doing?',
      hoursAgo: 2
    },
    {
      from: 'bob', 
      to: 'alice',
      content: 'Hi Alice! I\'m doing great, thanks for asking. How about you?',
      hoursAgo: 1.5
    },
    {
      from: 'alice',
      to: 'bob', 
      content: 'I\'m good too! Working on some exciting new projects.',
      hoursAgo: 1
    },
    {
      from: 'charlie',
      to: 'alice',
      content: 'Alice, did you see the latest updates?',
      hoursAgo: 3
    },
    {
      from: 'alice',
      to: 'charlie',
      content: 'Yes! The new features look amazing.',
      hoursAgo: 2.5
    }
  ];

  conversations.forEach(conv => {
    const timestamp = new Date(now.getTime() - conv.hoursAgo * 60 * 60 * 1000);
    const message: Message = {
      v: 1,
      msg_id: generateMessageId(
        timestamp.toISOString(),
        conv.from,
        conv.to,
        'demo-nonce',
        'demo-ciphertext'
      ),
      ts: timestamp.toISOString(),
      from: conv.from,
      to: conv.to,
      nonce: 'demo-nonce',
      ciphertext: 'demo-ciphertext',
      media: null,
      meta: { t: 'text' }
    };
    messages.push(message);
  });

  return messages;
}

/**
 * Initialize demo data for testing
 */
export function initializeDemoData() {
  // This would be called during app initialization
  // to set up demo conversations and test data
  console.log('Demo data initialized');
}
