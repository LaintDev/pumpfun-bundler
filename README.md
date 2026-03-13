# Laint Pumpfun Bundler v1.0 (2026)

Launch tokens on [pump.fun](https://pump.fun) with bundled buyer wallets via Jito. All transactions land atomically in the same block — your token creation and all buyer purchases happen simultaneously, appearing as independent wallets on-chain.

Working as of March 2026 with the latest pump.fun contracts, fee structure, and Jito bundle engine.

## Features

- **Atomic Jito bundle** — Token creation + all buys land in one block. No one can buy between your transactions.
- **Up to 8 buyer wallets** — Automatically split across 2 transactions (4 buyers each) to stay within Solana's transaction size limits.
- **Creator-only mode** — Set 0 buyers for a clean creator launch with no bundled buys.
- **TX1 simulation** — Validates your transaction locally before sending the bundle. If something is wrong (bad accounts, insufficient SOL), it catches the error instantly instead of wasting your Jito tip.
- **Live fee patching** — Reads pump.fun's fee recipient directly from the blockchain. Other bundlers hardcode this and break when pump.fun updates it.
- **LUT caching** — The Address Lookup Table is cached between runs. If a bundle doesn't land, your retry is faster because it skips LUT creation.
- **Auto retry** — If a bundle doesn't land (Jito congestion), run the command again. The mint address is preserved so you get the same token CA.
- **Multi-endpoint** — Sends to all 5 Jito block engines simultaneously (mainnet, Amsterdam, Frankfurt, New York, Tokyo). First one to accept wins.

## How It Works

The bundler sends a Jito bundle containing up to 3 transactions:

| Transaction | Contents | When |
|---|---|---|
| **TX1** | Create token + creator buy | Always |
| **TX2** | Buyer wallets 1-4 | If you have 1+ buyers |
| **TX3** | Buyer wallets 5-8 + Jito tip | If you have 5+ buyers |

The Jito tip is always attached to the last transaction in the bundle. All transactions are signed by the creator wallet and land atomically — either all succeed or none do.

## Requirements

- **Node.js** v18 or higher — [Download here](https://nodejs.org)
- A **Helius RPC endpoint** — [Get a free one here](https://helius.dev) (free tier works fine)
- **SOL** in all wallets — enough to cover buy amounts + ~0.02 SOL per wallet for fees

## Setup (Step by Step)

### 1. Clone the repository

Open a terminal (Command Prompt on Windows, Terminal on Mac) and run:

```bash
git clone https://github.com/LaintDev/pumpfun-bundler.git
cd pumpfun-bundler
```

If you don't have Git installed, you can also click the green "Code" button on GitHub and select "Download ZIP". Extract it and open a terminal in that folder.

### 2. Install dependencies

```bash
npm install
```

This downloads all required packages. You'll see a "BigInt Failed To Load Bindings" warning — this is normal and doesn't affect anything.

### 3. Get a Helius RPC endpoint

Go to [helius.dev](https://helius.dev), create a free account, and copy your RPC URL. It looks like:
```
https://mainnet.helius-rpc.com/?api-key=your-api-key-here
```

### 4. Configure your token

Edit `config/config.json` with any text editor (Notepad, VS Code, etc.):

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

**Important notes:**
- `imageUrl` must be a publicly accessible URL (not a local file path)
- `walletCount` must match the number of entries in `amountPerWallet`
- Set `mode` to `"devnet"` if you want to test without real SOL first

### 5. Add your wallets

Edit `config/wallets.json`:

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

**How to get your private key:** In Phantom wallet, click Settings > Security > Export Private Key. Copy the base58 string (it looks like a long random string of letters and numbers).

**Never share your private keys with anyone. Never commit them to a public repository.**

### 6. Fund your wallets

Send SOL to each wallet address. Every wallet needs enough SOL to cover:
- Its buy amount (from `amountPerWallet`)
- ~0.02 SOL for transaction fees

The creator wallet needs extra SOL for token creation fees and the Jito tip.

You can check all wallet balances by running:
```bash
npm start
```
It will show each wallet's balance before attempting to launch.

## Launch

```bash
npm start
```

The bundler will:
1. Load your config and wallets
2. Check all balances
3. Upload token metadata to IPFS
4. Create the Address Lookup Table (first run only)
5. Build and simulate the transactions
6. Send the bundle to Jito
7. Wait for it to land on-chain
8. Print your pump.fun link

**If the bundle doesn't land** (you'll see "Bundle failed" or Jito rate limit errors), just run `npm start` again. The mint address is cached, so it will retry with the same token CA.

**To start fresh** with a new mint address, delete the `.mint-cache.json` file in the project root.

## Generate New Wallets

```bash
npm run generate-wallet
```

Prints a fresh keypair (public key + private key) to the console. Save the private key somewhere safe.

## Config Reference

| Field | Description | Example |
|---|---|---|
| `token.name` | Token name on pump.fun | `"My Token"` |
| `token.symbol` | Token ticker symbol | `"MTK"` |
| `token.description` | Short description | `"My awesome token"` |
| `token.imageUrl` | Public URL to token image | `"https://..."` |
| `token.twitter` | Twitter/X link (optional) | `"https://x.com/..."` |
| `token.telegram` | Telegram link (optional) | `"https://t.me/..."` |
| `token.website` | Website link (optional) | `"https://..."` |
| `rpc.helius` | Your Helius RPC URL | `"https://mainnet.helius-rpc.com/?api-key=..."` |
| `jito.tipAmount` | Jito tip in SOL | `0.01` |
| `buy.walletCount` | Number of buyer wallets (0-8) | `4` |
| `buy.creatorAmount` | Creator buy amount in SOL | `1.0` |
| `buy.amountPerWallet` | Array of SOL amounts per buyer | `[0.5, 0.5, 0.5, 0.5]` |
| `mode` | `"mainnet"` or `"devnet"` | `"mainnet"` |

## Tips

- **Jito tip:** 0.01 SOL works most of the time. During high network congestion, increase to 0.03-0.05 SOL for faster landing.
- **Varied buy amounts:** Use slightly different amounts per wallet (e.g. 0.48, 0.52, 0.50, 0.53) instead of identical amounts. Looks more natural on-chain.
- **Retry behavior:** The mint keypair is saved in `.mint-cache.json`. Delete this file to generate a new token address on the next run.
- **LUT cache:** Stored in `.lut-cache.json`. Automatically invalidates when you change wallets or mint address. Delete it manually if you run into LUT-related errors.
- **Image hosting:** Use a reliable image host. If the image URL goes down after launch, your token will show no image on pump.fun.

## Project Structure

```
pumpfun-bundler/
  config/
    config.json        — Token details, RPC endpoint, buy amounts
    wallets.json       — Creator + buyer wallet private keys
  src/
    main.ts            — Entry point, builds TXs, sends bundle
    config.ts          — Config file loader and validation
    wallets.ts         — Wallet loading and balance checking
    pumpfun.ts         — Pump.fun create + buy instruction builder
    jito.ts            — Jito bundle sending with simulation
    lut.ts             — Address Lookup Table setup and caching
    metadata.ts        — Token metadata + image upload to IPFS
  .gitignore           — Keeps private files out of Git
  package.json         — Project dependencies and scripts
  tsconfig.json        — TypeScript configuration
```

## Troubleshooting

**"BigInt Failed To Load Bindings"**
Normal warning, ignore it. Everything works fine.

**"Bundle failed on all Jito endpoints"**
Jito is congested. Wait a few seconds and run `npm start` again. Your mint is cached so it retries cleanly.

**"TX1 simulation failed"**
Something is wrong with your transaction. Common causes:
- Insufficient SOL in creator wallet
- Invalid wallet private key
- RPC endpoint is down or rate limited

**"LUT did not activate within 15s"**
Solana network is slow. Delete `.lut-cache.json` and try again.

**Balance check fails**
Fund your wallets with enough SOL. Each buyer needs their buy amount + ~0.02 SOL for fees. The creator wallet needs extra for token creation + Jito tip.

## Contact

Built by **Laint**. For questions, feedback, or issues:

- **Twitter/X:** [@LaintDev](https://x.com/LaintDev)
- **GitHub Issues:** Open an issue on this repo

## Disclaimer

This tool is provided for educational and research purposes. Use at your own risk and always comply with applicable laws and platform terms of service.
