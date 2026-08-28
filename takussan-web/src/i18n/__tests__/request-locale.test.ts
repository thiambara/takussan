import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AC2 — **une requête SANS cookie et SANS `Accept-Language` sur une URL de langue rend cette
 * langue.**
 *
 * L'énoncé du ticket insiste, et il a raison : *« un test qui pose le cookie passerait déjà
 * aujourd'hui et ne prouverait rien »*. Les deux sources qui pouvaient masquer le défaut sont donc
 * **vides** dans ces cas — c'est exactement la condition d'un robot d'indexation, qui n'envoie ni
 * l'un ni l'autre et n'obtenait pour cette raison jamais que du français.
 */
const etat = { cookie: undefined as string | undefined, acceptLanguage: null as string | null };

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) =>
      nom === 'NEXT_LOCALE' && etat.cookie ? { name: nom, value: etat.cookie } : undefined,
  }),
  headers: async () => new Headers(etat.acceptLanguage ? { 'accept-language': etat.acceptLanguage } : {}),
}));

// ⚠ Sous vitest (environnement jsdom), `next-intl/server` se résout sur sa variante CLIENT, qui
// lève « getRequestConfig is not supported in Client Components ». Le double est donc la FONCTION
// IDENTITÉ — et ce n'est pas une commodité : c'est ce que next-intl fait réellement, mesuré dans
// `dist/…/server/react-server/getRequestConfig.js` → `function t(t){return t}`. L'export par défaut
// de `request.ts` est le rappel lui-même, et c'est LUI qu'on éprouve, pas une réécriture.
vi.mock('next-intl/server', () => ({ getRequestConfig: (rappel: unknown) => rappel }));

import config from '../request';

type Rappel = (opts: { requestLocale: Promise<string | undefined> }) => Promise<{
  locale: string;
  messages: Record<string, unknown>;
}>;

const resoudre = (requestLocale: string | undefined) =>
  (config as unknown as Rappel)({ requestLocale: Promise.resolve(requestLocale) });

beforeEach(() => {
  etat.cookie = undefined;
  etat.acceptLanguage = null;
});

describe('AC2 — le segment d’URL, sans cookie ni Accept-Language', () => {
  it('rend l’anglais sur l’URL anglaise', async () => {
    const { locale } = await resoudre('en');
    expect(locale).toBe('en');
  });

  it('rend le wolof sur l’URL wolof — ADR-0026 §4, pas de régime d’exception', async () => {
    const { locale } = await resoudre('wo');
    expect(locale).toBe('wo');
  });

  it('sert bien le DICTIONNAIRE de cette langue, pas seulement l’étiquette', async () => {
    // Une locale juste avec des messages français serait le défaut d'origine, rebaptisé.
    const anglais = await resoudre('en');
    const wolof = await resoudre('wo');
    const francais = await resoudre('fr');
    const cle = (m: Record<string, unknown>) =>
      ((m.common as { tagline?: string } | undefined)?.tagline);

    expect(cle(anglais.messages)).toBeTruthy();
    expect(cle(anglais.messages)).not.toBe(cle(francais.messages));
    expect(cle(wolof.messages)).toBe('Kër yu Senegaal');
  });
});

describe('AC5 — l’URL est absolue, le cookie et l’en-tête ne peuvent pas la contredire', () => {
  it('un cookie français ne fait pas rendre du français sur /en', async () => {
    etat.cookie = 'fr';
    const { locale } = await resoudre('en');
    expect(locale).toBe('en');
  });

  it('un Accept-Language français non plus', async () => {
    etat.acceptLanguage = 'fr-FR,fr;q=0.9';
    const { locale } = await resoudre('en');
    expect(locale).toBe('en');
  });

  it('les deux à la fois non plus', async () => {
    etat.cookie = 'fr';
    etat.acceptLanguage = 'fr-FR,fr;q=0.9';
    const { locale } = await resoudre('wo');
    expect(locale).toBe('wo');
  });
});

describe('hors de [locale] — la console, /auth, /onboarding : le cookie reprend la main', () => {
  it('suit le cookie quand l’URL ne porte pas de langue', async () => {
    etat.cookie = 'wo';
    const { locale } = await resoudre(undefined);
    expect(locale).toBe('wo');
  });

  it('à défaut, Accept-Language', async () => {
    etat.acceptLanguage = 'en-US,en;q=0.9';
    const { locale } = await resoudre(undefined);
    expect(locale).toBe('en');
  });

  it('à défaut de tout, le français', async () => {
    const { locale } = await resoudre(undefined);
    expect(locale).toBe('fr');
  });

  it('un segment qui n’est pas une langue connue ne devient pas la locale', async () => {
    etat.cookie = 'en';
    const { locale } = await resoudre('zz');
    expect(locale).toBe('en');
  });
});
