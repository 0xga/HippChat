
// Production-ready encryption implementation using tweetnacl
import * as nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

export interface KeyPair {
  seed: string;
  sk: Uint8Array;
  pk: Uint8Array;
  accessKeyId: string;
  ss58Address: string;
}

export interface EncryptedMessage {
  nonce: string;
  ciphertext: string;
}

/**
 * Generate a simple keypair using tweetnacl
 */

/**
 * Derive keypair from a simple seed string (for test users)
 */
export function deriveKeysFromSeed(seed: string, ss58Address: string): KeyPair {
  // Create a deterministic keypair from seed
  const seedBytes = naclUtil.decodeUTF8(seed);
  const hash = nacl.hash(seedBytes);
  
  // Use first 32 bytes as seed for key generation
  const keyPair = nacl.box.keyPair.fromSecretKey(hash.slice(0, 32));
  
  
  return {
    seed: seed,
    sk: keyPair.secretKey,
    pk: keyPair.publicKey,
    accessKeyId: Buffer.from(seed).toString('base64'),
    ss58Address: ss58Address.trim(),
  };
}

/**
 * Generate Hippius S3 credentials from keypair
 */
export function hippiusCredentialsFromKeyPair(keyPair: KeyPair): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
} {
  return {
    accessKeyId: keyPair.accessKeyId,
    secretAccessKey: keyPair.seed,
    sessionToken: ''
  };
}

/**
 * Encrypt message for recipient using tweetnacl SealedBox (equivalent to nacl.public.SealedBox)
 */
export function encryptFor(recipientPk: Uint8Array, plaintext: Uint8Array): EncryptedMessage {
  // Debug: validate inputs
  if (!(recipientPk instanceof Uint8Array) || recipientPk.length !== 32) {
    console.log('[encryptFor] Invalid recipientPk length:', (recipientPk as any)?.length);
    throw new Error('recipientPk must be 32 bytes');
  }
  if (!(plaintext instanceof Uint8Array)) {
    console.log('[encryptFor] plaintext is not Uint8Array');
    throw new Error('plaintext must be Uint8Array');
  }
  // Use tweetnacl's box for public key encryption
  // Generate ephemeral keypair for this encryption
  const ephemeralKeyPair = nacl.box.keyPair();
  
  // Encrypt using recipient's public key and our ephemeral private key
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(plaintext, nonce, recipientPk, ephemeralKeyPair.secretKey);
  // console.log('[encryptFor] ephemeralPk[0..3]:', Array.from(ephemeralKeyPair.publicKey.slice(0, 4)));
  // console.log('[encryptFor] nonce(b64):', naclUtil.encodeBase64(nonce));
  
  if (!ciphertext) {
    throw new Error('Encryption failed');
  }
  
  // Combine ephemeral public key with ciphertext
  const combined = new Uint8Array(32 + ciphertext.length);
  combined.set(ephemeralKeyPair.publicKey, 0);
  combined.set(ciphertext, 32);
  // console.log('[encryptFor] combined length:', combined.length);
  
  return {
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(combined)
  };
}

/**
 * Decrypt message using tweetnacl SealedBox
 */
export function decryptFrom(senderPk: Uint8Array, ourSk: Uint8Array, encrypted: EncryptedMessage): Uint8Array {
  // Debug: validate inputs
  if (!(ourSk instanceof Uint8Array) || ourSk.length !== 32) {
    console.log('[decryptFrom] Invalid ourSk length:', (ourSk as any)?.length);
    throw new Error('ourSk must be 32 bytes');
  }
  const nonce = naclUtil.decodeBase64(encrypted.nonce);
  const combined = naclUtil.decodeBase64(encrypted.ciphertext);
  
  // Extract ephemeral public key and ciphertext
  const ephemeralPk = combined.slice(0, 32);
  const ciphertext = combined.slice(32);
  // console.log('[decryptFrom] ephemeralPk[0..3]:', Array.from(ephemeralPk.slice(0, 4)));
  // console.log('[decryptFrom] nonce(b64):', naclUtil.encodeBase64(nonce));
  
  // Decrypt using our private key and ephemeral public key
  const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPk, ourSk);
  
  if (!plaintext) {
    console.log('[decryptFrom] Decryption failed. ciphertext length:', ciphertext.length);
    throw new Error('Decryption failed - invalid ciphertext or keys');
  }
  
  return plaintext;
}

/**
 * Generate message ID using cryptographic hash
 */
export function generateMessageId(
  timestamp: string,
  from: string,
  to: string,
  nonce: string,
  ciphertext: string
): string {
  const data = `${timestamp}|${from}|${to}|${nonce}|${ciphertext}`;
  const dataBytes = naclUtil.decodeUTF8(data);
  const hash = nacl.hash(dataBytes);
  return naclUtil.encodeBase64(hash);
}

/**
 * Convert keypair to hex strings for storage/transmission
 */
export function keyPairToHex(keyPair: KeyPair): { sk: string; pk: string } {
  return {
    sk: Buffer.from(keyPair.sk).toString('hex'),
    pk: Buffer.from(keyPair.pk).toString('hex')
  };
}

/**
 * Convert hex strings back to keypair
 */
export function hexToKeyPair(skHex: string, pkHex: string, accessKeyId: string, ss58Address: string): KeyPair {
  return {
    seed: '',
    sk: Buffer.from(skHex, 'hex'),
    pk: Buffer.from(pkHex, 'hex'),
    accessKeyId,
    ss58Address
  };
}

/**
 * Sign a message with private key
 */
export function signMessage(message: Uint8Array, privateKey: Uint8Array): string {
  const signature = nacl.sign.detached(message, privateKey);
  return naclUtil.encodeBase64(signature);
}

/**
 * Verify a message signature
 */
export function verifySignature(message: Uint8Array, signature: string, publicKey: Uint8Array): boolean {
  const sigBytes = naclUtil.decodeBase64(signature);
  return nacl.sign.detached.verify(message, sigBytes, publicKey);
}
