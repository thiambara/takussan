/**
 * TCK-600 (ADR-0055 §6, invariant 1) — AC5d : plus aucun code de `src/` (hors tests) ne lit ni
 * n'écrit la session d'impersonation dans un stockage du navigateur. Elle vivait en clair, jeton
 * compris, dans `localStorage['takussan.impersonation']`.
 */
import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCES = globSync('src/**/*.{ts,tsx}').filter((f) => !/__tests__|\.test\.tsx?$/.test(f));

describe('session d\'impersonation — aucun stockage du navigateur', () => {
  it('parcourt bien les sources (sans quoi la garde ne garderait rien)', () => {
    expect(SOURCES.length).toBeGreaterThan(500);
  });

  it('aucune source ne nomme `takussan.impersonation`', () => {
    expect(SOURCES.filter((f) => readFileSync(f, 'utf8').includes('takussan.impersonation'))).toEqual([]);
  });

  it('aucune source ne range un jeton d\'impersonation dans localStorage ou sessionStorage', () => {
    const fautifs = SOURCES.filter((f) => {
      const source = readFileSync(f, 'utf8');
      return /(localStorage|sessionStorage)\s*\.\s*(getItem|setItem)/.test(source) && /imperson/i.test(source);
    });
    expect(fautifs).toEqual([]);
  });
});
