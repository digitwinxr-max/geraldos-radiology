/**
 * GeraldOS — Password hashing (native authentication)
 *
 * scrypt with a random 16-byte salt and a strong derived key. Stored format is
 * self-describing so parameters can be raised in the future without breaking
 * existing hashes:
 *
 *   scrypt$N$r$p$<salt hex>$<derived key hex>
 *
 * Verification uses crypto.timingSafeEqual so a wrong password does not leak
 * timing information about the stored hash. Plaintext passwords are never
 * stored or logged.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

interface ScryptOptions {
  N: number;
  r: number;
  p: number;
}

/** Promise wrapper for crypto.scrypt — avoids promisify's overload ambiguity. */
function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// OWASP-recommended scrypt parameters (N=2^14, r=8, p=1, 64-byte key).
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

/** Hash a plaintext password into the self-describing storage format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

/**
 * Verify a plaintext password against a stored hash. Returns false for any
 * malformed or unknown-format stored value (fail closed).
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== PREFIX) return false;

    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    if (n <= 0 || r <= 0 || p <= 0) return false;

    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    if (salt.length === 0 || expected.length === 0) return false;

    const actual = (await scryptAsync(password, salt, expected.length, {
      N: n,
      r,
      p,
    })) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
