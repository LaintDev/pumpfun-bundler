import { Context, InlineKeyboard } from 'grammy';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadWallets, loadConfig, isReadyToLaunch, hasAnyTokenData, validKey, getConnection } from './helpers';
import { launchState } from './launcher';

function buildMenuKb(): InlineKeyboard {
  const { ready } = isReadyToLaunch();
  const kb = new InlineKeyboard();
  if (ready) { kb.text('🚀 Launch', 'menu_launch'); } else { kb.text('⚠️ Launch', 'menu_launch_disabled'); }
  kb.text('🆕 New', 'menu_new').row();
  kb.text('📦 Token', 'menu_token').text('⚡ Bundle', 'menu_bundle').row();
  kb.text('👛 Wallets', 'menu_wallets').text('🔄 Refresh', 'menu_refresh').row();
  return kb;
}

function buildMenuText(c: any, w: any, creatorBal: string): string {
  const ckp = validKey(w?.creatorWallet || '');
  const buyers = (w?.buyerWallets || []).filter((k: string) => validKey(k));
  const { ready, missing } = isReadyToLaunch();
  const hasData = hasAnyTokenData();

  let t = '';

  // Creator balance
  if (ckp) { t += `💰 Creator — ${creatorBal} SOL\n`; }
  else { t += `💰 No creator wallet\n`; }

  // Token info + bundle details
  if (hasData && c) {
    t += `\n📦 ${c.token.name || '—'} (${c.token.symbol || '—'})\n`;
    t += `⚡ Tip: ${c.jito?.tipAmount ?? 0.002} SOL\n`;
    t += `💰 Creator buy: ${c.buy?.creatorAmount || 0} SOL\n`;
    const walletCount = c.buy?.walletCount || 0;
    const amounts = c.buy?.amountPerWallet || [];
    if (walletCount > 0) {
      for (let i = 0; i < walletCount; i++) {
        t += `👥 Buyer ${i + 1}: ${amounts[i] ?? 0} SOL\n`;
      }
    }

    const ataCount = 1 + walletCount;
    const fees = 0.01 + (ataCount * 0.002) + 0.004;
    const total = (c.buy?.creatorAmount || 0) + amounts.reduce((s: number, a: number) => s + a, 0) + (c.jito?.tipAmount || 0) + fees;
    t += `\n📋 Cost: ~${total.toFixed(4)} SOL`;
    if (creatorBal && creatorBal !== '?' && creatorBal !== '') {
      const balNum = parseFloat(creatorBal);
      t += balNum >= total ? ` ✅` : ` ❌ need ${(total - balNum).toFixed(4)} more`;
    }
    t += `\n`;
  } else {
    t += `⚡ Tip: ${c?.jito?.tipAmount ?? 0.002} SOL\n`;
  }

  if (!ready && missing.length > 0 && hasData) {
    t += `\n⚠️ ${missing.join(', ')}\n`;
  }

  if (launchState.isLaunching) t += `\n⏳ Launching...\n`;

  return t;
}

export async function sendMainMenu(ctx: Context) {
  const w = loadWallets();
  const c = loadConfig();
  const ckp = validKey(w?.creatorWallet || '');

  let creatorBal = '';
  if (ckp) {
    try { creatorBal = (await getConnection().getBalance(ckp.publicKey) / LAMPORTS_PER_SOL).toFixed(4); }
    catch { creatorBal = '?'; }
  }

  await ctx.reply(buildMenuText(c, w, creatorBal), { reply_markup: buildMenuKb(), link_preview_options: { is_disabled: true } });
}

export function mainMenuKb(): InlineKeyboard { return buildMenuKb(); }

export async function editMainMenu(ctx: Context, chatId: number, msgId: number) {
  const w = loadWallets();
  const c = loadConfig();
  try { await ctx.api.editMessageText(chatId, msgId, buildMenuText(c, w, ''), { reply_markup: buildMenuKb(), link_preview_options: { is_disabled: true } }); }
  catch { await sendMainMenu(ctx); }
}
