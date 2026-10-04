"use client";

import { motion } from "framer-motion";
import type { PaymentKind, PaymentResult, Property, UiCard, VerifyResponse } from "@/lib/contracts";
import { cardIn } from "@/lib/motion/presets";
import { ContractCard } from "./ContractCard";
import { PaymentCard } from "./PaymentCard";
import { PrequalCard } from "./PrequalCard";
import { PropertyCards } from "./PropertyCards";
import { ReceiptCard } from "./ReceiptCard";

/** Everything cards need from the shell. The shell owns the session; cards only render and call back. */
export interface CardContext {
  payments: PaymentResult[];
  hasLease: boolean;
  busy: boolean;
  generatingContract: boolean;
  onVisit: (property: Property) => void;
  onPay: (kind: PaymentKind) => Promise<void>;
  onVerify: (contractText: string, signature: string) => Promise<VerifyResponse>;
  onGenerateContract: () => void;
}

export function CardRenderer({ card, ctx }: { card: UiCard; ctx: CardContext }) {
  switch (card.type) {
    case "properties":
      return <PropertyCards properties={card.properties} disabled={ctx.busy} onVisit={ctx.onVisit} />;
    case "prequal":
      return (
        <motion.div variants={cardIn} className="max-w-2xl">
          <PrequalCard
            decision={card.decision}
            canGenerateContract={card.decision.status === "APPROVED" && !ctx.hasLease}
            generating={ctx.generatingContract}
            onGenerateContract={ctx.onGenerateContract}
          />
        </motion.div>
      );
    case "contract":
      return (
        <motion.div variants={cardIn} className="max-w-2xl">
          <ContractCard
            lease={card.lease}
            depositSignature={ctx.payments.find((p) => p.kind === "deposit")?.signature}
            onVerify={ctx.onVerify}
          />
        </motion.div>
      );
    case "payment":
      return (
        <motion.div variants={cardIn} className="max-w-2xl">
          <PaymentCard
            kind={card.kind}
            quote={card.quote}
            alreadyPaid={ctx.payments.some((p) => p.kind === card.kind)}
            onPay={ctx.onPay}
          />
        </motion.div>
      );
    case "receipt":
      return <ReceiptCard result={card.result} />;
  }
}
