import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

import fr from '@/messages/fr.json';
import nextConfig from '../../../../../../../next.config';
import { generateMetadata } from '../page';

/**
 * TCK-2390 (ADR-0077 §3) — la page de réclamation ne s'indexe pas et ne transmet pas son URL : le
 * jeton signé est le droit de recevoir le code et de publier. La balise pour le HTML, l'en-tête pour
 * toute réponse du chemin, redirection du proxy comprise.
 */
describe('/claim/{jeton} — robots et Referrer-Policy', () => {
  it('la page se retire de l’index et pose referrer no-referrer', async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.referrer).toBe('no-referrer');
    expect(meta.title).toBe(fr.radarClaim.metaTitle);
  });

  it.each(['/claim/:path*', '/:locale/claim/:path*'])('l’en-tête Referrer-Policy: no-referrer couvre %s', async (source) => {
    const regles = (await nextConfig.headers?.()) ?? [];
    const regle = regles.find((r) => r.source === source);
    expect(regle?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
  });
});
