import { Bot, session, InlineKeyboard } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';

import { BotContext, SessionData } from './types';
import { isOwner, loadConfig, isReadyToLaunch, getBotToken } from './helpers';
import { sendMainMenu, editMainMenu } from './menu';
import { showTokenConfig, showBundleConfig, setupTokenConvo, editNameConvo, editSymbolConvo, editDescConvo, editImageConvo, editSocialsConvo, editBuyersConvo, editCreatorSolConvo, editTipConvo, editBuyer0Convo, editBuyer1Convo, editBuyer2Convo, editBuyer3Convo, editBuyer4Convo, editBuyer5Convo, editBuyer6Convo, editBuyer7Convo } from './token-config';
import { showWallets, registerWalletCallbacks, impBuyerConvo, impCreatorConvo } from './wallets-ui';
import { runBundler } from './launcher';

const BOT_TOKEN = getBotToken();
if (!BOT_TOKEN || BOT_TOKEN.includes('INSERT')) { console.error('❌ Set bot.token in config/config.json!'); process.exit(1); }

const bot = new Bot<BotContext>(BOT_TOKEN);
bot.use(session({ initial: (): SessionData => ({}) }));
bot.use(conversations());
bot.use(async (ctx, next) => { if (!isOwner(ctx)) return void await ctx.reply('⛔ Private bot.'); await next(); });
bot.on('callback_query', async (ctx, next) => {
  try { await next(); } catch (e: any) { if (e?.error_code === 400 && e?.description?.includes('query is too old')) return; throw e; }
});

// Conversations
bot.use(createConversation(setupTokenConvo));
bot.use(createConversation(editNameConvo));
bot.use(createConversation(editSymbolConvo));
bot.use(createConversation(editDescConvo));
bot.use(createConversation(editImageConvo));
bot.use(createConversation(editSocialsConvo));
bot.use(createConversation(editBuyersConvo));
bot.use(createConversation(editCreatorSolConvo));
bot.use(createConversation(editTipConvo));
bot.use(createConversation(editBuyer0Convo));
bot.use(createConversation(editBuyer1Convo));
bot.use(createConversation(editBuyer2Convo));
bot.use(createConversation(editBuyer3Convo));
bot.use(createConversation(editBuyer4Convo));
bot.use(createConversation(editBuyer5Convo));
bot.use(createConversation(editBuyer6Convo));
bot.use(createConversation(editBuyer7Convo));
bot.use(createConversation(impBuyerConvo));
bot.use(createConversation(impCreatorConvo));
registerWalletCallbacks(bot);

// Commands
bot.command('start', async (ctx) => await sendMainMenu(ctx));
bot.command('help', async (ctx) => await sendMainMenu(ctx));
bot.command('cancel', async (ctx) => { await ctx.conversation.exitAll(); await ctx.reply('✅ Cancelled.'); await sendMainMenu(ctx); });

// Navigation
bot.callbackQuery('back_main', async (ctx) => { await ctx.answerCallbackQuery(); await editMainMenu(ctx, ctx.chat!.id, ctx.callbackQuery.message!.message_id); });
bot.callbackQuery('menu_new', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('setupTokenConvo'); });
bot.callbackQuery('menu_token', async (ctx) => { await ctx.answerCallbackQuery(); await showTokenConfig(ctx, { chatId: ctx.chat!.id, msgId: ctx.callbackQuery.message!.message_id }); });
bot.callbackQuery('menu_bundle', async (ctx) => { await ctx.answerCallbackQuery(); await showBundleConfig(ctx, { chatId: ctx.chat!.id, msgId: ctx.callbackQuery.message!.message_id }); });
bot.callbackQuery('menu_wallets', async (ctx) => { await ctx.answerCallbackQuery(); await showWallets(ctx, { chatId: ctx.chat!.id, msgId: ctx.callbackQuery.message!.message_id }); });
bot.callbackQuery('menu_refresh', async (ctx) => {
  await ctx.answerCallbackQuery('Refreshing...');
  // Send new message with fresh balance (sendMainMenu fetches live data)
  try { await ctx.api.deleteMessage(ctx.chat!.id, ctx.callbackQuery.message!.message_id); } catch {}
  await sendMainMenu(ctx);
});

bot.callbackQuery('w_refresh', async (ctx) => {
  await ctx.answerCallbackQuery('Refreshing...');
  await showWallets(ctx, { chatId: ctx.chat!.id, msgId: ctx.callbackQuery.message!.message_id });
});

// Launch
bot.callbackQuery('menu_launch_disabled', async (ctx) => {
  const { missing } = isReadyToLaunch();
  await ctx.answerCallbackQuery({ text: `⚠️ ${missing.join(', ')}`, show_alert: true });
});

bot.callbackQuery('menu_launch', async (ctx) => {
  await ctx.answerCallbackQuery();
  const { ready, missing } = isReadyToLaunch();
  if (!ready) return void await ctx.reply(`❌ Missing: ${missing.join(', ')}`);
  const c = loadConfig();
  const ataCount = 1 + (c.buy?.walletCount || 0);
  const fees = 0.01 + (ataCount * 0.002) + 0.004;
  const amounts = c.buy?.amountPerWallet || [];
  const total = (c.buy?.creatorAmount || 0) + amounts.reduce((s: number, a: number) => s + a, 0) + (c.jito?.tipAmount || 0) + fees;
  let t = `🚀 ${c.token.name} ($${c.token.symbol})\n\n`;
  t += `💰 Creator: ${c.buy.creatorAmount} SOL\n`;
  for (let i = 0; i < (c.buy.walletCount || 0); i++) t += `👥 Buyer ${i + 1}: ${amounts[i] ?? 0} SOL\n`;
  t += `⚡ Tip: ${c.jito.tipAmount} SOL\n`;
  t += `\n📋 Total: ~${total.toFixed(4)} SOL`;
  await ctx.reply(t, {
    reply_markup: new InlineKeyboard().text('✅ Confirm', 'do_launch').text('Return', 'back_main')
  });
});

bot.callbackQuery('do_launch', async (ctx) => {
  await ctx.answerCallbackQuery('Launching...');
  const c = loadConfig();
  if (!c) return void await ctx.reply('❌ No config.');
  await runBundler(ctx, { token: c.token, buy: c.buy, jito: c.jito }, true);
});

bot.callbackQuery('menu_relaunch', async (ctx) => {
  await ctx.answerCallbackQuery();
  const c = loadConfig();
  if (!c?.token?.name) return void await ctx.reply('❌ No config.');
  await ctx.reply(`🔄 ${c.token.name} ($${c.token.symbol})\nSame mint`, {
    reply_markup: new InlineKeyboard().text('✅ Retry', 'do_relaunch').text('Return', 'back_main')
  });
});

bot.callbackQuery('do_relaunch', async (ctx) => {
  await ctx.answerCallbackQuery('Retrying...');
  const c = loadConfig();
  if (!c) return void await ctx.reply('❌ No config.');
  await runBundler(ctx, { token: c.token, buy: c.buy, jito: c.jito }, false);
});

// Token edits
bot.callbackQuery('edit_name', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editNameConvo'); });
bot.callbackQuery('edit_symbol', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editSymbolConvo'); });
bot.callbackQuery('edit_desc', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editDescConvo'); });
bot.callbackQuery('edit_image', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editImageConvo'); });
bot.callbackQuery('edit_socials', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editSocialsConvo'); });

// Bundle edits
bot.callbackQuery('edit_buyers', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyersConvo'); });
bot.callbackQuery('edit_creator_sol', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editCreatorSolConvo'); });
bot.callbackQuery('edit_tip', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editTipConvo'); });

// Individual buyer amount edits
bot.callbackQuery('edit_buyer_0', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer0Convo'); });
bot.callbackQuery('edit_buyer_1', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer1Convo'); });
bot.callbackQuery('edit_buyer_2', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer2Convo'); });
bot.callbackQuery('edit_buyer_3', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer3Convo'); });
bot.callbackQuery('edit_buyer_4', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer4Convo'); });
bot.callbackQuery('edit_buyer_5', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer5Convo'); });
bot.callbackQuery('edit_buyer_6', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer6Convo'); });
bot.callbackQuery('edit_buyer_7', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('editBuyer7Convo'); });

// Wallet imports
bot.callbackQuery('w_imp_b', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('impBuyerConvo'); });
bot.callbackQuery('w_imp_c', async (ctx) => { await ctx.answerCallbackQuery(); await ctx.conversation.enter('impCreatorConvo'); });

bot.catch((err) => console.error('Bot error:', err));
console.log('\n  🤖 Laint Bundler Bot starting...');
bot.start({ onStart: () => console.log('  ✅ Bot is running! Send /start in Telegram.\n') });
