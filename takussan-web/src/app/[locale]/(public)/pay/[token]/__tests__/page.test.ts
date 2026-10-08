import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

import fr from '@/messages/fr.json';
import nextConfig from '../../../../../../../next.config';
import { generateMetadata } from '../page';

/**
 * TCK-602 (ADR-0051 §1, AC21) — la page du lien de paiement ne s'indexe pas et ne transmet pas
 * son URL : la balise (`generateMetadata`) pour le HTML, l'en-tête (`next.config.ts`) pour toute
 * réponse du chemin, redirection du proxy comprise.
 */
describe('/pay/{jeton} — robots et Referrer-Policy (AC21)', () => {
  it('la page se retire de l’index et pose referrer no-referrer', async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.referrer).toBe('no-referrer');
    expect(meta.title).toBe(fr.payLink.metaTitle);
  });

  it.each(['/pay/:path*', '/:locale/pay/:path*'])('l’en-tête Referrer-Policy: no-referrer couvre %s', async (source) => {
    const regles = (await nextConfig.headers?.()) ?? [];
    const regle = regles.find((r) => r.source === source);
    expect(regle?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  });
});
