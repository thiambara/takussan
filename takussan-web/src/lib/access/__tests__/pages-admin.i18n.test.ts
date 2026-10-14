import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { PAGES_ADMIN } from '../pages-admin';

/**
 * TCK-633 (lot B) — chaque libellé que la table ou les composants du lot demandent existe dans les
 * TROIS langues. `check:i18n` vérifie la parité ; ce test vérifie que la parité porte sur les clés
 * que le code lit vraiment.
 */
type Dico = {
  nav: { admin: Record<string, unknown> };
  profile: { admin: Record<string, unknown> };
};
const DICOS: Record<'fr' | 'en' | 'wo', Dico> = { fr, en, wo };

const NAV_ADMIN = ['sectionLabel', 'mySpace', 'openMySpace'];
const PROFILE_ADMIN = [
  'title',
  'subtitle',
  'roleLabel',
  'manageAgency',
  'auditLog',
  'adminSpace',
  'titleIndividual',
  'subtitleIndividual',
  'roleLabelIndividual',
  'roleIndividual',
];

describe.each(Object.entries(DICOS))('libellés du lot B — %s', (_langue, dico) => {
  it('nav.admin porte l’entrée et chaque entrée de menu de la table', () => {
    const cles = [...NAV_ADMIN, ...PAGES_ADMIN.flatMap((p) => (p.menu ? [p.menu.cle] : []))];
    for (const cle of cles) expect(typeof dico.nav.admin[cle], `nav.admin.${cle}`).toBe('string');
  });

  it('profile.admin porte la carte, dans ses deux variantes', () => {
    for (const cle of PROFILE_ADMIN) expect(typeof dico.profile.admin[cle], `profile.admin.${cle}`).toBe('string');
  });
});
