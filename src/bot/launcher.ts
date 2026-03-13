import { Context, InlineKeyboard } from 'grammy';
import { exec } from 'child_process';
import * as path from 'path';
import { LaunchConfig } from './types';
import { BUNDLER_DIR, loadConfig, resetTokenConfig } from './helpers';

export const launchState = { isLaunching: false };

export async function runBundler(ctx: Context, lc: LaunchConfig, fresh: boolean) {
  if (launchState.isLaunching) return void await ctx.reply('⚠️ Already launching.');
  launchState.isLaunching = true;

  const cfg = loadConfig();
  if (!cfg) { launchState.isLaunching = false; return void await ctx.reply('❌ config.json missing.'); }

  if (fresh) {
    const fs = require('fs');
    for (const f of ['.mint-cache.json', '.lut-cache.json']) {
      const p = path.join(BUNDLER_DIR, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  const statusMsg = await ctx.reply(fresh ? '⏳ Starting bundler...' : '🔄 Retrying...');

  let lastStatus = '';
  const fs = require('fs');
  const progressInterval = setInterval(async () => {
    try {
      const mintCache = path.join(BUNDLER_DIR, '.mint-cache.json');
      const lutCache = path.join(BUNDLER_DIR, '.lut-cache.json');
      let newStatus = '';
      if (fs.existsSync(lutCache)) newStatus = '📡 Sending bundle...';
      else if (fs.existsSync(mintCache)) newStatus = '⏳ Building LUT...';
      else newStatus = '⏳ Uploading metadata...';
      if (newStatus !== lastStatus) { lastStatus = newStatus; await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, newStatus); }
    } catch {}
  }, 3000);

  return new Promise<void>((resolve) => {
    exec(`npx ts-node src/main.ts`, {
      cwd: BUNDLER_DIR,
      env: { ...process.env, FORCE_COLOR: '0' },
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }, async (error, stdout, stderr) => {
      clearInterval(progressInterval);
      launchState.isLaunching = false;

      const fullOutput = (stdout || '') + '\n' + (stderr || '');
      const mintMatch = fullOutput.match(/Mint:\s+(\w{32,})/);
      const mintAddress = mintMatch ? mintMatch[1]! : '';
      const landed = fullOutput.includes('Landed!');

      if (!error && landed && mintAddress) {
        // Reset config to defaults (keeps image + RPC)
        resetTokenConfig();
        try { await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, '🎉 Landed!'); } catch {}
        await ctx.reply(
          `🎉 ${lc.token.name} ($${lc.token.symbol})\n\n${mintAddress}\nhttps://pump.fun/${mintAddress}`,
          { reply_markup: new InlineKeyboard().text('🆕 New', 'menu_new').text('Return', 'back_main'), link_preview_options: { is_disabled: true } }
        );
      } else {
        try { await ctx.api.editMessageText(ctx.chat!.id, statusMsg.message_id, '❌ Failed'); } catch {}
        // Try to find specific error lines first
        const errs = fullOutput.split('\n')
          .filter(l => l.includes('Error') || l.includes('failed') || l.includes('insufficient') || l.includes('❌') || l.includes('error') || l.includes('reject') || l.includes('timeout'))
          .map(l => l.replace(/[\x00-\x1F\x7F]/g, '').trim())
          .filter(l => l.length > 0)
          .slice(-5);

        // Fallback: last 8 non-empty lines of output
        const lastLines = fullOutput.split('\n')
          .map(l => l.replace(/[\x00-\x1F\x7F]/g, '').trim())
          .filter(l => l.length > 0)
          .slice(-8);

        let msg = '❌ Launch failed\n\n';
        if (errs.length) msg += errs.join('\n').slice(0, 500) + '\n\n';
        else if (error) msg += error.message.slice(0, 300) + '\n\n';
        else if (lastLines.length) msg += lastLines.join('\n').slice(0, 500) + '\n\n';
        else msg += 'Unknown error\n\n';

        await ctx.reply(msg, { reply_markup: new InlineKeyboard().text('🔄 Retry', 'menu_relaunch').text('Return', 'back_main') });
      }
      resolve();
    });
  });
}
