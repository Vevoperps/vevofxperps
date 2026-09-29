/**
 * Shared setup for the operator scripts: a provider from the environment, the
 * program from its generated IDL, and the PDAs every script needs.
 *
 * Environment (see .env.example):
 *   RPC_URL          cluster endpoint (devnet or mainnet)
 *   ADMIN_KEYPAIR    path to the admin keypair JSON (default ~/.config/solana/id.json)
 *   USDC_MINT        the settlement mint
 *
 * Run a script with `node --env-file=.env --import tsx scripts/<name>.ts`.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import idl from "../target/idl/vevo.json";
import type { Vevo } from "../target/types/vevo";

export const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set — see .env.example`);
  return value;
};

export const loadKeypair = (path: string): Keypair => {
  const full = path.startsWith("~") ? resolve(homedir(), path.slice(2)) : resolve(path);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(full, "utf8")) as number[]));
};

export const setup = () => {
  const connection = new Connection(required("RPC_URL"), "confirmed");
  const admin = loadKeypair(process.env.ADMIN_KEYPAIR?.trim() || "~/.config/solana/id.json");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = new Program(idl as Vevo, provider);
  const pda = (...seeds: (Buffer | Uint8Array)[]) =>
    PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  return {
    connection,
    admin,
    provider,
    program,
    config: pda(Buffer.from("config")),
    marks: pda(Buffer.from("marks")),
    vault: pda(Buffer.from("vault")),
    market: (symbol: string) => pda(Buffer.from("market"), Buffer.from(symbolBytes(symbol))),
    trader: (owner: PublicKey) => pda(Buffer.from("trader"), owner.toBuffer()),
  };
};

/** ASCII, zero padded to 8 bytes: the market's seed and its on-chain name. */
export const symbolBytes = (symbol: string): number[] => {
  if (symbol.length > 8) throw new Error(`symbol ${symbol} is longer than 8 bytes`);
  const out = new Array<number>(8).fill(0);
  Buffer.from(symbol, "ascii").forEach((byte, i) => (out[i] = byte));
  return out;
};

/** USDC has six decimals; the market table is written in whole dollars. */
export const USDC_DECIMALS = 6;
export const dollars = (whole: number): anchor.BN =>
  new anchor.BN(whole).mul(new anchor.BN(10).pow(new anchor.BN(USDC_DECIMALS)));
