import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import bs58 from "bs58";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

import { config } from "./config.js";
import { pool } from "./db.js";

/**
 * Sign-in with a Solana wallet.
 *
 * The server hands out a one-time message; the wallet signs it (a message
 * signature — no transaction, no fee); the server checks the ed25519
 * signature against the address, burns the nonce, and returns a session
 * token. Every action that moves a balance requires that token, and acts only
 * on the address inside it.
 */

const NONCE_TTL_SECONDS = 10 * 60;

/** Whether a browser origin may call the API (exact, or `https://*.domain`). */
export const originAllowed = (origin: string): boolean =>
  config.ALLOWED_ORIGINS.some((allowed) => {
    if (allowed === origin) return true;
    const wildcard = /^https:\/\/\*\.(.+)$/.exec(allowed);
    if (!wildcard || !origin.startsWith("https://")) return false;
    const host = origin.slice("https://".length);
    return host.endsWith(`.${wildcard[1]}`) && !host.includes("/");
  });

/**
 * The domain named in the sign-in message.
 *
 * Wallets (Phantom first) read the first line of a sign-in message and refuse
 * to show it when the domain is not the page asking: it is their phishing
 * guard. So the message names the host the request actually came from
 * (vevoperps.com, www., a preview, localhost), but only when that origin is
 * one the API already allows; anything else falls back to SIGNIN_DOMAIN.
 */
export const signInDomain = (origin: string | undefined): string => {
  if (!origin || !originAllowed(origin)) return config.SIGNIN_DOMAIN;
  try {
    return new URL(origin).host;
  } catch {
    return config.SIGNIN_DOMAIN;
  }
};

const domainAllowed = (domain: string): boolean =>
  domain === config.SIGNIN_DOMAIN || originAllowed(`https://${domain}`) || originAllowed(`http://${domain}`);

const HEADLINE = " wants you to sign in with your Solana account:";

export const signInMessage = (domain: string, address: string, nonce: string, issuedAt: Date): string =>
  [
    `${domain}${HEADLINE}`,
    address,
    "",
    "Sign in to trade. This request does not trigger a transaction or cost a fee.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
  ].join("\n");

export const issueNonce = async (address: string, domain: string): Promise<string> => {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  await pool.query("DELETE FROM nonces WHERE expires_at < now()");
  await pool.query("INSERT INTO nonces (nonce, address, expires_at) VALUES ($1, $2, now() + $3 * interval '1 second')", [
    nonce,
    address,
    NONCE_TTL_SECONDS,
  ]);
  return signInMessage(domain, address, nonce, issuedAt);
};

const decodeSignature = (value: string): Uint8Array | null => {
  try {
    const bytes = /^[0-9a-zA-Z+/=]+$/.test(value) && value.length === 88 ? Buffer.from(value, "base64") : bs58.decode(value);
    return bytes.length === 64 ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
};

/** Verifies a signed sign-in message; returns a session token or null. */
export const verifySignIn = async (address: string, message: string, signature: string): Promise<string | null> => {
  const nonce = /\nNonce: ([0-9a-f]{32})\n/.exec(message)?.[1];
  if (!nonce) return null;
  const [headline, signer] = message.split("\n");
  if (!headline?.endsWith(HEADLINE) || signer !== address) return null;
  if (!domainAllowed(headline.slice(0, -HEADLINE.length))) return null;

  const sig = decodeSignature(signature);
  if (!sig) return null;

  let key: Uint8Array;
  try {
    key = new PublicKey(address).toBytes();
  } catch {
    return null;
  }
  if (!nacl.sign.detached.verify(new TextEncoder().encode(message), sig, key)) return null;

  // Burn the nonce: it must exist, belong to this address and be unexpired.
  const burned = await pool.query("DELETE FROM nonces WHERE nonce = $1 AND address = $2 AND expires_at > now() RETURNING nonce", [
    nonce,
    address,
  ]);
  if (burned.rowCount !== 1) return null;

  return issueToken(address);
};

// ------------------------------------------------------------ session tokens

const b64url = (value: Buffer | string): string => Buffer.from(value).toString("base64url");

const sign = (payload: string): string => createHmac("sha256", config.SESSION_SECRET).update(payload).digest("base64url");

export const issueToken = (address: string): string => {
  const payload = b64url(JSON.stringify({ sub: address, exp: Math.floor(Date.now() / 1000) + config.SESSION_TTL }));
  return `${payload}.${sign(payload)}`;
};

/** The address a token speaks for, or null when it is forged or expired. */
export const verifyToken = (token: string): string | null => {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    if (!body.sub || !body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body.sub;
  } catch {
    return null;
  }
};
