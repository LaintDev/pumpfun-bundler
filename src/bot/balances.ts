import { Context, InlineKeyboard } from 'grammy';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadWallets, validKey, shortAddr, getConnection } from './helpers';

export async function showBalances(ctx: Context) {
  const w = loadWallets(); if (!w) return;
  const ckp = validKey(w.creatorWallet || '');
  if (!ckp) return void await ctx.reply('❌ No creator wallet.', { reply_markup: new InlineKeyboard().text('Return', 'back_main') });

  const msg = await ctx.reply('⏳');
  try {
    const conn = getConnection();
    const keys = [ckp.publicKey];
    const bkps: Keypair[] = [];
    for (const k of w.buyerWallets || []) { const kp = validKey(k); if (kp) { keys.push(kp.publicKey); bkps.push(kp); } }
    const bals = await Promise.all(keys.map(k => conn.getBalance(k)));

    let t = `👤 ${shortAddr(ckp.publicKey.toBase58())}  ${(bals[0]! / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`;
    for (let i = 0; i < bkps.length; i++)
      t += `👥${i+1} ${shortAddr(bkps[i]!.publicKey.toBase58())}  ${(bals[i+1]!/LAMPORTS_PER_SOL).toFixed(4)} SOL\n`;

    const total = bals.reduce((s, b) => s + b, 0) / LAMPORTS_PER_SOL;
    t += `\n= ${total.toFixed(4)} SOL`;

    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, t, {
      reply_markup: new InlineKeyboard().text('🔄', 'menu_balances').text('Return', 'back_main')
    });
  } catch (e: any) {
    await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, `❌ ${e.message}`, {
      reply_markup: new InlineKeyboard().text('Return', 'back_main')
    });
  }
}
