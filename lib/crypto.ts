// Optional payload encryption for the backend calls (JWE, via the `jose` library): the request travels as a
// compact JWE (RSA-OAEP-256 + A256GCM) for the backend's public key, and carries a fresh AES key the backend
// uses to encrypt its answer (alg "dir", A256GCM). The backend's matching settings are chat.encryption.* in
// application.yaml.
//
// Build-time settings (NEXT_PUBLIC_ values are inlined into the bundle, so changing one needs a rebuild):
//   NEXT_PUBLIC_ENCRYPTION_ENABLED     "true" turns it on; anything else leaves every call as plain JSON.
//   NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY  the backend's RSA public key: base64 of the DER (SPKI) form, one line.
//   NEXT_PUBLIC_ENCRYPTION_KEY_ID      the "kid" of that key pair; the backend refuses a request with another one.
//   NEXT_PUBLIC_ENCRYPTED_PATHS        comma-separated "METHOD /path" patterns (* is one segment, ** is many) to
//                                      encrypt. Keep it the same as the backend's chat.encryption.paths.
//
// Needs a secure context (https or localhost): crypto.subtle does not exist on plain http elsewhere.

import { CompactEncrypt, compactDecrypt, importSPKI } from "jose";

export const ENCRYPTED_CONTENT_TYPE = "application/jose";
/** Header that carries the encrypted request for a call that has no body. */
export const ENCRYPTED_KEY_HEADER = "X-Enc";

const ENABLED = process.env.NEXT_PUBLIC_ENCRYPTION_ENABLED === "true";
const PUBLIC_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY ?? "";
const KEY_ID = process.env.NEXT_PUBLIC_ENCRYPTION_KEY_ID ?? "";
const DEFAULT_PATHS = [
  "POST /api/chat-session/start",
  "POST /api/chat-session/verify",
  "POST /api/conversations",
  "POST /api/conversations/*/messages",
  "GET /api/conversations/*",
  "POST /api/chat-events",
].join(",");

interface Rule {
  method: string;
  path: RegExp;
}

function parseRules(list: string): Rule[] {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [method, pattern] = entry.split(/\s+/);
      if (!method || !pattern) {
        throw new Error(`NEXT_PUBLIC_ENCRYPTED_PATHS entries look like "POST /api/x", got "${entry}"`);
      }
      const source = pattern
        .split("/")
        .map((segment) =>
          segment === "**" ? ".*" : segment === "*" ? "[^/]+" : segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        )
        .join("/");
      return { method: method.toUpperCase(), path: new RegExp(`^${source}$`) };
    });
}

const RULES = ENABLED ? parseRules(process.env.NEXT_PUBLIC_ENCRYPTED_PATHS ?? DEFAULT_PATHS) : [];

/** True when encryption is on and this call (`path` may carry a query string) is on the configured list. */
export function shouldEncrypt(method: string, path: string): boolean {
  if (!ENABLED) return false;
  const pathname = path.split("?")[0];
  return RULES.some((rule) => (rule.method === "*" || rule.method === method.toUpperCase()) && rule.path.test(pathname));
}

let publicKey: ReturnType<typeof importSPKI> | null = null;

function loadPublicKey() {
  if (!publicKey) {
    if (!PUBLIC_KEY) throw new Error("NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY is not set");
    const lines = PUBLIC_KEY.replace(/\s+/g, "").match(/.{1,64}/g) ?? [];
    const pem = `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
    publicKey = importSPKI(pem, "RSA-OAEP-256");
  }
  return publicKey;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Seals a request. `body` is the JSON body (leave it out for a call without one). `responseKey` is what the
 * backend's answer is encrypted with; hand it to {@link decryptResponse} for that answer.
 */
export async function encryptRequest(body?: unknown): Promise<{ jwe: string; responseKey: Uint8Array }> {
  const responseKey = crypto.getRandomValues(new Uint8Array(32));
  const payload = {
    ts: Date.now(),
    nonce: crypto.randomUUID(),
    rk: base64Url(responseKey),
    ...(body === undefined ? {} : { body }),
  };
  const jwe = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", ...(KEY_ID ? { kid: KEY_ID } : {}) })
    .encrypt(await loadPublicKey());
  return { jwe, responseKey };
}

/** Opens the backend's encrypted answer to a request sealed with `responseKey`; resolves with its text (JSON). */
export async function decryptResponse(jwe: string, responseKey: Uint8Array): Promise<string> {
  const { plaintext } = await compactDecrypt(jwe, responseKey, {
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  return new TextDecoder().decode(plaintext);
}
