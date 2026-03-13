import { Connection, Keypair, PublicKey, SystemProgram, VersionedTransaction, TransactionInstruction, TransactionMessage, AddressLookupTableAccount, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

const JITO_ENDPOINTS = [
  'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
  'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
];

export function buildTipInstruction(payer: Keypair, tipAmountSOL: number): TransactionInstruction {
  const tipAccount = new PublicKey(
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]!
  );
  return SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: tipAccount,
    lamports: Math.floor(tipAmountSOL * LAMPORTS_PER_SOL),
  });
}

export interface BundleTx {
  label: string;
  instructions: TransactionInstruction[];
  signers: Keypair[];
}

export async function sendJitoBundle(
  connection: Connection,
  txDefs: BundleTx[],
  lutAccount: AddressLookupTableAccount,
  payer: Keypair
): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const encodedTxs: string[] = [];

  // Simulate TX1 before sending (catches errors before wasting tip)
  let tx1ForSim: VersionedTransaction | null = null;

  for (let i = 0; i < txDefs.length; i++) {
    const def = txDefs[i]!;
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: def.instructions,
    }).compileToV0Message([lutAccount]);

    const tx = new VersionedTransaction(message);

    const seenKeys = new Set<string>();
    const uniqueSigners: Keypair[] = [];
    for (const s of [payer, ...def.signers]) {
      const b58 = s.publicKey.toBase58();
      if (!seenKeys.has(b58)) {
        seenKeys.add(b58);
        uniqueSigners.push(s);
      }
    }
    tx.sign(uniqueSigners);

    if (i === 0) tx1ForSim = tx;

    const serialized = tx.serialize();
    if (serialized.length > 1232) throw new Error(`${def.label} too large: ${serialized.length} bytes`);

    encodedTxs.push(bs58.encode(serialized));
  }

  // Simulate TX1
  if (tx1ForSim) {
    console.log('   Simulating TX1...');
    try {
      const sim = await connection.simulateTransaction(tx1ForSim, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      if (sim.value.err) {
        console.log('   Simulation FAILED:', JSON.stringify(sim.value.err));
        if (sim.value.logs) {
          for (const log of sim.value.logs.slice(-5)) console.log('     ', log);
        }
        throw new Error('TX1 simulation failed: ' + JSON.stringify(sim.value.err));
      }
      console.log('   Simulation OK');
    } catch (e: any) {
      if (e.message.startsWith('TX1 simulation')) throw e;
      console.log('   Simulation warning:', e.message);
    }
  }

  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [encodedTxs] });

  const results = await Promise.allSettled(
    JITO_ENDPOINTS.map(async (endpoint) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const data = await response.json() as any;
      if (data.error) throw new Error(data.error.message);
      if (!data.result) throw new Error('no result');
      return data.result as string;
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled') return r.value;
  }

  for (const r of results) {
    if (r.status === 'rejected') console.log('   Endpoint failed:', r.reason.message);
  }
  throw new Error('Bundle failed on all Jito endpoints');
}

export async function checkBundleStatus(bundleId: string): Promise<string | null> {
  const payload = { jsonrpc: '2.0', id: 1, method: 'getBundleStatuses', params: [[bundleId]] };
  try {
    const response = await fetch(JITO_ENDPOINTS[0]!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as any;
    return data?.result?.value?.[0]?.confirmation_status ?? null;
  } catch {
    return null;
  }
}
