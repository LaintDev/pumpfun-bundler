import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export interface TokenConfig {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  twitter: string;
  telegram: string;
  website: string;
}

export interface BuyConfig {
  walletCount: number;
  creatorAmount: number;
  amountPerWallet: number[];
}

export interface AppConfig {
  token: TokenConfig;
  rpc: { helius: string; devnet: string };
  jito: { tipAmount: number };
  buy: BuyConfig;
  mode: 'mainnet' | 'devnet';
}

export interface WalletConfig {
  creatorWallet: string;
  buyerWallets: string[];
}

export function loadConfig(): AppConfig {
  const configPath = path.join(process.cwd(), 'config', 'config.json');
  if (!fs.existsSync(configPath)) throw new Error('config/config.json not found!');

  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (!config.token.name) throw new Error('Token name is missing!');
  if (!config.token.symbol) throw new Error('Token symbol is missing!');
  if (!config.token.description) throw new Error('Token description is missing!');

  if (config.buy.walletCount < 0 || config.buy.walletCount > 8)
    throw new Error('walletCount must be between 0 and 8!');
  if (config.buy.amountPerWallet.length !== config.buy.walletCount)
    throw new Error('amountPerWallet count must match walletCount!');
  if (config.buy.creatorAmount === undefined || config.buy.creatorAmount < 0)
    throw new Error('creatorAmount must be set and >= 0!');

  return config;
}

export function loadWallets(): WalletConfig {
  const walletsPath = path.join(process.cwd(), 'config', 'wallets.json');
  if (!fs.existsSync(walletsPath)) throw new Error('config/wallets.json not found!');

  const wallets: WalletConfig = JSON.parse(fs.readFileSync(walletsPath, 'utf-8'));
  if (!wallets.creatorWallet) throw new Error('Creator wallet is missing!');
  if (!wallets.buyerWallets) wallets.buyerWallets = [];

  return wallets;
}
