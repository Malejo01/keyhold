import type {
  ChatRequest,
  ChatResponse,
  LeaseRequest,
  LeaseResponse,
  PayRequest,
  PayResponse,
  VerifyRequest,
  VerifyResponse,
} from "@/lib/contracts";
import type { Lang } from "@/lib/contracts";
import type { Dict } from "@/lib/i18n";

/** Typed client for the four API routes. `?fixtures=1` swaps in local fixtures (no backend needed). */
export interface Api {
  chat(req: ChatRequest): Promise<ChatResponse>;
  lease(req: LeaseRequest): Promise<LeaseResponse>;
  pay(req: PayRequest): Promise<PayResponse>;
  verify(req: VerifyRequest): Promise<VerifyResponse>;
}

async function post<TReq, TRes>(url: string, body: TReq, errors: Dict["errors"]): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(errors.unreachable);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body: handled below.
  }

  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : res.status === 409
          ? errors.notAvailable
          : errors.failed(res.status);
    throw new Error(message);
  }
  return data as TRes;
}

/**
 * Real client. The route language travels with every request that can depend on it (chat, lease, pay), so the
 * server answers and writes the contract in the language of the page. Verify is language-neutral.
 */
export function createRealApi(lang: Lang, errors: Dict["errors"]): Api {
  return {
    chat: (req) => post("/api/chat", { ...req, lang }, errors),
    lease: (req) => post("/api/lease", { ...req, lang }, errors),
    pay: (req) => post("/api/pay", { ...req, lang }, errors),
    verify: (req) => post("/api/verify", req, errors),
  };
}

/** Fixtures are loaded lazily so they never ship in the default path. */
export const fixtureApi: Api = {
  chat: async (req) => (await import("./__fixtures__")).fixtureChat(req),
  lease: async (req) => (await import("./__fixtures__")).fixtureLease(req),
  pay: async (req) => (await import("./__fixtures__")).fixturePay(req),
  verify: async (req) => (await import("./__fixtures__")).fixtureVerify(req),
};
