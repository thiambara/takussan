/**
 * TCK-2613 — « Étape 1 sur 2 » ÉCRIT dans la barre des assistants d'invité (maquette `app-entree-assistants` a :
 * sous l'intention au téléphone, à côté des pastilles au bureau). Opt-in (`avancementEcrit`) : les autres pages
 * de la coque (connexion, orientation, publication) gardent les pastilles seules, dont le libellé reste le nom
 * accessible — le texte écrit est masqué aux lecteurs d'écran, qui l'entendraient deux fois.
 *
 * jsdom n'applique pas Tailwind : la barre du téléphone (`lg:hidden`) et celle du bureau (`hidden lg:flex`) sont
 * toutes deux dans le DOM, et se distinguent par leurs classes.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { afficheA } from '@/test/affiche-a';

import { CoqueDEntree, DeclarerEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

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

function monter(ecrit: boolean) {
  render(
    <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/app', forme: 'quitter' }} largeur="assistant">
      <DeclarerEntree titre="Rejoindre Dakar Immo" titreDeBureau="Rejoindre Dakar Immo" pas={1} total={2} avancementEcrit={ecrit} />
      <p>écran</p>
    </CoqueDEntree>,
  );
}

const barres = () => {
  const [telephone, bureau] = screen.getAllByRole('banner').filter((b) => b.className.includes('h-14') || b.className.includes('h-16'));
  return { telephone: telephone!, bureau: bureau! };
};

describe('CoqueDEntree — l’avancement écrit (TCK-2613)', () => {
  it('écrit « Étape 1 sur 2 » sous l’intention au téléphone et à côté des pastilles au bureau', () => {
    monter(true);
    const { telephone, bureau } = barres();
    expect(afficheA(telephone, 390)).toBe(true);
    expect(afficheA(bureau, 1280)).toBe(true);
    for (const barre of [telephone, bureau]) {
      const ecrit = Array.from(barre.querySelectorAll('[data-avancement-ecrit]'));
      expect(ecrit).toHaveLength(1);
      expect(ecrit[0]!.textContent).toBe('Étape 1 sur 2');
      // Le nom accessible reste celui des pastilles : le texte écrit ne se lit pas deux fois.
      expect(ecrit[0]!.getAttribute('aria-hidden')).toBe('true');
      expect(barre.querySelector('[role="img"][aria-label="Étape 1 sur 2"]')).not.toBeNull();
    }
    // Au téléphone, l’étape est SOUS l’intention, dans le même bloc.
    const intention = Array.from(telephone.querySelectorAll('p')).find((p) => p.textContent === 'Rejoindre Dakar Immo')!;
    expect(intention.parentElement!.contains(telephone.querySelector('[data-avancement-ecrit]'))).toBe(true);
  });

  it('sans la déclaration, la barre ne montre que les pastilles (les autres pages de la coque)', () => {
    monter(false);
    expect(document.querySelector('[data-avancement-ecrit]')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Étape 1 sur 2' }).length).toBeGreaterThan(0);
  });
});
