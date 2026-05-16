import { hash, verify } from "@node-rs/argon2";

const opts = { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 };

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, opts);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain, opts);
  } catch {
    return false;
  }
}
