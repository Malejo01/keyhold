import type {
  ChatRequest,
  ChatResponse,
  LeaseRequest,
  LeaseResponse,
  PayRequest,
  PayResponse,
  SignedSession,
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
  /** Real document upload (multipart). Returns the same shape as a chat turn. */
  upload(req: { files: File[]; session: SignedSession }): Promise<ChatResponse>;
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

async function post<TReq, TRes>(url: string, body: TReq | FormData, errors: Dict["errors"]): Promise<TRes> {
  let res: Response;
  try {
    // FormData: the browser sets the multipart content-type (with boundary) itself.
    res = await fetch(
      url,
      body instanceof FormData
        ? { method: "POST", body }
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
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
    const code =
      data && typeof data === "object" && "code" in data && typeof (data as { code: unknown }).code === "string"
        ? (data as { code: string }).code
        : undefined;
    throw new ApiError(message, code);
  }
  return data as TRes;
}

/**
 * Real client. The route language travels with every request that can depend on it (chat, lease, pay, upload), so
 * the server answers and writes the contract in the language of the page. Verify is language-neutral.
 */
export function createRealApi(lang: Lang, errors: Dict["errors"]): Api {
  return {
    chat: (req) => post("/api/chat", { ...req, lang }, errors),
    lease: (req) => post("/api/lease", { ...req, lang }, errors),
    pay: (req) => post("/api/pay", { ...req, lang }, errors),
    verify: (req) => post("/api/verify", req, errors),
    upload: ({ files, session }) => {
      const form = new FormData();
      form.append("session", JSON.stringify(session));
      form.append("lang", lang);
      for (const file of files) form.append("files", file, file.name);
      return post("/api/upload", form, errors);
    },
  };
}

/** Fixtures are loaded lazily so they never ship in the default path. */
export const fixtureApi: Api = {
  chat: async (req) => (await import("./__fixtures__")).fixtureChat(req),
  lease: async (req) => (await import("./__fixtures__")).fixtureLease(req),
  pay: async (req) => (await import("./__fixtures__")).fixturePay(req),
  verify: async (req) => (await import("./__fixtures__")).fixtureVerify(req),
  upload: async () => {
    throw new Error("Uploads need the live backend (not available with ?fixtures=1).");
  },
};
