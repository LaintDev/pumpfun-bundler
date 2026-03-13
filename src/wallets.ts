import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { WalletConfig } from './config';

export interface LoadedWallets {
  creator: Keypair;
  buyers: Keypair[];
}

export function loadKeypairs(walletConfig: WalletConfig): LoadedWallets {
  let creator: Keypair;
  let buyers: Keypair[] = [];

  // Load creator wallet
  try {
    const creatorSecret = bs58.decode(walletConfig.creatorWallet);
    creator = Keypair.fromSecretKey(creatorSecret);
    console.log(`✅ Creator wallet: ${creator.publicKey.toBase58()}`);
  } catch (e) {
    throw new Error('Invalid creator wallet private key!');
  }

  // Load buyer wallets
  for (let i = 0; i < walletConfig.buyerWallets.length; i++) {
    try {
      const buyerSecret = bs58.decode(walletConfig.buyerWallets[i]);
      const buyer = Keypair.fromSecretKey(buyerSecret);
      buyers.push(buyer);
      console.log(`✅ Buyer wallet ${i + 1}: ${buyer.publicKey.toBase58()}`);
    } catch (e) {
      throw new Error(`Invalid buyer wallet ${i + 1} private key!`);
    }
  }

  return { creator, buyers };
}

export async function checkBalances(
  connection: Connection,
  wallets: LoadedWallets,
  amountsPerWallet: number[]
): Promise<boolean> {
  console.log('\n💰 Checking wallet balances...');
  let allGood = true;

  // Fetch all balances in parallel
  const allKeys = [wallets.creator.publicKey, ...wallets.buyers.map(b => b.publicKey)];
  const balances = await Promise.all(allKeys.map(k => connection.getBalance(k)));

  const creatorSOL = balances[0]! / LAMPORTS_PER_SOL;
  console.log(`   Creator: ${creatorSOL.toFixed(4)} SOL`);
  if (creatorSOL < 0.05) {
    console.log(`   ❌ Creator wallet needs at least 0.05 SOL for token creation!`);
    allGood = false;
  }

  for (let i = 0; i < wallets.buyers.length; i++) {
    const balanceSOL = balances[i + 1]! / LAMPORTS_PER_SOL;
    const required = amountsPerWallet[i];
    console.log(`   Buyer ${i + 1}: ${balanceSOL.toFixed(4)} SOL (needs ${required} SOL)`);
    if (balanceSOL < required + 0.01) {
      console.log(`   ❌ Buyer wallet ${i + 1} has insufficient balance!`);
      allGood = false;
    }
  }

  if (allGood) {
    console.log('✅ All wallets have sufficient balance!\n');
  } else {
    console.log('❌ Some wallets need more SOL before launching!\n');
  }

  return allGood;
}

export function generateNewWallet(): void {
  const keypair = Keypair.generate();
  console.log('\n🆕 New wallet generated:');
  console.log(`   Public Key:  ${keypair.publicKey.toBase58()}`);
  console.log(`   Private Key: ${bs58.encode(keypair.secretKey)}`);
  console.log('\n⚠️  Save the private key somewhere safe!');
}