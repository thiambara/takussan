import type { Metadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));

/**
 * TCK-926 (P34.05) — un passage interdit aux robots déclare AUSSI `noindex`.
 *
 * `Disallow` empêche l'exploration, pas l'indexation : une URL interdite mais liée de l'extérieur
 * peut rester dans un index, sans description (en-tête de `src/app/robots.ts`). `/app` et `/auth`
 * portaient déjà `noindex` ; ces cinq-là non, et `/publish` n'avait ni l'un ni l'autre sur
 * `master`. Le test lit la métadonnée que Next sert, pas le texte du fichier.
 */
type Module = { metadata?: Metadata; generateMetadata?: () => Promise<Metadata> };

const PASSAGES: Record<string, () => Promise<Module>> = {
  '/publish': () => import('../publish/layout'),
  '/onboarding': () => import('../onboarding/layout'),
  '/invitations': () => import('../invitations/layout'),
  '/maintenance': () => import('../maintenance/page'),
  '/super-admin': () => import('../(super-admin)/super-admin/layout'),
};

describe('noindex des passages interdits — TCK-926', () => {
  it.each(Object.keys(PASSAGES))('%s déclare robots: { index: false, follow: false }', async (passage) => {
    const charge = await PASSAGES[passage]!();
    const metadonnees = charge.generateMetadata ? await charge.generateMetadata() : charge.metadata;
    expect(metadonnees?.robots).toEqual({ index: false, follow: false });
  });
});
