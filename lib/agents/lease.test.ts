import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../solana/hash';
import { createLeaseDraft } from './lease';

describe('createLeaseDraft language', () => {
  it('defaults to English and hashes the exact English text', () => {
    const lease = createLeaseDraft('ana', 'prop-01');
    expect(lease.lang).toBe('en');
    expect(lease.contractText).toContain('RESIDENTIAL LEASE AGREEMENT (DEMO)');
    expect(lease.contractHash).toBe(sha256Hex(lease.contractText));
  });

  it('renders the Spanish template, hashes the Spanish text and keeps the demo disclaimers', () => {
    const lease = createLeaseDraft('ana', 'prop-01', 'es');
    expect(lease.lang).toBe('es');
    expect(lease.contractText).toContain('CONTRATO DE LOCACIÓN DE VIVIENDA (DEMO)');
    expect(lease.contractText).toContain('DATOS SIMULADOS');
    expect(lease.contractText).toContain('asesoramiento legal');
    expect(lease.contractText).toContain('custodia');
    expect(lease.contractHash).toBe(sha256Hex(lease.contractText));
  });

  it('the same lease has a different hash in each language', () => {
    const en = createLeaseDraft('bruno', 'prop-02', 'en');
    const es = createLeaseDraft('bruno', 'prop-02', 'es');
    expect(en.contractHash).not.toBe(es.contractHash);
  });
});
