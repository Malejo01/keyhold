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

/** Typed client for the four API routes. `?fixtures=1` swaps in local fixtures (no backend needed). */
export interface Api {
  chat(req: ChatRequest): Promise<ChatResponse>;
  lease(req: LeaseRequest): Promise<LeaseResponse>;
  pay(req: PayRequest): Promise<PayResponse>;
  verify(req: VerifyRequest): Promise<VerifyResponse>;
}

/** An API error that keeps the machine-readable `code` of the response body (e.g. "stale_session"). */
export class ApiError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export const isStaleSession = (err: unknown): boolean => err instanceof ApiError && err.code === "stale_session";

async function post<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
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
          ? "That step is not available yet."
          : `Request failed (${res.status}).`;
    const code =
      data && typeof data === "object" && "code" in data && typeof (data as { code: unknown }).code === "string"
        ? (data as { code: string }).code
        : undefined;
    throw new ApiError(message, code);
  }
  return data as TRes;
}

export const realApi: Api = {
  chat: (req) => post("/api/chat", req),
  lease: (req) => post("/api/lease", req),
  pay: (req) => post("/api/pay", req),
  verify: (req) => post("/api/verify", req),
};

/** Fixtures are loaded lazily so they never ship in the default path. */
export const fixtureApi: Api = {
  chat: async (req) => (await import("./__fixtures__")).fixtureChat(req),
  lease: async (req) => (await import("./__fixtures__")).fixtureLease(req),
  pay: async (req) => (await import("./__fixtures__")).fixturePay(req),
  verify: async (req) => (await import("./__fixtures__")).fixtureVerify(req),
};
