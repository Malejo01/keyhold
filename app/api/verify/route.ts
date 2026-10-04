import type { VerifyResponse } from '@/lib/contracts';
import { sha256Hex } from '@/lib/solana/hash';
import { readMemoHash } from '@/lib/solana/verify';
import { verifyRequestSchema } from '@/lib/db/schemas';
import { jsonError, logError, parseBody } from '@/lib/db/http';

export const runtime = 'nodejs';

// Public, session-less endpoint: anyone can check a contract text against the hash in a tx Memo.
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, verifyRequestSchema);
  if (!body.ok) return body.response;
  const { contractText, signature } = body.data;

  try {
    const computedHash = sha256Hex(contractText);
    const memoHash = await readMemoHash(signature);
    const response: VerifyResponse = {
      computedHash,
      memoHash,
      match: memoHash !== null && memoHash === computedHash,
    };
    return Response.json(response);
  } catch (err) {
    logError('verify', err);
    return jsonError('Could not read the transaction from the network', 502);
  }
}
