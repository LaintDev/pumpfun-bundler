# Laint Pumpfun Bundler v1.0 (2026)

Launch tokens on [pump.fun](https://pump.fun) with bundled buyer wallets via Jito. All transactions land atomically in the same block — your buyers appear as independent wallets on-chain.

Working as of 2026 with latest pump.fun contracts and Jito bundle engine.

## Features

- **Atomic bundle** — Token creation + all buys land in one block via Jito
- **Up to 8 buyer wallets** — Automatically split across TX2 (4 buyers) and TX3 (4 buyers)
- **Creator-only mode** — Set 0 buyers for a clean creator launch
- **TX1 simulation** — Validates your transaction before sending (saves your Jito tip on errors)
- **LUT caching** — Address Lookup Table is cached between runs for faster retries
- **Auto retry** — If bundle doesn't land, run again — mint address is preserved
- **Live fee patching** — Reads pump.fun's fee recipient on-chain (never stale)
- **Multi-endpoint** — Sends to all 5 Jito block engines simultaneously

## How It Works

The bundler sends a Jito bundle with up to 3 transactions:

| Transaction | Contents |
|---|---|
| **TX1** | Create token + creator buy |
| **TX2** | Buyer wallets 1-4 |
| **TX3** | Buyer wallets 5-8 + Jito tip |

If you have 4 or fewer buyers, only TX1 + TX2 are sent. If zero buyers, only TX1 is sent.

## Requirements

- [Node.js](https://nodejs.org) v18+
- A [Helius](https://helius.dev) RPC endpoint (free tier works)
- SOL in all wallets for buys + fees

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure your token** — Edit `config/config.json`:

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
  "rpc": {
    "helius": "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY",
    "devnet": "https://api.devnet.solana.com"
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

**3. Add your wallets** — Edit `config/wallets.json`:

```json
{
  "creatorWallet": "YOUR_CREATOR_PRIVATE_KEY_BASE58",
  "buyerWallets": [
    "BUYER_1_PRIVATE_KEY",
    "BUYER_2_PRIVATE_KEY",
    "BUYER_3_PRIVATE_KEY",
    "BUYER_4_PRIVATE_KEY"
  ]
}
```

**4. Fund your wallets** with enough SOL to cover buy amounts + fees (~0.02 SOL extra per wallet)

## Launch

```bash
npm start
```

If the bundle doesn't land (Jito congestion), just run `npm start` again — it reuses the same mint address.

## Generate New Wallets

```bash
npm run generate-wallet
```

Prints a fresh keypair to the console. Save the private key.

## Config Reference

| Field | Description | Example |
|---|---|---|
| `token.name` | Token name displayed on pump.fun | `"My Token"` |
| `token.symbol` | Token ticker | `"MTK"` |
| `token.description` | Token description | `"My awesome token"` |
| `token.imageUrl` | Public image URL | `"https://..."` |
| `token.twitter` | Twitter link (optional) | `""` |
| `token.telegram` | Telegram link (optional) | `""` |
| `token.website` | Website link (optional) | `""` |
| `rpc.helius` | Helius mainnet RPC URL | `"https://mainnet.helius-rpc.com/?api-key=..."` |
| `jito.tipAmount` | Jito tip in SOL | `0.01` |
| `buy.walletCount` | Number of buyer wallets (0-8) | `4` |
| `buy.creatorAmount` | Creator buy in SOL | `1.0` |
| `buy.amountPerWallet` | SOL per buyer (array) | `[0.5, 0.5, 0.5, 0.5]` |
| `mode` | Network mode | `"mainnet"` or `"devnet"` |

## Tips

- **Jito tip**: 0.01 SOL works most of the time. Increase to 0.03-0.05 during high congestion.
- **Buyer amounts**: Use slightly different amounts per wallet (0.48, 0.52, 0.50, 0.53) to look more organic.
- **Retries**: The mint keypair is cached in `.mint-cache.json`. Delete this file to generate a fresh mint.
- **LUT cache**: Stored in `.lut-cache.json`. Auto-invalidates when wallets or mint change.

## Project Structure

```
config/
  config.json        — Token details, RPC, buy amounts
  wallets.json       — Creator + buyer private keys
src/
  main.ts            — Entry point, TX builder, launch flow
  config.ts          — Config loader + validation
  wallets.ts         — Wallet loading + balance checks
  pumpfun.ts         — Pump.fun instruction builder
  jito.ts            — Jito bundle sending + simulation
  lut.ts             — Address Lookup Table setup + caching
  metadata.ts        — Token metadata upload to IPFS
```

## Disclaimer

This tool is for educational purposes. Use at your own risk. Always verify transactions on devnet before mainnet.
