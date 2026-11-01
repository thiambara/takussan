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

  // Vérification adverse M-5 — `hrefConnexion` emporte le jeton dans `?redirect=` de `/auth/login`.
  it('les pages de connexion qui portent le jeton en redirect posent aussi no-referrer, et elles seules', async () => {
    const regles = (await nextConfig.headers?.()) ?? [];
    const regle = regles.find((r) => r.source === '/auth/:path*');
    expect(regle?.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
    const condition = regle?.has?.find((h) => h.type === 'query' && h.key === 'redirect');
    // Le motif tel que Next le juge : ancré, sur la valeur décodée (`prepare-destination.js`, `matchHas`).
    const motif = new RegExp(`^${condition && 'value' in condition ? condition.value : '(?!)'}$`);
    expect(motif.test('/fr/claim/12.1700000000.abc')).toBe(true);
    expect(motif.test('/claim/12.1700000000.abc')).toBe(true);
    expect(motif.test('/fr/properties')).toBe(false);
    expect(motif.test('/app/claims')).toBe(false);
  });
});
