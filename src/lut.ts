import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const LUT_CACHE_FILE = path.join(process.cwd(), '.lut-cache.json');

function saveLutCache(lutAddress: string, mintAddress: string, addressCount: number, addressHash: string) {
  fs.writeFileSync(LUT_CACHE_FILE, JSON.stringify({ lutAddress, mintAddress, addressCount, addressHash }, null, 2));
}

function loadLutCache(): { lutAddress: string; mintAddress: string; addressCount: number; addressHash?: string } | null {
  try {
    if (fs.existsSync(LUT_CACHE_FILE)) return JSON.parse(fs.readFileSync(LUT_CACHE_FILE, 'utf-8'));
  } catch {}
  return null;
}

function hashAddresses(addresses: PublicKey[]): string {
  return addresses.map(a => a.toBase58()).sort().join(',').slice(0, 64);
}

export function derivePumpAddresses(mint: PublicKey) {
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBytes()],
    PUMP_PROGRAM
  );
  const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
    [bondingCurve.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), MPL_TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    MPL_TOKEN_METADATA_PROGRAM_ID
  );
  return { bondingCurve, associatedBondingCurve, metadata };
}

async function sendAndConfirm(connection: Connection, tx: VersionedTransaction, signers: Keypair[]): Promise<void> {
  tx.sign(signers);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction(sig, 'confirmed');
}

const JITO_TIP_ACCOUNTS = new Set([
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]);

function extractNonSignerAccounts(instructions: TransactionInstruction[], signerKeys: Set<string>): PublicKey[] {
  const seen = new Set<string>();
  const result: PublicKey[] = [];
  for (const ix of instructions) {
    const progId = ix.programId.toBase58();
    if (!signerKeys.has(progId) && !JITO_TIP_ACCOUNTS.has(progId) && !seen.has(progId)) { seen.add(progId); result.push(ix.programId); }
    for (const key of ix.keys) {
      const b58 = key.pubkey.toBase58();
      if (!signerKeys.has(b58) && !JITO_TIP_ACCOUNTS.has(b58) && !seen.has(b58)) { seen.add(b58); result.push(key.pubkey); }
    }
  }
  return result;
}

export async function setupLUT(
  connection: Connection,
  payer: Keypair,
  mint: Keypair,
  buyers: Keypair[],
  creator: Keypair,
  allInstructions: TransactionInstruction[]
): Promise<AddressLookupTableAccount> {
  const signerKeys = new Set<string>([
    payer.publicKey.toBase58(),
    mint.publicKey.toBase58(),
    creator.publicKey.toBase58(),
    ...buyers.map(b => b.publicKey.toBase58()),
  ]);

  const lutAddresses = extractNonSignerAccounts(allInstructions, signerKeys);

  const addrHash = hashAddresses(lutAddresses);
  const cache = loadLutCache();
  if (cache && cache.mintAddress === mint.publicKey.toBase58() && cache.addressCount === lutAddresses.length && cache.addressHash === addrHash) {
    const result = await connection.getAddressLookupTable(new PublicKey(cache.lutAddress));
    if (result.value && result.value.state.addresses.length === lutAddresses.length) {
      console.log('  LUT cached (' + result.value.state.addresses.length + ' addresses)');
      return result.value;
    }
  }

  console.log('  Creating LUT (' + lutAddresses.length + ' addresses)...');
  const [slot, { blockhash: bh1 }] = await Promise.all([
    connection.getSlot('finalized'),
    connection.getLatestBlockhash('confirmed'),
  ]);
  const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot,
  });
  const createTx = new VersionedTransaction(
    new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: bh1, instructions: [createIx] }).compileToV0Message()
  );
  await sendAndConfirm(connection, createTx, [payer]);

  saveLutCache(lutAddress.toBase58(), mint.publicKey.toBase58(), lutAddresses.length, addrHash);

  const chunks: PublicKey[][] = [];
  for (let i = 0; i < lutAddresses.length; i += 30) chunks.push(lutAddresses.slice(i, i + 30));

  for (let i = 0; i < chunks.length; i++) {
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      lookupTable: lutAddress, authority: payer.publicKey, payer: payer.publicKey, addresses: chunks[i]!,
    });
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const extendTx = new VersionedTransaction(
      new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [extendIx] }).compileToV0Message()
    );
    await sendAndConfirm(connection, extendTx, [payer]);
  }

  const start = Date.now();
  while (Date.now() - start < 15_000) {
    await new Promise(r => setTimeout(r, 1_000));
    const result = await connection.getAddressLookupTable(lutAddress);
    if (result.value && result.value.state.addresses.length === lutAddresses.length) {
      console.log('  LUT ready');
      return result.value;
    }
  }
  throw new Error('LUT did not activate within 15s');
}
