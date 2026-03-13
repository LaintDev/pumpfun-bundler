import { Connection, Keypair, PublicKey, TransactionInstruction, LAMPORTS_PER_SOL, AccountInfo, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PumpSdk, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, newBondingCurve } from '@pump-fun/pump-sdk';
import BN from 'bn.js';

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

function deriveAta(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

function buildRawAtaInstruction(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

export async function buildCreateAndBuyInstructions(
  connection: Connection,
  creator: Keypair,
  mint: Keypair,
  buyers: Keypair[],
  amountsPerWallet: number[],
  tokenMetadata: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    twitter?: string;
    telegram?: string;
    website?: string;
  },
  metadataUri: string
): Promise<{
  createInstructions: TransactionInstruction[];
  ataInstructions: TransactionInstruction[];
  buyInstructionsPerWallet: TransactionInstruction[][];
  liveFeeRecipient: PublicKey;
}> {
  const offlineSdk = new PumpSdk();
  const onlineSdk = new OnlinePumpSdk(connection);

  const global = await onlineSdk.fetchGlobal();
  const feeConfig = await onlineSdk.fetchFeeConfig();

  const GLOBAL_ACCOUNT = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
  const globalInfo = await connection.getAccountInfo(GLOBAL_ACCOUNT);
  if (!globalInfo) throw new Error('Global account not found');
  const liveFeeRecipient = new PublicKey(globalInfo.data.slice(41, 73));

  const createInstruction = await offlineSdk.createInstruction({
    mint: mint.publicKey,
    name: tokenMetadata.name,
    symbol: tokenMetadata.symbol,
    uri: metadataUri,
    creator: creator.publicKey,
    user: creator.publicKey,
  });

  const ataInstructions: TransactionInstruction[] = [];

  const creatorAta = deriveAta(mint.publicKey, creator.publicKey);
  ataInstructions.push(buildRawAtaInstruction(creator.publicKey, creatorAta, creator.publicKey, mint.publicKey));

  for (const buyer of buyers) {
    const buyerAta = deriveAta(mint.publicKey, buyer.publicKey);
    ataInstructions.push(buildRawAtaInstruction(creator.publicKey, buyerAta, buyer.publicKey, mint.publicKey));
  }

  const buyInstructionsPerWallet: TransactionInstruction[][] = [];
  let currentCurve = {
    ...newBondingCurve(global),
    creator: creator.publicKey,
  };

  const allWallets = [creator, ...buyers];

  for (let i = 0; i < allWallets.length; i++) {
    const wallet = allWallets[i]!;
    const solAmount = new BN(Math.floor(amountsPerWallet[i]! * LAMPORTS_PER_SOL));

    const tokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: currentCurve.tokenTotalSupply,
      bondingCurve: currentCurve,
      amount: solAmount,
    });

    const fakeBondingCurveAccountInfo: AccountInfo<Buffer> = {
      data: Buffer.alloc(151),
      executable: false,
      lamports: 0,
      owner: PUMP_PROGRAM_ID,
    };

    const allBuyIxs = await offlineSdk.buyInstructions({
      global,
      bondingCurveAccountInfo: fakeBondingCurveAccountInfo,
      bondingCurve: currentCurve,
      associatedUserAccountInfo: null as any,
      mint: mint.publicKey,
      user: wallet.publicKey,
      solAmount,
      amount: tokenAmount,
      slippage: 5,
      tokenProgram: TOKEN_PROGRAM_ID,
    });

    const allBuyIxsArray = Array.isArray(allBuyIxs) ? allBuyIxs : [allBuyIxs];
    const pumpBuyIxOnly = allBuyIxsArray.filter(
      ix => ix.programId.toBase58() === PUMP_PROGRAM_ID.toBase58()
    );

    const patchedBuyIxs = pumpBuyIxOnly.map(ix => ({
      ...ix,
      keys: ix.keys.map((k, idx) => idx === 1 ? { ...k, pubkey: liveFeeRecipient } : k)
    }));
    buyInstructionsPerWallet.push([...patchedBuyIxs]);

    currentCurve = {
      ...currentCurve,
      virtualSolReserves: currentCurve.virtualSolReserves.add(solAmount),
      virtualTokenReserves: currentCurve.virtualTokenReserves.sub(tokenAmount),
      realSolReserves: currentCurve.realSolReserves.add(solAmount),
      realTokenReserves: currentCurve.realTokenReserves.sub(tokenAmount),
    };
  }

  return { createInstructions: [createInstruction], ataInstructions, buyInstructionsPerWallet, liveFeeRecipient };
}
