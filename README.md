# Laint Pumpfun Bundler v2.0 (2026)

Launch tokens on [pump.fun](https://pump.fun) with bundled buyer wallets via Jito. All transactions land atomically in the same block — your token creation and all buyer purchases happen simultaneously, appearing as independent wallets on-chain.

**v2.0:** Full Telegram Bot UI — configure tokens, manage wallets, and launch bundles from your phone.

Working as of March 2026 with the latest pump.fun contracts, fee structure, and Jito bundle engine.

## Features

**Bundler**
- **Atomic Jito bundle** — Token creation + all buys land in one block
- **Up to 8 buyer wallets** — Auto-split across transactions to stay within Solana limits
- **TX1 simulation** — Validates locally before sending, catches errors before wasting your Jito tip
- **Live fee patching** — Reads pump.fun's fee recipient from chain, never breaks on updates
- **LUT caching** — Retries are instant, skips LUT creation on second attempt
- **Auto retry** — Mint address preserved between runs, same CA on retry
- **Multi-endpoint** — Sends to all 5 Jito block engines simultaneously

**Telegram Bot**
- **Live Dashboard** — Creator wallet balance, token summary, cost estimate with ✅/❌ indicator
- **New Wizard** — Step-by-step setup: token name, symbol, description, image, socials, buy amounts, tip — all in one guided flow with progress tracking
- **Token Config** — Edit name, symbol, description, image, socials individually
- **Bundle Config** — Edit creator buy, Jito tip, buyer count, individual buyer amounts with per-buyer buttons
- **Wallet Manager** — Generate, import, remove creator and buyer wallets with live SOL balances and monospace addresses (tap to copy)
- **Smart Launch** — ⚠️ Launch button shows exactly what's missing, 🚀 only activates when everything is set
- **Auto-reset** — Config resets after successful launch, last launched token shown on dashboard

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/LaintDev/pumpfun-bundler.git
cd pumpfun-bundler
npm install
```

### 2. Get a Helius RPC key

Go to [helius.dev](https://helius.dev), create a free account, and copy your RPC URL.

### 3. Set up `config/config.json`

You only need to fill in 3 things:

```json
{
  "bot": {
    "token": "YOUR_BOT_TOKEN_FROM_BOTFATHER",
    "ownerIds": ["YOUR_TELEGRAM_USER_ID"]
  },
  "rpc": {
    "helius": "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY"
  }
}
```

| What | Where to get it |
|---|---|
| `bot.token` | Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy token |
| `bot.ownerIds` | Message [@userinfobot](https://t.me/userinfobot) → copy your ID |
| `rpc.helius` | [helius.dev](https://helius.dev) → free account → copy RPC URL |

> Multiple users? `"ownerIds": ["123456789", "987654321"]`

### 4. Start the bot

```bash
npm run bot
```

Open Telegram → send `/start` to your bot → everything else is done through the UI.

**That's it.** Token details, wallets, buy amounts, Jito tip — all configured through the Telegram bot. No need to edit config files manually.

---

## Telegram Bot Guide

### Main Dashboard

Shows your creator wallet balance, current token config, cost estimate, and last launched token. Buttons:

| Button | What it does |
|---|---|
| **🚀 Launch** | Shows confirmation with full cost breakdown, then sends bundle |
| **⚠️ Launch** | Not ready — tap to see what's missing |
| **🆕 New** | Reset config and start fresh with the setup wizard |
| **📦 Token** | Edit token details: name, symbol, description, image, socials |
| **⚡ Bundle** | Edit buy amounts: creator $, Jito tip, buyer count, per-buyer amounts |
| **👛 Wallets** | Manage wallets: generate, import, remove — with live balances |
| **🔄 Refresh** | Reload dashboard with fresh balance data |

### New Token Wizard

Tap **🆕 New** to start. The wizard walks you through each field one at a time in a single message that updates in place:

1. Token name
2. Symbol
3. Description
4. Image URL (skip to keep current)
5. Social links (skip or set X, Telegram, Website individually)
6. Creator buy amount
7. Jito tip (preset buttons or custom)
8. Buyer wallet count
9. Buyer amounts (uniform or custom per buyer)

Each step saves immediately — cancel anytime with `/start` and your progress is kept. Required fields don't have a skip button, optional fields do.

### Wallet Manager

- **Generate** — creates a new keypair, shows public key + private key in monospace (tap to copy)
- **Import** — paste an existing private key
- **Remove** — select which wallet to remove (with confirmation for creator)
- All wallets show live SOL balances

### After Launch

When a bundle lands successfully:
- Config resets to defaults (image URL and RPC kept)
- Last launched token name + pump.fun link shown on dashboard
- Tap **🆕 New** to set up the next token

If a bundle doesn't land, tap **🔄 Retry** — uses the same mint address.

---

## CLI Usage (Alternative)

The Telegram bot is the recommended way to use the bundler, but the CLI still works:

```bash
# Edit config/config.json and config/wallets.json manually, then:
npm start

# Generate a new wallet keypair:
npm run generate-wallet
```

If the bundle doesn't land, run `npm start` again — the mint is cached. Delete `.mint-cache.json` for a new token address.

---

## How It Works

The bundler sends a Jito bundle containing up to 3 transactions:

| Transaction | Contents | When |
|---|---|---|
| **TX1** | Create token + creator buy | Always |
| **TX2** | Buyer wallets 1-4 | If 1+ buyers |
| **TX3** | Buyer wallets 5-8 + Jito tip | If 5+ buyers |

All transactions land atomically — either all succeed or none do.

---

## Config Reference

| Field | Description | Example |
|---|---|---|
| `bot.token` | Telegram bot token | `"123:ABC..."` |
| `bot.ownerIds` | Telegram user IDs with access | `["123456789"]` |
| `rpc.helius` | Helius RPC URL | `"https://mainnet.helius-rpc.com/?api-key=..."` |
| `token.name` | Token name | `"My Token"` |
| `token.symbol` | Ticker | `"MTK"` |
| `token.description` | Description | `"My awesome token"` |
| `token.imageUrl` | Public image URL | `"https://..."` |
| `token.twitter` | X/Twitter link (optional) | `"https://x.com/..."` |
| `token.telegram` | Telegram link (optional) | `"https://t.me/..."` |
| `token.website` | Website (optional) | `"https://..."` |
| `jito.tipAmount` | Jito tip in SOL | `0.01` |
| `buy.walletCount` | Buyer wallets (0-8) | `4` |
| `buy.creatorAmount` | Creator buy in SOL | `1.0` |
| `buy.amountPerWallet` | SOL per buyer | `[0.5, 0.5, 0.5, 0.5]` |
| `mode` | Network | `"mainnet"` or `"devnet"` |

> When using the Telegram bot, you only need to set `bot.token`, `bot.ownerIds`, and `rpc.helius` manually. Everything else is configured through the bot UI.

---

## Tips

- **Jito tip:** 0.01 SOL usually lands. During congestion, try 0.03-0.05 SOL
- **Varied buy amounts:** Use slightly different amounts per wallet (0.48, 0.52, 0.50) — looks more natural on-chain
- **Image:** Use a reliable host. If the URL goes down, your token shows no image on pump.fun

---

## Project Structure

```
pumpfun-bundler/
  config/
    config.json          — All settings: bot, token, RPC, buy amounts
    wallets.json         — Creator + buyer private keys
  src/
    main.ts              — CLI entry point
    config.ts            — Config loader
    wallets.ts           — Wallet loading + balance checks
    pumpfun.ts           — Pump.fun instruction builder
    jito.ts              — Jito bundle sender + simulation
    lut.ts               — Address Lookup Table caching
    metadata.ts          — IPFS metadata upload
    bot/
      index.ts           — Bot setup + routing
      helpers.ts         — Config I/O, launch checks
      menu.ts            — Dashboard with live balances
      token-config.ts    — Token + bundle config, New wizard
      wallets-ui.ts      — Wallet management UI
      launcher.ts        — Bundle execution + progress
      balances.ts        — Balance display
      types.ts           — TypeScript types
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| BigInt Failed To Load Bindings | Normal warning, ignore it |
| Bundle didn't land | Jito congested — retry or increase tip |
| TX1 simulation failed | Check SOL balance, wallet keys, RPC |
| LUT did not activate | Delete `.lut-cache.json`, retry |
| Set bot.token in config | Add your BotFather token to `config/config.json` |

---

## Contact

Built by **Laint**

- **𝕏:** [@LaintDev](https://x.com/LaintDev)
- **GitHub Issues:** Open an issue on this repo

---

*This tool is provided for educational and research purposes. Use at your own risk.*
