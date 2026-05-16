import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256B64Url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function genClientId(): string {
  return `glgcli_${randomBytes(12).toString("base64url")}`;
}

export function genClientSecret(): string {
  return `glgsec_${randomBytes(32).toString("base64url")}`;
}

export function genAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === "plain") {
    const a = Buffer.from(verifier);
    const b = Buffer.from(challenge);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  if (method === "S256") {
    const computed = sha256B64Url(verifier);
    const a = Buffer.from(computed);
    const b = Buffer.from(challenge);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return false;
}

export function compareSecret(plain: string, hash: string): boolean {
  const a = Buffer.from(sha256Hex(plain), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
