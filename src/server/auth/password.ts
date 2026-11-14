// Password hashing for the local auth shim — scrypt (node:crypto), no native deps.
import crypto from 'node:crypto';

const KEYLEN = 64;
const PARAMS = { N: 16_384, r: 8, p: 1 };
const MIN_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, nStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scrypt(password, salt, expected.length, { ...PARAMS, N: Number(nStr) || PARAMS.N });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export function passwordPolicyError(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (password.length > 256) return 'Password is too long';
  return null;
}

function scrypt(password: string, salt: Buffer, keylen: number, params: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, params, (err, derivedKey) => (err ? reject(err) : resolve(Buffer.from(derivedKey))));
  });
}
