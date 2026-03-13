import { Context, InlineKeyboard } from 'grammy';
import { BotContext, BotConversation } from './types';
import { loadConfig, saveConfig, loadWallets, validKey } from './helpers';
import { sendMainMenu } from './menu';

const EXIT = Symbol('exit');
const SKIP = Symbol('skip');

// ═══════════════════════════════════════════════════════════════════════════════
// WIZARD HELPERS — single message that updates in place
// ═══════════════════════════════════════════════════════════════════════════════

type Wiz = { chatId: number; msgId: number };

async function wizEdit(ctx: BotContext, wiz: Wiz, text: string, kb: InlineKeyboard) {
  try { await ctx.api.editMessageText(wiz.chatId, wiz.msgId, text, { reply_markup: kb }); }
  catch {
    const m = await ctx.reply(text, { reply_markup: kb });
    wiz.msgId = m.message_id;
  }
}

// Wait for text, with optional Skip if currentVal exists
async function wizText(conv: BotConversation, ctx: BotContext, wiz: Wiz, text: string, currentVal?: string): Promise<string> {
  const kb = new InlineKeyboard();
  if (currentVal) kb.text('▶️ Skip', 'wiz_skip');
  kb.text('❌ Cancel', 'wiz_cancel');
  await wizEdit(ctx, wiz, text, kb);
  const r = await conv.wait();
  if (r.callbackQuery?.data === 'wiz_cancel') { await r.answerCallbackQuery(); throw EXIT; }
  if (r.callbackQuery?.data === 'wiz_skip') { await r.answerCallbackQuery(); throw SKIP; }
  if (r.message?.text) {
    const t = r.message.text.trim();
    if (t === '/cancel' || t === '/start') throw EXIT;
    try { await ctx.api.deleteMessage(wiz.chatId, r.message.message_id); } catch {}
    return t;
  }
  throw EXIT;
}

// Wait for callback, with optional Skip
async function wizCb(conv: BotConversation, ctx: BotContext, wiz: Wiz, text: string, buttons: InlineKeyboard, canSkip?: boolean): Promise<string> {
  if (canSkip) buttons.text('▶️ Skip', 'wiz_skip');
  buttons.text('❌ Cancel', 'wiz_cancel');
  await wizEdit(ctx, wiz, text, buttons);
  const r = await conv.wait();
  if (r.callbackQuery?.data === 'wiz_cancel') { await r.answerCallbackQuery(); throw EXIT; }
  if (r.callbackQuery?.data === 'wiz_skip') { await r.answerCallbackQuery(); throw SKIP; }
  if (r.callbackQuery?.data) { await r.answerCallbackQuery(); return r.callbackQuery.data; }
  if (r.message?.text === '/cancel' || r.message?.text === '/start') throw EXIT;
  throw EXIT;
}

// Wait for text or callback (image step)
async function wizTextOrCb(conv: BotConversation, ctx: BotContext, wiz: Wiz, text: string, buttons: InlineKeyboard): Promise<{ type: 'cb' | 'text'; value: string }> {
  buttons.text('❌ Cancel', 'wiz_cancel');
  await wizEdit(ctx, wiz, text, buttons);
  const r = await conv.wait();
  if (r.callbackQuery?.data === 'wiz_cancel') { await r.answerCallbackQuery(); throw EXIT; }
  if (r.callbackQuery?.data) { await r.answerCallbackQuery(); return { type: 'cb', value: r.callbackQuery.data }; }
  if (r.message?.text) {
    const t = r.message.text.trim();
    if (t === '/cancel' || t === '/start') throw EXIT;
    try { await ctx.api.deleteMessage(wiz.chatId, r.message.message_id); } catch {}
    return { type: 'text', value: t };
  }
  throw EXIT;
}

// Build progress header
function progress(c: any, step: number, total: number): string {
  let t = '';
  if (c.token?.name) t += `📦 ${c.token.name}`;
  if (c.token?.symbol) t += ` (${c.token.symbol})`;
  if (c.token?.name || c.token?.symbol) t += '\n';
  if (c.token?.description) t += `📝 ${c.token.description}\n`;
  if (c.buy?.creatorAmount > 0) t += `💰 ${c.buy.creatorAmount} SOL\n`;
  if ((c.buy?.walletCount || 0) > 0) {
    const a = c.buy.amountPerWallet || [];
    t += `👥 ${c.buy.walletCount}x [${a.join(', ') || '...'}]\n`;
  }
  if (t) t += '\n';
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export function tokenConfigText(): string {
  const c = loadConfig();
  if (!c) return '❌ config.json missing';
  const w = (v: any) => v ? '' : '⚠️ ';
  let t = `${w(c.token?.name)}Name: ${c.token?.name || '—'}\n`;
  t += `${w(c.token?.symbol)}Symbol: ${c.token?.symbol || '—'}\n`;
  t += `${w(c.token?.description)}Desc: ${c.token?.description || '—'}\n`;
  t += `${w(c.token?.imageUrl)}Image: ${c.token?.imageUrl ? (c.token.imageUrl.length > 25 ? c.token.imageUrl.slice(0, 25) + '...' : c.token.imageUrl) : '—'}\n`;
  if (c.token?.twitter || c.token?.telegram || c.token?.website) {
    const soc = [c.token.twitter ? '𝕏' : '', c.token.telegram ? 'TG' : '', c.token.website ? '🌐' : ''].filter(Boolean).join(' ');
    t += `🔗 ${soc}\n`;
  }
  return t;
}

export function tokenConfigKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Name', 'edit_name').text('Symbol', 'edit_symbol').text('Desc', 'edit_desc').row()
    .text('Image', 'edit_image').text('Socials', 'edit_socials').row()
    .text('Return', 'back_main');
}

export async function showTokenConfig(ctx: Context, edit?: { chatId: number; msgId: number }) {
  const t = tokenConfigText(), kb = tokenConfigKb();
  if (edit) { try { await ctx.api.editMessageText(edit.chatId, edit.msgId, t, { reply_markup: kb }); return; } catch {} }
  await ctx.reply(t, { reply_markup: kb });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export function bundleConfigText(): string {
  const c = loadConfig();
  if (!c) return '❌ config.json missing';
  const w = loadWallets();
  const hasCreator = w && validKey(w.creatorWallet || '');
  const wn = (v: any) => v ? '' : '⚠️ ';
  let t = `${wn(hasCreator)}Creator wallet${hasCreator ? '' : ' —'}\n`;
  t += `💰 Creator buy: ${c.buy?.creatorAmount ?? 0} SOL\n`;
  const wc = c.buy?.walletCount || 0;
  const amounts = c.buy?.amountPerWallet || [];
  for (let i = 0; i < wc; i++) t += `👥 Buyer ${i + 1}: ${amounts[i] ?? 0} SOL\n`;
  t += `⚡ Jito Tip: ${c.jito?.tipAmount ?? 0.002} SOL\n`;
  const ataCount = 1 + wc;
  const fees = 0.01 + (ataCount * 0.002) + 0.004;
  const total = (c.buy?.creatorAmount || 0) + amounts.reduce((s: number, a: number) => s + a, 0) + (c.jito?.tipAmount || 0) + fees;
  t += `\n📋 Cost: ~${total.toFixed(4)} SOL`;
  return t;
}

export function bundleConfigKb(): InlineKeyboard {
  const c = loadConfig();
  const wc = c?.buy?.walletCount || 0;
  const kb = new InlineKeyboard();
  kb.text('Jito Tip', 'edit_tip').text('Buyers', 'edit_buyers').row();
  kb.text('Creator $', 'edit_creator_sol');
  if (wc > 0) kb.text('Buyer 1 $', 'edit_buyer_0');
  kb.row();
  for (let i = 1; i < wc; i += 2) {
    kb.text(`Buyer ${i + 1} $`, `edit_buyer_${i}`);
    if (i + 1 < wc) kb.text(`Buyer ${i + 2} $`, `edit_buyer_${i + 1}`);
    kb.row();
  }
  kb.text('Return', 'back_main');
  return kb;
}

export async function showBundleConfig(ctx: Context, edit?: { chatId: number; msgId: number }) {
  const t = bundleConfigText(), kb = bundleConfigKb();
  if (edit) { try { await ctx.api.editMessageText(edit.chatId, edit.msgId, t, { reply_markup: kb }); return; } catch {} }
  await ctx.reply(t, { reply_markup: kb });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOCIALS
// ═══════════════════════════════════════════════════════════════════════════════

async function collectSocials(conversation: BotConversation, ctx: BotContext, current: { twitter: string; telegram: string; website: string }, wiz?: Wiz) {
  let twitter = current.twitter, telegram = current.telegram, website = current.website;
  let socMsgId = 0;
  const show = async () => {
    const t = `𝕏: ${twitter || '—'}\nTG: ${telegram || '—'}\n🌐: ${website || '—'}`;
    const kb = new InlineKeyboard()
      .text(twitter ? '𝕏 ✏️' : '𝕏 +', 'soc_x').text(telegram ? 'TG ✏️' : 'TG +', 'soc_tg').text(website ? '🌐 ✏️' : '🌐 +', 'soc_web').row()
      .text('✅ Done', 'soc_done').text('🗑️ Clear', 'soc_clear');
    if (socMsgId) {
      try { await ctx.api.editMessageText(ctx.chat!.id, socMsgId, t, { reply_markup: kb }); return; } catch {}
    }
    const m = await ctx.reply(t, { reply_markup: kb });
    socMsgId = m.message_id;
  };
  await show();
  while (true) {
    const r = await conversation.wait();
    if (r.callbackQuery?.data === 'soc_done') { await r.answerCallbackQuery(); break; }
    if (r.callbackQuery?.data === 'soc_clear') { twitter = ''; telegram = ''; website = ''; await r.answerCallbackQuery('Cleared'); await show(); continue; }
    if (r.callbackQuery?.data === 'soc_x') {
      await r.answerCallbackQuery();
      try { await ctx.api.editMessageText(ctx.chat!.id, socMsgId, '𝕏 link?'); } catch {}
      const msg = await conversation.waitFor('message:text');
      twitter = msg.message.text.trim();
      try { await ctx.api.deleteMessage(ctx.chat!.id, msg.message.message_id); } catch {}
      await show();
    } else if (r.callbackQuery?.data === 'soc_tg') {
      await r.answerCallbackQuery();
      try { await ctx.api.editMessageText(ctx.chat!.id, socMsgId, 'Telegram link?'); } catch {}
      const msg = await conversation.waitFor('message:text');
      telegram = msg.message.text.trim();
      try { await ctx.api.deleteMessage(ctx.chat!.id, msg.message.message_id); } catch {}
      await show();
    } else if (r.callbackQuery?.data === 'soc_web') {
      await r.answerCallbackQuery();
      try { await ctx.api.editMessageText(ctx.chat!.id, socMsgId, 'Website?'); } catch {}
      const msg = await conversation.waitFor('message:text');
      website = msg.message.text.trim();
      try { await ctx.api.deleteMessage(ctx.chat!.id, msg.message.message_id); } catch {}
      await show();
    } else if (r.message?.text === '/cancel' || r.message?.text === '/start') {
      try { await ctx.api.deleteMessage(ctx.chat!.id, socMsgId); } catch {}
      throw EXIT;
    }
  }
  // Clean up socials message and update wizard msgId so next step can continue
  try { await ctx.api.deleteMessage(ctx.chat!.id, socMsgId); } catch {}
  if (wiz) {
    const m = await ctx.reply('...');
    wiz.msgId = m.message_id;
  }
  return { twitter, telegram, website };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW WIZARD — single message, progress bar, skip for existing values
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupTokenConvo(conversation: BotConversation, ctx: BotContext) {
  let c = loadConfig();
  if (!c) return void await ctx.reply('❌ config.json missing');

  const imageUrl = c.token?.imageUrl || '';
  c.token = { name: '', symbol: '', description: '', imageUrl, twitter: '', telegram: '', website: '' };
  c.buy = { walletCount: 0, creatorAmount: 0, amountPerWallet: [] };
  c.jito = { tipAmount: 0.002 };
  saveConfig(c);

  const w = loadWallets();
  const maxB = (w?.buyerWallets || []).filter((k: string) => validKey(k)).length;
  const total = maxB > 0 ? 9 : 7;

  const initMsg = await ctx.reply('🆕 Setting up...');
  const wiz: Wiz = { chatId: ctx.chat!.id, msgId: initMsg.message_id };

  try {
    // 1. Name (required — no skip)
    c.token.name = await wizText(conversation, ctx, wiz,
      `${progress(c, 1, total)}Token name (1/${total})`);
    saveConfig(c);

    // 2. Symbol (required — no skip)
    c.token.symbol = (await wizText(conversation, ctx, wiz,
      `${progress(c, 2, total)}Symbol (2/${total})`)).toUpperCase();
    saveConfig(c);

    // 3. Description (required — no skip)
    c.token.description = await wizText(conversation, ctx, wiz,
      `${progress(c, 3, total)}Description (3/${total})`);
    saveConfig(c);

    // 4. Image (has default → skip available)
    try {
      const imgR = await wizTextOrCb(conversation, ctx, wiz,
        `${progress(c, 4, total)}Image URL (4/${total})\nCurrent: ${c.token.imageUrl ? c.token.imageUrl.slice(0, 30) + '...' : '—'}`,
        new InlineKeyboard().text('▶️ Skip', 'img_skip'));
      if (imgR.type === 'text') { c.token.imageUrl = imgR.value; saveConfig(c); }
    } catch (e) { if (e !== SKIP) throw e; }

    // 5. Socials (optional → always skippable)
    try {
      const socD = await wizCb(conversation, ctx, wiz,
        `${progress(c, 5, total)}Social links (5/${total})`,
        new InlineKeyboard().text('🔗 Set socials', 'soc_start'), true);
      if (socD === 'soc_start') {
        // Delete wizard message before socials sub-flow
        try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {}
        const r = await collectSocials(conversation, ctx, { twitter: '', telegram: '', website: '' }, wiz);
        c.token.twitter = r.twitter; c.token.telegram = r.telegram; c.token.website = r.website;
        saveConfig(c);
      }
    } catch (e) { if (e !== SKIP) throw e; }

    let step = 6;

    // 6. Creator amount (required)
    const caText = await wizText(conversation, ctx, wiz,
      `${progress(c, step, total)}Creator amount (${step}/${total})`);
    const ca = parseFloat(caText);
    if (isNaN(ca) || ca < 0) { try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {} return void await ctx.reply('❌ Invalid'); }
    c.buy.creatorAmount = ca;
    saveConfig(c);
    step++;

    // 7. Jito tip
    const tipD = await wizCb(conversation, ctx, wiz,
      `${progress(c, step, total)}Jito tip (${step}/${total})\nCurrent: ${c.jito.tipAmount} SOL`,
      new InlineKeyboard().text('0.002', 'st_0.002').text('0.005', 'st_0.005').text('0.01', 'st_0.01').text('Custom', 'st_custom'), false);
    if (tipD === 'st_custom') {
      const tipText = await wizText(conversation, ctx, wiz, 'Tip (SOL):');
      const tip = parseFloat(tipText);
      if (isNaN(tip) || tip <= 0) { try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {} return void await ctx.reply('❌ Invalid'); }
      c.jito.tipAmount = tip;
    } else {
      c.jito.tipAmount = parseFloat(tipD.replace('st_', ''));
    }
    saveConfig(c);
    step++;

    // 8. Buyers (if wallets available)
    if (maxB > 0) {
      try {
        const kb = new InlineKeyboard();
        for (let i = 0; i <= Math.min(maxB, 8); i++) { kb.text(String(i), `sb_${i}`); if (i === 4) kb.row(); }
        const bD = await wizCb(conversation, ctx, wiz,
          `${progress(c, step, total)}Buyer wallets (${step}/${total}) — ${maxB} available`, kb, false);
        c.buy.walletCount = parseInt(bD.split('_')[1]!);
        if (c.buy.walletCount > 0) c.buy.amountPerWallet = Array(c.buy.walletCount).fill(0.001);
        saveConfig(c);
      } catch (e) { if (e !== SKIP) throw e; }
      step++;
    }

    // 9. Buyer amounts
    if (c.buy.walletCount > 0) {
      const aIn = await wizText(conversation, ctx, wiz,
        `${progress(c, step, total)}Buyer amounts (${step}/${total}) — ${c.buy.walletCount}x\n0.1 = all buy 0.1 SOL\n0.1, 0.2 = custom per buyer`);
      if (aIn.includes(',')) {
        const arr = aIn.split(',').map(s => parseFloat(s.trim()));
        if (arr.length !== c.buy.walletCount || arr.some(isNaN)) { try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {} return void await ctx.reply('❌ Invalid'); }
        c.buy.amountPerWallet = arr;
      } else {
        const u = parseFloat(aIn);
        if (isNaN(u) || u <= 0) { try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {} return void await ctx.reply('❌ Invalid'); }
        c.buy.amountPerWallet = Array(c.buy.walletCount).fill(u);
      }
      saveConfig(c);
    }

    try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {}
    await ctx.reply('✅ Ready!');
    await sendMainMenu(ctx);

  } catch (e) {
    if (e === EXIT) {
      try { await ctx.api.deleteMessage(wiz.chatId, wiz.msgId); } catch {}
      await ctx.reply('↩️ Progress saved.');
      await sendMainMenu(ctx);
      return;
    }
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT FIELDS
// ═══════════════════════════════════════════════════════════════════════════════

async function editTokenField(field: string, conversation: BotConversation, ctx: BotContext) {
  const c = loadConfig(); if (!c) return;
  switch (field) {
    case 'name': await ctx.reply(`Name: ${c.token?.name || '—'}\nNew?`); c.token.name = (await conversation.waitFor('message:text')).message.text.trim(); break;
    case 'symbol': await ctx.reply(`Symbol: ${c.token?.symbol || '—'}\nNew?`); c.token.symbol = (await conversation.waitFor('message:text')).message.text.trim().toUpperCase(); break;
    case 'desc': await ctx.reply(`Desc: ${c.token?.description || '—'}\nNew?`); c.token.description = (await conversation.waitFor('message:text')).message.text.trim(); break;
    case 'image': {
      const kb = new InlineKeyboard().text('⏭ Keep', 'ei_skip');
      await ctx.reply(`Image: ${c.token?.imageUrl || '—'}\nNew URL?`, { reply_markup: kb });
      const r = await conversation.wait();
      if (r.callbackQuery?.data === 'ei_skip') { await r.answerCallbackQuery(); }
      else if (r.message?.text) { const t = r.message.text.trim(); if (t !== '/cancel' && t !== '/start') c.token.imageUrl = t; }
      break;
    }
    case 'socials': { const r = await collectSocials(conversation, ctx, { twitter: c.token?.twitter || '', telegram: c.token?.telegram || '', website: c.token?.website || '' }); c.token.twitter = r.twitter; c.token.telegram = r.telegram; c.token.website = r.website; break; }
  }
  saveConfig(c); await showTokenConfig(ctx);
}

async function editBundleField(field: string, conversation: BotConversation, ctx: BotContext) {
  const c = loadConfig(); if (!c) return;
  switch (field) {
    case 'buyers': {
      const w = loadWallets(); const maxB = (w?.buyerWallets || []).filter((k: string) => validKey(k)).length;
      if (maxB === 0) return void await ctx.reply('❌ No wallets');
      const kb = new InlineKeyboard(); for (let i = 0; i <= Math.min(maxB, 8); i++) { kb.text(String(i), `eb_${i}`); if (i === 4) kb.row(); }
      await ctx.reply(`Now: ${c.buy?.walletCount || 0}/${maxB}`, { reply_markup: kb });
      const bCtx = await conversation.waitForCallbackQuery(/^eb_\d$/); const n = parseInt(bCtx.callbackQuery.data.split('_')[1]!); await bCtx.answerCallbackQuery(`${n}`);
      c.buy.walletCount = n;
      if (n > 0 && (c.buy.amountPerWallet || []).length !== n) c.buy.amountPerWallet = Array(n).fill(c.buy.amountPerWallet?.[0] || 0.5);
      else if (n === 0) c.buy.amountPerWallet = [];
      break;
    }
    case 'creator_sol': {
      await ctx.reply(`Now: ${c.buy?.creatorAmount ?? 0} SOL\nNew?`);
      const ca = parseFloat((await conversation.waitFor('message:text')).message.text.trim());
      if (isNaN(ca) || ca < 0) return void await ctx.reply('❌'); c.buy.creatorAmount = ca; break;
    }
    case 'tip': {
      const kb = new InlineKeyboard().text('0.002', 'et_0.002').text('0.005', 'et_0.005').text('0.01', 'et_0.01').text('Custom', 'et_custom');
      await ctx.reply(`Now: ${c.jito?.tipAmount ?? 0.002}`, { reply_markup: kb });
      const tCtx = await conversation.waitForCallbackQuery(/^et_/);
      if (tCtx.callbackQuery.data === 'et_custom') { await tCtx.answerCallbackQuery(); await ctx.reply('Tip (SOL):'); const t = parseFloat((await conversation.waitFor('message:text')).message.text.trim()); if (isNaN(t) || t <= 0) return void await ctx.reply('❌'); c.jito.tipAmount = t; }
      else { c.jito.tipAmount = parseFloat(tCtx.callbackQuery.data.replace('et_', '')); await tCtx.answerCallbackQuery(`${c.jito.tipAmount}`); }
      break;
    }
    default: {
      const match = field.match(/^buyer_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1]!);
        if (idx >= (c.buy?.walletCount || 0)) return void await ctx.reply('❌ Invalid buyer');
        await ctx.reply(`Buyer ${idx + 1}: ${(c.buy?.amountPerWallet || [])[idx] ?? 0} SOL\nNew amount?`);
        const val = parseFloat((await conversation.waitFor('message:text')).message.text.trim());
        if (isNaN(val) || val < 0) return void await ctx.reply('❌');
        if (!c.buy.amountPerWallet) c.buy.amountPerWallet = [];
        c.buy.amountPerWallet[idx] = val;
      }
      break;
    }
  }
  saveConfig(c); await showBundleConfig(ctx);
}

export async function editNameConvo(c: BotConversation, ctx: BotContext) { await editTokenField('name', c, ctx); }
export async function editSymbolConvo(c: BotConversation, ctx: BotContext) { await editTokenField('symbol', c, ctx); }
export async function editDescConvo(c: BotConversation, ctx: BotContext) { await editTokenField('desc', c, ctx); }
export async function editImageConvo(c: BotConversation, ctx: BotContext) { await editTokenField('image', c, ctx); }
export async function editSocialsConvo(c: BotConversation, ctx: BotContext) { await editTokenField('socials', c, ctx); }
export async function editBuyersConvo(c: BotConversation, ctx: BotContext) { await editBundleField('buyers', c, ctx); }
export async function editCreatorSolConvo(c: BotConversation, ctx: BotContext) { await editBundleField('creator_sol', c, ctx); }
export async function editTipConvo(c: BotConversation, ctx: BotContext) { await editBundleField('tip', c, ctx); }
export async function editBuyer0Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_0', c, ctx); }
export async function editBuyer1Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_1', c, ctx); }
export async function editBuyer2Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_2', c, ctx); }
export async function editBuyer3Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_3', c, ctx); }
export async function editBuyer4Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_4', c, ctx); }
export async function editBuyer5Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_5', c, ctx); }
export async function editBuyer6Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_6', c, ctx); }
export async function editBuyer7Convo(c: BotConversation, ctx: BotContext) { await editBundleField('buyer_7', c, ctx); }
