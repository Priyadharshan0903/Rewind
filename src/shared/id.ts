const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Short random id, safe in both main (Node) and renderer (browser). */
export function newId(size = 10): string {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}
