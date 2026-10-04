import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { base58Encode } from './base58';

const rpc = vi.hoisted(() => ({
  statuses: [] as unknown[],
  height: 0,
  statusCalls: 0,
}));

vi.mock('./connection', () => ({
  getDevnetConnection: async () => ({
    getSignatureStatuses: async () => {
      rpc.statusCalls += 1;
      return { value: [rpc.statuses.shift() ?? null] };
    },
    getBlockHeight: async () => rpc.height,
  }),
}));

const { getTransferStatus } = await import('./transfer');

afterEach(() => {
  rpc.statuses = [];
  rpc.height = 0;
  rpc.statusCalls = 0;
});

describe('base58Encode', () => {
  it('matches the known vectors', () => {
    expect(base58Encode(new TextEncoder().encode('Hello World!'))).toBe('2NEpo7TZRRrLZSi2U');
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(base58Encode(new Uint8Array([]))).toBe('');
  });

  it('agrees with web3.js for 32-byte public keys', () => {
    for (let i = 0; i < 20; i += 1) {
      const key: PublicKey = Keypair.generate().publicKey;
      expect(base58Encode(key.toBytes())).toBe(key.toBase58());
    }
  });
});

describe('getTransferStatus (reconciliation of a stored signature)', () => {
  it('confirmed or finalized without error means the money moved', async () => {
    rpc.statuses = [{ err: null, confirmationStatus: 'confirmed' }, { err: null, confirmationStatus: 'finalized' }];
    expect(await getTransferStatus('sig', 100)).toBe('confirmed');
    expect(await getTransferStatus('sig', 100)).toBe('confirmed');
  });

  it('landed with an error means no tokens moved', async () => {
    rpc.statuses = [{ err: { InstructionError: [0, 'Custom'] }, confirmationStatus: 'confirmed' }];
    expect(await getTransferStatus('sig', 100)).toBe('failed');
  });

  it('only processed could still be dropped or confirmed: pending', async () => {
    rpc.statuses = [{ err: null, confirmationStatus: 'processed' }];
    expect(await getTransferStatus('sig', 100)).toBe('pending');
  });

  it('unknown while the blockhash is still valid is pending, never expired', async () => {
    rpc.height = 100; // not past lastValidBlockHeight
    expect(await getTransferStatus('sig', 100)).toBe('pending');
    rpc.height = 100 + 40; // inside the safety margin
    expect(await getTransferStatus('sig', 100)).toBe('pending');
  });

  it('unknown after the blockhash expired (plus the margin) can never land', async () => {
    rpc.height = 100 + 41;
    expect(await getTransferStatus('sig', 100)).toBe('expired');
  });
});
