import fs from 'fs';
import { Connection, Keypair, ComputeBudgetProgram } from '@solana/web3.js';
import { loadConfig, loadWallets } from './config';
import { loadKeypairs, checkBalances } from './wallets';
import { buildCreateAndBuyInstructions } from './pumpfun';
import { uploadMetadata } from './metadata';
import { sendJitoBundle, checkBundleStatus, buildTipInstruction, BundleTx } from './jito';
import { setupLUT } from './lut';

const MAX_BUYERS_PER_TX = 4;

async function main() {
  console.log('\n  Laint Pumpfun Bundler v1.0 (2026)\n');

  // ── Load config ────────────────────────────────────────────────────────────
  const config = loadConfig();
  const walletConfig = loadWallets();
  const wallets = loadKeypairs(walletConfig);

  const rpc = config.mode === 'mainnet' ? config.rpc.helius : config.rpc.devnet;
  const connection = new Connection(rpc, { commitment: 'confirmed' });
  console.log('  Mode: ' + config.mode);
  console.log('  Token: ' + config.token.name + ' (' + config.token.symbol + ')');
  console.log('  Creator buy: ' + config.buy.creatorAmount + ' SOL');
  console.log('  Buyers: ' + wallets.buyers.length + ' wallets');

  // ── Check balances ─────────────────────────────────────────────────────────
  const balancesOk = await checkBalances(connection, wallets, config.buy.amountPerWallet);
  if (!balancesOk) {
    console.log('\n  Fund your wallets first!');
    process.exit(1);
  }

  // ── Upload metadata ────────────────────────────────────────────────────────
  console.log('\n  Uploading metadata...');
  const metadataUri = await uploadMetadata(config.token);
  console.log('  Metadata: ' + metadataUri);

  // ── Mint keypair (cached for retries) ──────────────────────────────────────
  const MINT_CACHE = '.mint-cache.json';
  let mint: Keypair;
  let isRetry = false;
  if (fs.existsSync(MINT_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(MINT_CACHE, 'utf-8'));
    mint = Keypair.fromSecretKey(Uint8Array.from(cached.secretKey));
    isRetry = true;
    console.log('  Mint: ' + mint.publicKey.toBase58() + ' (retry)');
  } else {
    mint = Keypair.generate();
    fs.writeFileSync(MINT_CACHE, JSON.stringify({ secretKey: Array.from(mint.secretKey) }));
    console.log('  Mint: ' + mint.publicKey.toBase58() + ' (new)');
  }

  // ── Build instructions ─────────────────────────────────────────────────────
  console.log('\n  Building transactions...');
  const { createInstructions, ataInstructions, buyInstructionsPerWallet } = await buildCreateAndBuyInstructions(
    connection,
    wallets.creator,
    mint,
    wallets.buyers,
    [config.buy.creatorAmount, ...config.buy.amountPerWallet],
    config.token,
    metadataUri
  );

  const tipIx = buildTipInstruction(wallets.creator, config.jito.tipAmount);

  // ── Split buyers into TX2 and TX3 (max 4 per TX) ──────────────────────────
  const tx2Buyers = wallets.buyers.slice(0, MAX_BUYERS_PER_TX);
  const tx3Buyers = wallets.buyers.slice(MAX_BUYERS_PER_TX, MAX_BUYERS_PER_TX * 2);

  // TX1: Create token + creator ATA + creator buy
  const tx1Instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    ...createInstructions,
    ataInstructions[0]!,
    ...buyInstructionsPerWallet[0]!,
  ];

  const bundleTxs: BundleTx[] = [
    { label: 'TX1 (create + creator buy)', instructions: tx1Instructions, signers: [wallets.creator, mint] },
  ];

  let allInstructions = [...tx1Instructions];

  // TX2: first 4 buyers
  if (tx2Buyers.length > 0) {
    const tx2AtaIxs = ataInstructions.slice(1, 1 + tx2Buyers.length);
    const tx2BuyIxs = buyInstructionsPerWallet.slice(1, 1 + tx2Buyers.length).flat();
    const hasTip = tx3Buyers.length === 0;
    const tx2CU = Math.max(200_000, tx2Buyers.length * 120_000);
    const tx2Instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: tx2CU }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ...tx2AtaIxs,
      ...tx2BuyIxs,
      ...(hasTip ? [tipIx] : []),
    ];
    bundleTxs.push({
      label: 'TX2 (' + tx2Buyers.length + ' buyers' + (hasTip ? ' + tip' : '') + ')',
      instructions: tx2Instructions,
      signers: [wallets.creator, ...tx2Buyers],
    });
    allInstructions = [...allInstructions, ...tx2Instructions];
  }

  // TX3: next 4 buyers (if any)
  if (tx3Buyers.length > 0) {
    const tx3Start = 1 + tx2Buyers.length;
    const tx3AtaIxs = ataInstructions.slice(tx3Start, tx3Start + tx3Buyers.length);
    const tx3BuyIxs = buyInstructionsPerWallet.slice(tx3Start, tx3Start + tx3Buyers.length).flat();
    const tx3CU = Math.max(200_000, tx3Buyers.length * 120_000);
    const tx3Instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: tx3CU }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ...tx3AtaIxs,
      ...tx3BuyIxs,
      tipIx,
    ];
    bundleTxs.push({
      label: 'TX3 (' + tx3Buyers.length + ' buyers + tip)',
      instructions: tx3Instructions,
      signers: [wallets.creator, ...tx3Buyers],
    });
    allInstructions = [...allInstructions, ...tx3Instructions];
  }

  // If no buyers at all, tip goes on TX1
  if (wallets.buyers.length === 0) {
    bundleTxs[0]!.instructions.push(tipIx);
    allInstructions.push(tipIx);
  }

  // ── LUT ────────────────────────────────────────────────────────────────────
  console.log('  Setting up LUT...');
  const lutAccount = await setupLUT(
    connection,
    wallets.creator,
    mint,
    wallets.buyers,
    wallets.creator,
    allInstructions
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalBuyerSol = config.buy.amountPerWallet.reduce((s, a) => s + a, 0);
  const totalCost = config.buy.creatorAmount + totalBuyerSol + config.jito.tipAmount + 0.015;
  console.log('\n  ── Launch Summary ──');
  console.log('  Token:   ' + config.token.name + ' (' + config.token.symbol + ')');
  console.log('  Mint:    ' + mint.publicKey.toBase58());
  console.log('  Creator: ' + config.buy.creatorAmount + ' SOL');
  console.log('  Buyers:  ' + wallets.buyers.length + ' x [' + config.buy.amountPerWallet.join(', ') + '] SOL');
  console.log('  Tip:     ' + config.jito.tipAmount + ' SOL');
  console.log('  Bundle:  ' + bundleTxs.length + ' transactions');
  console.log('  Est:     ~' + totalCost.toFixed(4) + ' SOL total');

  // ── Send bundle ────────────────────────────────────────────────────────────
  console.log('\n  Sending bundle...');
  const bundleId = await sendJitoBundle(connection, bundleTxs, lutAccount, wallets.creator);
  console.log('  Bundle ID: ' + bundleId);

  // ── Poll for landing ───────────────────────────────────────────────────────
  console.log('\n  Waiting for bundle to land...');
  const MAX_WAIT = 20_000;
  const POLL_MS = 2_000;
  const startTime = Date.now();
  let landed = false;

  while (Date.now() - startTime < MAX_WAIT) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    const mintInfo = await connection.getAccountInfo(mint.publicKey);
    if (mintInfo) {
      console.log('  Landed! (' + elapsed + 's)');
      landed = true;
      break;
    }

    const status = await checkBundleStatus(bundleId);
    process.stdout.write('  [' + elapsed + 's] ' + (status || 'pending...') + '\r');
  }

  if (!landed) {
    console.log('\n  Bundle did not land. Run again to retry.');
    console.log('  https://explorer.jito.wtf/bundle/' + bundleId);
  } else {
    if (fs.existsSync(MINT_CACHE)) fs.unlinkSync(MINT_CACHE);
    if (fs.existsSync('.lut-cache.json')) fs.unlinkSync('.lut-cache.json');
    console.log('  Caches cleared.');
  }

  console.log('\n  https://pump.fun/' + mint.publicKey.toBase58() + '\n');
}

main().catch(error => {
  console.error('\n  Error: ' + error.message);
  process.exit(1);
});
