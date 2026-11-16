import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import { ceQuIlReste, completudeDeLaFiche, faitsDeLaFiche, type FaitsDeLaFiche } from '../completude-de-la-fiche';

/**
 * TCK-2862 — la complétude de la fiche publique : cinq critères de 20 % (photo, présentation, une
 * langue, cinq quartiers, téléphone vérifié), et « Il vous reste » qui nomme ce qui manque.
 */
const COMPLETE: FaitsDeLaFiche = { photo: true, presentation: true, langues: 2, quartiers: 5, telephoneVerifie: true };

describe('TCK-2862 — completudeDeLaFiche', () => {
  it('AC1 — photo, présentation, une langue, 2 quartiers sur 5, téléphone non vérifié : 60 %, il reste 3 quartiers et le numéro', () => {
    const c = completudeDeLaFiche({ ...COMPLETE, langues: 1, quartiers: 2, telephoneVerifie: false });
    expect(c.pourcentage).toBe(60);
    expect(c.manquants).toEqual([{ id: 'quartiers', restant: 3 }, { id: 'telephone' }]);
  });

  it('les cinq critères remplis : 100 %, rien ne manque', () => {
    expect(completudeDeLaFiche(COMPLETE)).toEqual({ pourcentage: 100, manquants: [] });
  });

  it('rien de rempli : 0 %, les cinq critères manquent', () => {
    const c = completudeDeLaFiche({ photo: false, presentation: false, langues: 0, quartiers: 0, telephoneVerifie: false });
    expect(c.pourcentage).toBe(0);
    expect(c.manquants.map((m) => m.id).sort()).toEqual(['langue', 'photo', 'presentation', 'quartiers', 'telephone']);
  });

  it('un numéro renseigné mais non vérifié, une présentation faite d’espaces : ne comptent pas', () => {
    const f = faitsDeLaFiche({ avatar_url: 'x.jpg', bio: '   ', phone: '+221770000000', phone_verified_at: null }, { languages: ['fr'], neighborhood_ids: [1, 2, 3, 4, 5] });
    expect(f).toEqual({ photo: true, presentation: false, langues: 1, quartiers: 5, telephoneVerifie: false });
    expect(completudeDeLaFiche(f).pourcentage).toBe(60);
  });
});

describe('TCK-2862 — « Il vous reste »', () => {
  it('fr : « 3 quartiers et votre numéro vérifié »', () => {
    const t = createTranslator({ locale: 'fr', messages: fr, namespace: 'profile.completude.manque' });
    const { manquants } = completudeDeLaFiche({ ...COMPLETE, quartiers: 2, telephoneVerifie: false });
    expect(ceQuIlReste(manquants, (c, v) => t(c as never, v as never), 'fr')).toBe('3 quartiers et votre numéro vérifié');
  });

  it('en : a single neighbourhood left', () => {
    const t = createTranslator({ locale: 'en', messages: en, namespace: 'profile.completude.manque' });
    const { manquants } = completudeDeLaFiche({ ...COMPLETE, quartiers: 4 });
    expect(ceQuIlReste(manquants, (c, v) => t(c as never, v as never), 'en')).toBe('1 neighbourhood');
  });
});
