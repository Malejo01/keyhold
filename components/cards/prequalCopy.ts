import type { Issue, IssueEvidence, IssueEvidenceItem, Lang } from "@/lib/contracts";
import type { Dict } from "@/lib/i18n";
import { formatNumber } from "../format";

/**
 * Turns the language-neutral facts of a rule finding (issue code, evidence keys, raw values, params) into
 * text in the page language. The server's English `message`, `rule`, `label` and `value` are only a fallback
 * for findings without keys (older sessions, fixtures), never the primary source.
 */

const num = (v: string | number | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function rawOf(evidence: IssueEvidence | undefined, key: IssueEvidenceItem["labelKey"]): string | undefined {
  return evidence?.compared.find((c) => c.labelKey === key)?.raw;
}

/** The sentence that explains why the rule fired. */
export function issueMessage(t: Dict, lang: Lang, issue: Issue): string {
  const m = t.cards.prequal.message;
  const noun = issue.docType ? t.cards.prequal.docNoun[issue.docType] : undefined;
  const ev = issue.evidence;
  const p = ev?.params;

  switch (issue.code) {
    case "expired_payslip": {
      const date = rawOf(ev, "payslip_issue_date");
      const age = num(p?.ageDays);
      const max = num(p?.maxAgeDays);
      const asOf = p?.asOf !== undefined ? String(p.asOf) : rawOf(ev, "reference_date");
      if (date && age !== undefined && max !== undefined && asOf) return m.expiredPayslip(date, age, asOf, max);
      break;
    }
    case "name_mismatch": {
      const idName = rawOf(ev, "name_on_id");
      const docName = rawOf(ev, "name_on_document");
      if (idName && docName && noun) return m.nameMismatch(noun, docName, idName);
      break;
    }
    case "income_ratio_exceeded": {
      const rent = rawOf(ev, "monthly_rent");
      const income = rawOf(ev, "monthly_income");
      const pct = p?.rentPct;
      const max = p?.maxPct;
      if (rent && income && pct !== undefined && max !== undefined) {
        return m.incomeRatio(rent, formatNumber(pct, lang), income, formatNumber(max, lang));
      }
      break;
    }
    case "missing_document":
      if (noun) return /^Missing required document/i.test(issue.message) ? m.missingDocument(noun) : m.unreadable(noun);
      break;
  }
  return issue.message;
}

/** The rule sentence under the evidence block. */
export function ruleText(t: Dict, lang: Lang, ev: IssueEvidence): string {
  const r = t.cards.prequal.rule;
  switch (ev.ruleKey) {
    case "name_must_match_id":
      return r.nameMustMatchId;
    case "payslip_max_90_days": {
      const max = num(ev.params?.maxAgeDays);
      return max !== undefined ? r.payslipMaxAge(max) : ev.rule;
    }
    case "rent_max_35_pct_income": {
      const max = ev.params?.maxPct;
      return max !== undefined ? r.rentMaxIncome(formatNumber(max, lang)) : ev.rule;
    }
    default:
      return ev.rule;
  }
}

/** Label of one compared value. */
export function evidenceLabel(t: Dict, item: IssueEvidenceItem): string {
  const l = t.cards.prequal.evidenceLabel;
  switch (item.labelKey) {
    case "name_on_id":
      return l.nameOnId;
    case "name_on_document":
      return l.nameOnDocument(t.cards.prequal.docNoun[item.docType]);
    case "payslip_issue_date":
      return l.payslipIssueDate;
    case "reference_date":
      return l.referenceDate;
    case "monthly_income":
      return l.monthlyIncome;
    case "monthly_rent":
      return l.monthlyRent;
    default:
      return item.label;
  }
}

/** Display value of one compared value: server raw data, phrased with the language's own words. */
export function evidenceValue(t: Dict, lang: Lang, ev: IssueEvidence, item: IssueEvidenceItem): string {
  const c = t.cards.prequal;
  if (item.raw === undefined) return item.value;
  switch (item.labelKey) {
    case "payslip_issue_date": {
      const age = num(ev.params?.ageDays);
      return age !== undefined ? `${item.raw} (${c.daysOld(age)})` : item.raw;
    }
    case "monthly_income":
      return c.usdc(item.raw);
    case "monthly_rent": {
      const pct = ev.params?.rentPct;
      return pct !== undefined ? `${c.usdc(item.raw)} (${c.ofIncome(formatNumber(pct, lang))})` : c.usdc(item.raw);
    }
    default:
      return item.raw;
  }
}

/** Short tag on the value that breaks the rule. */
export function mismatchTag(t: Dict, lang: Lang, ev: IssueEvidence): string {
  const tag = t.cards.prequal.mismatchTag;
  switch (ev.field) {
    case "holder_name":
      return tag.holderName;
    case "payslip_issue_date": {
      const max = num(ev.params?.maxAgeDays);
      return max !== undefined ? tag.payslipAge(max) : tag.generic;
    }
    case "rent_to_income": {
      const max = ev.params?.maxPct;
      return max !== undefined ? tag.rentRatio(formatNumber(max, lang)) : tag.generic;
    }
  }
}
