const sr25519 = require('@scure/sr25519');
const crypto = require('node:crypto');

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes) {
  let x = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let result = "";
  while (x > 0n) {
    const mod = x % 58n;
    result = ALPHABET[Number(mod)] + result;
    x /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) result = "1" + result;
    else break;
  }
  return result;
}

function ss58Encode(publicKey, prefix = 42) {
  if (!publicKey || publicKey.length !== 32) throw new Error("Public key must be 32 bytes");
  const prefixBytes =
    prefix < 64
      ? Uint8Array.from([prefix])
      : Uint8Array.from([
          ((prefix & 0b11111100) >> 2) | 0b01000000,
          prefix >> 8,
        ]);
  const payload = Buffer.concat([Buffer.from(prefixBytes), Buffer.from(publicKey)]);
  const hash = crypto.createHash("blake2b512");
  hash.update(Buffer.from("SS58PRE"));
  hash.update(payload);
  const checksum = hash.digest().slice(0, 2);
  const data = Buffer.concat([payload, checksum]);
  return base58Encode(data);
}

function mnemonicToSeedSync(mnemonic, passphrase = "") {
  return crypto.pbkdf2Sync(
    Buffer.from(mnemonic.normalize("NFKD"), "utf8"),
    Buffer.from(("mnemonic" + passphrase).normalize("NFKD"), "utf8"),
    2048,
    64,
    "sha512"
  );
}

function mnemonicToSs58(mnemonic, ss58Prefix = 42) {
  const seed64 = mnemonicToSeedSync(mnemonic);
  const seed32 = seed64.slice(0, 32);
  const secretKey = sr25519.secretFromSeed(new Uint8Array(seed32));
  const publicKey = sr25519.getPublicKey(secretKey);
  return ss58Encode(publicKey, ss58Prefix);
}

const mnemonic = process.argv.slice(2).join(' ').trim();
if (!mnemonic) {
  console.error('Usage: node scripts/check_mnemonic.js "<mnemonic words>"');
  process.exit(1);
}
console.log(mnemonicToSs58(mnemonic));


