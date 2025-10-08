declare module 'ss58' {
  export function ss58_encode(publicKey: Uint8Array): string;
  export function ss58_decode(address: string): Uint8Array;
}
