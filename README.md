# HippChat - Secure 1:1 Encrypted, Fully Decentralized Chat App(PoC)

A React Native chat application built with Expo that provides end-to-end encrypted messaging using Hippius S3/S4 (append) as the storage backend. Users are identified by Bittensor hotkeys (SS58) derived from mnemonics, and messages are encrypted using NaCl box (Curve25519-XSalsa20-Poly1305) in a sealed-box style.

## Features

- 🔐 **End-to-End Encryption**: NaCl box (Curve25519-XSalsa20-Poly1305) sealed-box style
- 🔑 **Bittensor Identity**: sr25519 identities (SS58); Curve25519 keys for message encryption
- ☁️ **Hippius S4 Append**: Messages stored as append-only, hourly-segmented logs
- 👥 **Test Users**: 10 predefined test users for easy testing
- 📱 **Modern UI**: Clean, professional chat interface with React Native
- 🔄 **Real-time Updates**: Polling-based message synchronization
- 📊 **State Management**: Zustand for app state, React Query for server state

## Tech Stack

- **Runtime**: Expo SDK 51+, React Native with Hermes
- **UI**: React Navigation, FlashList, custom chat components
- **Storage**: Hippius S3/S4 using @aws-sdk/client-s3 (S4 append via metadata)
- **Crypto**: tweetnacl (Curve25519-XSalsa20-Poly1305)
- **State**: Zustand + React Query
- **Language**: TypeScript

## Project Structure

```
app/
├── _layout.tsx          # Root layout with auth routing
├── login.tsx            # Login screen (mnemonic/test users)
├── chat.tsx             # Chat screen
└── (tabs)/
    ├── index.tsx        # Contacts screen
    └── explore.tsx      # Profile screen

lib/
├── crypto.ts            # Encryption/decryption utilities
├── s3.ts               # S3 client and storage operations
├── store.ts            # Zustand store
├── messaging.ts        # Messaging service
├── test-users.ts       # Predefined test users
└── query-client.ts     # React Query configuration
```

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   Update `app.config.js` with your Hippius S3/S4 endpoint:
   ```javascript
   extra: {
     hippS3Endpoint: "https://your-hippius-s3-endpoint.com",
     hippRegion: "us-east-1",
     usePerUserBucket: false,
     useS4Append: true
   }
   ```

3. **Run the app**:
   ```bash
   npm start
   # or
   expo start
   ```

## Architecture

### Identity System
- Users derive sr25519 identities from BIP39 mnemonics
- S3 credentials are generated from the private key
- Address is the SS58-encoded public key

### Message Format
Messages are stored as NDJSON (newline-delimited JSON) in hourly segment objects named `inbox-YYYYMMDDHH.log`:
```json
{
  "v": 1,
  "msg_id": "hash",
  "ts": "2025-01-24T20:00:00.000Z",
  "from": "senderAddress",
  "to": "recipientAddress", 
  "nonce": "base64url",
  "ciphertext": "base64url",
  "media": null,
  "meta": {"t": "text"}
}
```

### Storage Layout
- **Per-user buckets**:
  - `chat-<ss58>` - Append-only message logs segmented hourly as `inbox-YYYYMMDDHH.log`
  - `profile-<ss58>` - Profile objects `profile-<timestamp>.json` and optional avatar

### Encryption
- **Algorithm**: NaCl box (Curve25519-XSalsa20-Poly1305), sealed-box style
- **Key Exchange**: Ephemeral sender key + recipient's public key
- **Decryption**: Only recipient can decrypt using their private key

## Usage

1. **Login**: Choose between mnemonic input or test user selection
2. **Contacts**: View available contacts and recent conversations
3. **Chat**: Send encrypted messages to any contact
4. **Profile**: View and edit your profile information

## Security Notes

- Mnemonics are never uploaded to servers
- All encryption happens client-side
- Messages are stored as ciphertext only
- S3 credentials are derived from private keys (dev/test only)

## Development

The app includes comprehensive error handling, retry logic, and optimistic UI updates. All network operations are properly typed and include loading states.

## Testing

10 test users are included with predefined mnemonics and profiles. These can be used for immediate testing without needing to generate new identities.

## License

MIT License - see LICENSE file for details.