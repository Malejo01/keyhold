import { describe, expect, it } from 'vitest';
import { nameTokens, namesMatch, normalizeName } from './names';

describe('nameTokens / normalizeName', () => {
  it('strips accents, case, punctuation and extra spaces', () => {
    expect(nameTokens('  TESTA  FICTICIA, ANA LUCÍA ')).toEqual(['testa', 'ficticia', 'ana', 'lucia']);
  });
  it('ignores token order', () => {
    expect(normalizeName('Testa Ficticia, Ana')).toBe(normalizeName('ana testa ficticia'));
  });
  it('drops connector particles', () => {
    expect(nameTokens('María de los Ángeles')).toEqual(['maria', 'angeles']);
  });
});

describe('namesMatch', () => {
  it('matches surname-first DNI format with given-name-first payslip', () => {
    expect(namesMatch('TESTA FICTICIA, ANA LUCIA', 'Ana Lucía Testa Ficticia')).toBe(true);
  });
  it('matches when a document omits the middle name', () => {
    expect(namesMatch('TESTA FICTICIA, ANA LUCIA', 'Ana Testa Ficticia')).toBe(true);
  });
  it('detects a different given name (Carla vs Camila)', () => {
    expect(namesMatch('DEMO INVENTADA, CARLA BEATRIZ', 'Camila Demo Inventada')).toBe(false);
  });
  it('does not match on a single shared token', () => {
    expect(namesMatch('Ana Testa Ficticia', 'Ficticia')).toBe(false);
  });
  it('does not match empty names', () => {
    expect(namesMatch('', 'Ana')).toBe(false);
  });
});
