# Laint Pumpfun Bundler v2.0 (2026)

Launch tokens on [pump.fun](https://pump.fun) with bundled buyer wallets via Jito. All transactions land atomically in the same block — your token creation and all buyer purchases happen simultaneously, appearing as independent wallets on-chain.

**New in v2.0:** Full Telegram Bot UI — configure, manage wallets, and launch tokens from your phone. No more editing config files.

Working as of March 2026 with the latest pump.fun contracts, fee structure, and Jito bundle engine.

## Features

- **Telegram Bot Dashboard** — Manage everything from Telegram: token setup, wallet management, bundle config, one-tap launch
- **Atomic Jito bundle** — Token creation + all buys land in one block
- **Up to 8 buyer wallets** — Automatically split across transactions to stay within Solana limits
- **Creator-only mode** — Set 0 buyers for a clean creator launch
- **TX1 simulation** — Validates locally before sending, catches errors before wasting your Jito tip
- **Live fee patching** — Reads pump.fun's fee recipient from chain. Never breaks when pump.fun updates
- **LUT caching** — Retry is instant, skips LUT creation on second attempt
- **Auto retry** — Mint address preserved between runs, same CA on retry
- **Multi-endpoint** — Sends to all 5 Jito block engines simultaneously

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/LaintDev/pumpfun-bundler.git
cd pumpfun-bundler
npm install
```

### 2. Get a Helius RPC key

Go to [helius.dev](https://helius.dev), create a free account, and copy your RPC URL.

### 3. Configure `config/config.json`

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

### 4. Choose your interface

**Option A: Telegram Bot (recommended)**
```bash
npm run bot
```
Then open Telegram and send `/start` to your bot. Everything else is done through the UI.

**Option B: CLI**
Edit `config/config.json` and `config/wallets.json` manually, then:
```bash
npm start
```

---

## Telegram Bot

### Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → copy the token
2. Message [@userinfobot](https://t.me/userinfobot) → copy your user ID
3. Paste both into `config/config.json` under `bot.token` and `bot.ownerIds`
4. `npm run bot`
5. Send `/start` to your bot

> Multiple users? `"ownerIds": ["123456789", "987654321"]`

### What you can do

| Button | What it does |
|---|---|
| **🚀 Launch** | Confirm and send the Jito bundle |
| **🆕 New** | Step-by-step wizard to configure a new token |
| **📦 Token** | Edit name, symbol, description, image, socials |
| **⚡ Bundle** | Edit creator buy, Jito tip, buyer count, individual buyer amounts |
| **👛 Wallets** | Generate, import, remove wallets — shows live SOL balances |
| **🔄 Refresh** | Reload dashboard with fresh balance data |

- Launch button shows ⚠️ when config is incomplete — tap it to see what's missing
- Wizard saves progress after each step — cancel anytime with `/start`
- Config auto-resets after successful launch, ready for the next token

---

## CLI Usage

If you prefer the command line over Telegram:

### Configure your token

Edit `config/config.json`:

```json
{
  "token": {
    "name": "My Token",
    "symbol": "MTK",
    "description": "My awesome token",
    "imageUrl": "https://example.com/image.png",
    "twitter": "",
    "telegram": "",
    "website": ""
  },
  "jito": {
    "tipAmount": 0.01
  },
  "buy": {
    "walletCount": 4,
    "creatorAmount": 1.0,
    "amountPerWallet": [0.5, 0.5, 0.5, 0.5]
  },
  "mode": "mainnet"
}
```

### Add your wallets

Edit `config/wallets.json`:

```json
{
  "creatorWallet": "YOUR_CREATOR_PRIVATE_KEY_BASE58",
  "buyerWallets": [
    "BUYER_1_PRIVATE_KEY",
    "BUYER_2_PRIVATE_KEY"
  ]
}
```

### Launch

```bash
npm start
```

If the bundle doesn't land, run `npm start` again — the mint address is cached for retry.

To start fresh with a new mint, delete `.mint-cache.json`.

### Generate wallets

```bash
npm run generate-wallet
```

---

## How It Works

The bundler sends a Jito bundle containing up to 3 transactions:

| Transaction | Contents | When |
|---|---|---|
| **TX1** | Create token + creator buy | Always |
| **TX2** | Buyer wallets 1-4 | If 1+ buyers |
| **TX3** | Buyer wallets 5-8 + Jito tip | If 5+ buyers |

The Jito tip is attached to the last transaction. All transactions land atomically — either all succeed or none do.

---

## Requirements

- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **Helius RPC** — [helius.dev](https://helius.dev) (free tier works)
- **SOL** in wallets — buy amounts + ~0.02 SOL per wallet for fees

---

## Config Reference

| Field | Description | Example |
|---|---|---|
| `bot.token` | Telegram bot token from BotFather | `"123:ABC..."` |
| `bot.ownerIds` | Telegram user IDs with access | `["123456789"]` |
| `token.name` | Token name on pump.fun | `"My Token"` |
| `token.symbol` | Token ticker | `"MTK"` |
| `token.description` | Short description | `"My awesome token"` |
| `token.imageUrl` | Public URL to token image | `"https://..."` |
| `token.twitter` | Twitter/X link (optional) | `"https://x.com/..."` |
| `token.telegram` | Telegram link (optional) | `"https://t.me/..."` |
| `token.website` | Website link (optional) | `"https://..."` |
| `rpc.helius` | Your Helius RPC URL | `"https://mainnet.helius-rpc.com/?api-key=..."` |
| `jito.tipAmount` | Jito tip in SOL | `0.01` |
| `buy.walletCount` | Number of buyer wallets (0-8) | `4` |
| `buy.creatorAmount` | Creator buy in SOL | `1.0` |
| `buy.amountPerWallet` | SOL per buyer | `[0.5, 0.5, 0.5, 0.5]` |
| `mode` | Network | `"mainnet"` or `"devnet"` |

---

## Tips

- **Jito tip:** 0.01 SOL usually lands. During congestion, try 0.03-0.05 SOL
- **Varied buy amounts:** Use slightly different amounts per wallet (0.48, 0.52, 0.50) — looks more natural on-chain
- **Retry:** Mint is cached in `.mint-cache.json` — delete to get a new token address
- **LUT cache:** Stored in `.lut-cache.json` — delete if you get LUT errors

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
| Bundle failed on all endpoints | Jito congested — retry with `npm start` |
| TX1 simulation failed | Check SOL balance, wallet keys, RPC |
| LUT did not activate | Delete `.lut-cache.json`, retry |
| Bot: "Set bot.token in config" | Add your BotFather token to config.json |

---

## Contact

Built by **Laint**

- **𝕏:** [@LaintDev](https://x.com/LaintDev)
- **GitHub Issues:** Open an issue on this repo

---

*This tool is provided for educational and research purposes. Use at your own risk.*
