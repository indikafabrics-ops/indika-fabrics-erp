const PREFIX = 'sha256$';

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const isHashed = (stored: unknown) => typeof stored === 'string' && stored.startsWith(PREFIX);

/** Salted SHA-256 – stored as "sha256$<salt>$<hash>" in the existing password column. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${PREFIX}${salt}$${await sha256Hex(salt + pw)}`;
}

/** Works for new hashed passwords and for old plain-text ones (which are upgraded after a successful login). */
export async function verifyPassword(input: string, stored: unknown): Promise<boolean> {
  if (typeof stored !== 'string' || !stored) return false;
  if (!isHashed(stored)) return stored === input;
  const [, salt, hash] = stored.split('$');
  return (await sha256Hex(salt + input)) === hash;
}
