import { Context, InlineKeyboard } from 'grammy';
import { type Conversation, type ConversationFlavor } from '@grammyjs/conversations';

export interface SessionData {}

export interface LaunchConfig {
  token: { name: string; symbol: string; description: string; imageUrl: string; twitter: string; telegram: string; website: string };
  buy: { walletCount: number; creatorAmount: number; amountPerWallet: number[] };
  jito: { tipAmount: number };
}

export type BotContext = ConversationFlavor<Context & { session: SessionData }>;
export type BotConversation = Conversation<BotContext>;
