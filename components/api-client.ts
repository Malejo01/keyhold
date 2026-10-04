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

/** Typed client for the four API routes. `?fixtures=1` swaps in local fixtures (no backend needed). */
export interface Api {
  chat(req: ChatRequest): Promise<ChatResponse>;
  lease(req: LeaseRequest): Promise<LeaseResponse>;
  pay(req: PayRequest): Promise<PayResponse>;
  verify(req: VerifyRequest): Promise<VerifyResponse>;
  /** Real document upload (multipart). Returns the same shape as a chat turn. */
  upload(req: { files: File[]; session: SignedSession }): Promise<ChatResponse>;
}

async function post<TReq, TRes>(url: string, body: TReq | FormData): Promise<TRes> {
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
    throw new Error(message);
  }
  return data as TRes;
}

export const realApi: Api = {
  chat: (req) => post("/api/chat", req),
  lease: (req) => post("/api/lease", req),
  pay: (req) => post("/api/pay", req),
  verify: (req) => post("/api/verify", req),
  upload: ({ files, session }) => {
    const form = new FormData();
    form.append("session", JSON.stringify(session));
    for (const file of files) form.append("files", file, file.name);
    return post("/api/upload", form);
  },
};

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
