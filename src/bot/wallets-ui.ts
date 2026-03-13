import { Context, InlineKeyboard } from 'grammy';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { BotContext, BotConversation } from './types';
import { loadWallets, saveWallets, validKey, shortAddr, getConnection } from './helpers';

export async function showWallets(ctx: Context, edit?: { chatId: number; msgId: number }) {
  const w = loadWallets();
  const ckp = validKey(w?.creatorWallet || '');
  const buyers = (w?.buyerWallets || []).map((k: string, i: number) => ({ i, kp: validKey(k) })).filter((b: any) => b.kp);

  // Fetch balances
  let balances: number[] = [];
  try {
    const conn = getConnection();
    const keys = ckp ? [ckp.publicKey, ...buyers.map((b: any) => b.kp.publicKey)] : buyers.map((b: any) => b.kp.publicKey);
    if (keys.length > 0) {
      const rawBals = await Promise.all(keys.map(k => conn.getBalance(k)));
      balances = rawBals.map(b => b / LAMPORTS_PER_SOL);
    }
  } catch {}

  let t = '';
  const kb = new InlineKeyboard();

  if (ckp) {
    const bal = balances.length > 0 ? balances[0]!.toFixed(4) : '?';
    t += `👤 Creator — ${bal} SOL\n\`${ckp.publicKey.toBase58()}\`\n\n`;
  } else {
    t += `👤 Creator — not set\n\n`;
  }

  if (buyers.length > 0) {
    const offset = ckp ? 1 : 0;
    for (let i = 0; i < buyers.length; i++) {
      const bal = balances.length > i + offset ? balances[i + offset]!.toFixed(4) : '?';
      t += `👥 Buyer ${i + 1} — ${bal} SOL\n\`${buyers[i].kp!.publicKey.toBase58()}\`\n\n`;
    }
  } else {
    t += `👥 No buyers\n`;
  }

  // Buttons: creator actions first, then buyer actions
  if (!ckp) {
    kb.text('🔑 Generate Creator', 'w_gen_c').text('📥 Import Creator', 'w_imp_c').row();
  }
  if (buyers.length < 8) {
    kb.text('🔑 Generate Buyer', 'w_gen_b').text('📥 Import Buyer', 'w_imp_b').row();
  }
  if (ckp || buyers.length > 0) {
    if (ckp) kb.text('🗑 Creator', 'w_rm_c');
    if (buyers.length > 0) kb.text('🗑 Buyer', 'w_rm_b');
    kb.row();
  }
  kb.text('🔄 Refresh', 'w_refresh').text('Return', 'back_main');

  if (edit) { try { await ctx.api.editMessageText(edit.chatId, edit.msgId, t, { reply_markup: kb, parse_mode: 'Markdown' }); return; } catch {} }
  await ctx.reply(t, { reply_markup: kb, parse_mode: 'Markdown' });
}

export function registerWalletCallbacks(bot: any) {
  bot.callbackQuery('w_gen_b', async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const w = loadWallets(); if (!w) return;
    const valid = (w.buyerWallets || []).filter((k: string) => validKey(k));
    if (valid.length >= 8) return void await ctx.reply('❌ Max 8');
    const kp = Keypair.generate(); const pk = bs58.encode(kp.secretKey);
    valid.push(pk); w.buyerWallets = valid; saveWallets(w);
    await ctx.reply(`✅ Buyer #${valid.length}\n\n\`${kp.publicKey.toBase58()}\`\n\n🔑 \`${pk}\`\n\nSave the private key!`, { parse_mode: 'Markdown' });
    await showWallets(ctx);
  });

  bot.callbackQuery('w_gen_c', async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const w = loadWallets(); if (!w) return;
    const kp = Keypair.generate(); w.creatorWallet = bs58.encode(kp.secretKey); saveWallets(w);
    await ctx.reply(`✅ Creator wallet\n\n\`${kp.publicKey.toBase58()}\`\n\n🔑 \`${bs58.encode(kp.secretKey)}\`\n\nSave the private key!`, { parse_mode: 'Markdown' });
    await showWallets(ctx);
  });

  bot.callbackQuery('w_rm_c', async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('Remove creator wallet?', {
      reply_markup: new InlineKeyboard().text('✅ Yes', 'w_rm_c_ok').text('Cancel', 'menu_wallets')
    });
  });

  bot.callbackQuery('w_rm_c_ok', async (ctx: BotContext) => {
    await ctx.answerCallbackQuery('Removed');
    const w = loadWallets(); if (!w) return;
    w.creatorWallet = '';
    saveWallets(w);
    await showWallets(ctx);
  });

  bot.callbackQuery('w_rm_b', async (ctx: BotContext) => {
    await ctx.answerCallbackQuery();
    const w = loadWallets();
    const buyers = (w?.buyerWallets || []).map((k: string, i: number) => ({ i, kp: validKey(k) })).filter((b: any) => b.kp);
    const kb = new InlineKeyboard();
    for (const b of buyers) kb.text(`${b.i + 1}. ${shortAddr(b.kp!.publicKey.toBase58())}`, `wrm_${b.i}`).row();
    kb.text('Cancel', 'menu_wallets');
    await ctx.reply('Remove which?', { reply_markup: kb });
  });

  bot.callbackQuery(/^wrm_\d$/, async (ctx: BotContext) => {
    await ctx.answerCallbackQuery('Removed');
    const idx = parseInt(ctx.callbackQuery!.data.split('_')[1]!);
    const w = loadWallets(); if (!w) return;
    const valid = (w.buyerWallets || []).filter((k: string) => validKey(k));
    if (idx < valid.length) { valid.splice(idx, 1); w.buyerWallets = valid; saveWallets(w); }
    await showWallets(ctx);
  });
}

export async function impBuyerConvo(c: BotConversation, ctx: BotContext) {
  await ctx.reply('Paste buyer private key:');
  const key = (await c.waitFor('message:text')).message.text.trim();
  const kp = validKey(key); if (!kp) return void await ctx.reply('❌ Invalid key');
  const w = loadWallets(); if (!w) return;
  const valid = (w.buyerWallets || []).filter((k: string) => validKey(k));
  if (valid.length >= 8) return void await ctx.reply('❌ Max 8');
  valid.push(key); w.buyerWallets = valid; saveWallets(w);
  await ctx.reply(`✅ Imported ${shortAddr(kp.publicKey.toBase58())}`);
  await showWallets(ctx);
}

export async function impCreatorConvo(c: BotConversation, ctx: BotContext) {
  await ctx.reply('Paste creator private key:');
  const key = (await c.waitFor('message:text')).message.text.trim();
  const kp = validKey(key); if (!kp) return void await ctx.reply('❌ Invalid key');
  const w = loadWallets(); if (!w) return;
  w.creatorWallet = key; saveWallets(w);
  await ctx.reply(`✅ Creator set: ${shortAddr(kp.publicKey.toBase58())}`);
  await showWallets(ctx);
}
