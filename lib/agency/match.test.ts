import { describe, expect, it } from "vitest";
import { matchBySignature } from "./match";

const tx = (sig: string, marker: string) => ({ transaction: { signatures: [sig] }, marker });

describe("matchBySignature", () => {
  it("pairs by the transaction's own signature even when the batch comes back reordered", () => {
    const wanted = [{ signature: "A" }, { signature: "B" }, { signature: "C" }];
    const reordered = [tx("C", "c"), tx("A", "a"), tx("B", "b")];
    expect(matchBySignature(wanted, reordered).map(([w, t]) => [w.signature, t.marker])).toEqual([
      ["C", "c"],
      ["A", "a"],
      ["B", "b"],
    ]);
  });
  it("skips missing transactions and signatures nobody asked for", () => {
    const pairs = matchBySignature([{ signature: "A" }, { signature: "B" }], [null, tx("B", "b"), tx("Z", "z")]);
    expect(pairs.map(([w]) => w.signature)).toEqual(["B"]);
  });
});
