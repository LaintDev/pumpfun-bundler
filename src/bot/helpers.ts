import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { Context } from 'grammy';

export const BUNDLER_DIR = path.resolve(__dirname, '..', '..');
export const CONFIG_PATH = path.join(BUNDLER_DIR, 'config', 'config.json');
export const WALLETS_PATH = path.join(BUNDLER_DIR, 'config', 'wallets.json');

// ── JSON file I/O ────────────────────────────────────────────────────────────

export function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { return null; } }
export function loadWallets() { try { return JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf-8')); } catch { return null; } }
export function saveConfig(c: any) { fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2)); }
export function saveWallets(w: any) { fs.writeFileSync(WALLETS_PATH, JSON.stringify(w, null, 2)); }

// ── Bot config from config.json ──────────────────────────────────────────────

export function getBotToken(): string {
  const c = loadConfig();
  return c?.bot?.token || '';
}

function getOwnerIds(): string[] {
  const c = loadConfig();
  const ids = c?.bot?.ownerIds || [];
  return ids.map((s: string) => s.trim()).filter((s: string) => s && !s.includes('INSERT'));
}

// ── Last launch tracking (stored in config.json) ─────────────────────────────

export interface LastLaunch { name: string; symbol: string; mint: string; time: string }

export function loadLastLaunch(): LastLaunch | null {
  const c = loadConfig();
  return c?.lastLaunch || null;
}

export function saveLastLaunch(ll: LastLaunch) {
  const c = loadConfig();
  if (!c) return;
  c.lastLaunch = ll;
  saveConfig(c);
}

// ── Ready to launch ──────────────────────────────────────────────────────────

export function isReadyToLaunch(): { ready: boolean; missing: string[] } {
  const c = loadConfig();
  const w = loadWallets();
  const missing: string[] = [];
  if (!c) return { ready: false, missing: ['config.json'] };
  if (!c.token?.name) missing.push('Name');
  if (!c.token?.symbol) missing.push('Symbol');
  if (!c.token?.description) missing.push('Description');
  if (!c.token?.imageUrl) missing.push('Image');
  if (c.jito?.tipAmount === undefined || c.jito?.tipAmount === null) missing.push('Tip');
  if (c.buy?.creatorAmount === undefined || c.buy?.creatorAmount === null) missing.push('Creator buy');
  if (!w || !validKey(w.creatorWallet || '')) missing.push('Creator wallet');
  return { ready: missing.length === 0, missing };
}

export function hasAnyTokenData(): boolean {
  const c = loadConfig();
  if (!c) return false;
  return !!(c.token?.name || c.token?.symbol || c.token?.description);
}

export function resetTokenConfig() {
  const c = loadConfig();
  if (!c) return;
  const imageUrl = c.token?.imageUrl || '';
  c.token = { name: '', symbol: '', description: '', imageUrl, twitter: '', telegram: '', website: '' };
  c.buy = { walletCount: 0, creatorAmount: 0, amountPerWallet: [] };
  c.jito = { tipAmount: 0.002 };
  saveConfig(c);
}

// ── Utilities ────────────────────────────────────────────────────────────────

export function isOwner(ctx: Context): boolean {
  const ids = getOwnerIds();
  return ids.length === 0 || ids.includes(ctx.from?.id.toString() || '');
}

export function shortAddr(pk: string): string { return pk.slice(0, 4) + '...' + pk.slice(-4); }

export function getConnection(): Connection {
  const c = loadConfig();
  return new Connection(c?.rpc?.helius || 'https://api.devnet.solana.com', { commitment: 'confirmed' });
}

export function validKey(key: string): Keypair | null {
  if (!key || key.startsWith('INSERT')) return null;
  try { return Keypair.fromSecretKey(bs58.decode(key)); } catch { return null; }
}
