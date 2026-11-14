/**
 * TCK-2613 — `avancementEcrit` est opt-in : une page qui ne le déclare pas rend EXACTEMENT ce qu'elle rendait avant.
 *
 * Les instantanés de ce fichier ont été écrits par la coque d'AVANT TCK-2613 (HEAD 68f1b3d04, `CoqueDEntree.tsx`
 * remis le temps d'un `vitest -u`, md5 restauré), puis rejoués sans `-u` sur la coque d'après : verts. Ils figent
 * le DOM entier de la coque (barre du téléphone, barre du bureau, colonne, pied) dans les formes qu'emploient les
 * autres pages — connexion et invitation (`retour-au-site`), publication (`quitter`, `titreDeBureau`), orientation
 * (la marque seule) — et `avancementEcrit={false}` déclaré à la main.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';

import { CoqueDEntree, DeclarerEntree, type DeclarationDEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/onboarding/owner',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const C = frMessages.coqueDEntree;
const LIBELLES: LibellesDeLaCoque = { marque: 'Takussan', retourAuSite: C.retourAuSite, fermer: C.fermer, quitter: C.quitter, avancement: C.avancement, sortie: C.sortie };

const CAS: readonly [string, 'retour-au-site' | 'quitter', DeclarationDEntree & Record<string, unknown>][] = [
  ['retour au site, intention et avancement', 'retour-au-site', { titre: 'Rejoindre Dakar Immo', pas: 1, total: 2 }],
  ['quitter, intention et avancement', 'quitter', { titre: 'Rejoindre Dakar Immo', pas: 2, total: 2 }],
  ['quitter, titre du bureau distinct', 'quitter', { titre: 'Publier votre bien', titreDeBureau: 'Publier · Studio meublé', pas: 3, total: 5 }],
  ['marque seule, avancement sans intention', 'retour-au-site', { pas: 1, total: 3 }],
  ['avancementEcrit={false} déclaré', 'quitter', { titre: 'Rejoindre Dakar Immo', pas: 1, total: 2, avancementEcrit: false }],
];

describe('CoqueDEntree — sans `avancementEcrit`, le rendu d’avant (TCK-2613)', () => {
  it.each(CAS)('%s', (_nom, forme, declaration) => {
    const { container } = render(
      <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/app', forme }} largeur="assistant">
        <DeclarerEntree {...declaration} />
        <p>écran</p>
      </CoqueDEntree>,
    );
    expect(container.innerHTML).toMatchSnapshot();
  });
});
