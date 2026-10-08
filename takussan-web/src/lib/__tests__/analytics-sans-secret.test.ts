import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { sansSecret, urlSansSecret } from '@/lib/analytics-sans-secret';

const JETON = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

describe('urlSansSecret — aucun secret vers la mesure d’audience (TCK-602, VERIF-602 M3)', () => {
  it.each([
    [`/pay/${JETON}`, '/pay/[token]'],
    [`/fr/pay/${JETON}`, '/fr/pay/[token]'],
    [`/wo/pay/${JETON}?status=success`, '/wo/pay/[token]?status=success'],
    [`https://www.takussan.com/en/pay/${JETON}?status=cancelled`, 'https://www.takussan.com/en/pay/[token]?status=cancelled'],
    [`/fr/share/${JETON}`, '/fr/share/[token]'],
    ['/auth/verify-email/12/9f8e7d?expires=1&signature=abc', '/auth/verify-email/[id]/[hash]'],
    ['/auth/reset-password?token=secret&email=awa%40example.sn', '/auth/reset-password'],
    // TCK-599 — les deux pages des liens d'alerte : le jeton de confirmation, et le jeton ou la
    // signature de désinscription ; l'identifiant de recherche, lui, n'est pas un secret.
    [`/fr/search-alerts/confirm?token=${JETON}`, '/fr/search-alerts/confirm'],
    [
      '/fr/search-alerts/unsubscribe?search=12&expires=1760000000&signature=9f8e7d6c',
      '/fr/search-alerts/unsubscribe?search=12',
    ],
    [`/fr/search-alerts/unsubscribe?token=${JETON}`, '/fr/search-alerts/unsubscribe'],
  ])('%s → %s', (entree, attendu) => {
    expect(urlSansSecret(entree)).toBe(attendu);
  });

  it('laisse intactes les pages sans secret', () => {
    expect(urlSansSecret('/fr/biens/villa-a-dakar?page=2')).toBe('/fr/biens/villa-a-dakar?page=2');
    expect(urlSansSecret('https://www.takussan.com/fr/payer-son-loyer')).toBe('https://www.takussan.com/fr/payer-son-loyer');
  });

  it('le beforeSend rend le même événement, URL expurgée, jamais le jeton', () => {
    const evenement = sansSecret({ type: 'pageview' as const, url: `https://www.takussan.com/fr/pay/${JETON}` });
    expect(evenement).toEqual({ type: 'pageview', url: 'https://www.takussan.com/fr/pay/[token]' });
    expect(JSON.stringify(evenement)).not.toContain(JETON);
  });
});

describe('la mesure d’audience ne se monte que derrière le filtre', () => {
  it('seul AudienceSansSecret importe @vercel/analytics, et le layout racine le monte', () => {
    const racine = join(process.cwd(), 'src');
    const importeurs = (readdirSync(racine, { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'))
      .filter((f) => /from ['"]@vercel\/analytics/.test(readFileSync(join(racine, f), 'utf8')));
    expect(importeurs).toEqual([join('components', 'shared', 'AudienceSansSecret.tsx')]);
    expect(readFileSync(join(racine, 'app', 'layout.tsx'), 'utf8')).toContain('<AudienceSansSecret />');
  });
});
