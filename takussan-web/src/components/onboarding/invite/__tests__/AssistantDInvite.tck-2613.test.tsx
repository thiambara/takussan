/**
 * TCK-2613 — la barre des assistants d'invité dit « Rejoindre {agence} » et ÉCRIT « Étape n sur 2 » (ticket,
 * Direction UX ; maquette `app-entree-assistants` a) ; tant que le brouillon n'est pas relu, aucun avancement.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoqueDEntree, type LibellesDeLaCoque } from '@/components/entree/CoqueDEntree';
import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { AssistantDInvite } from '../AssistantDInvite';

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

function monter(etape: number, pret: boolean) {
  render(
    withIntl(
      <CoqueDEntree libelles={LIBELLES} sortie={{ href: '/app', forme: 'quitter' }} largeur="assistant">
        <AssistantDInvite etape={etape} agence="Dakar Immo" pret={pret}>
          <p>écran</p>
        </AssistantDInvite>
      </CoqueDEntree>,
    ),
  );
}

describe('AssistantDInvite — la barre (TCK-2613)', () => {
  it.each([
    [0, 'Étape 1 sur 2'],
    [1, 'Étape 2 sur 2'],
  ])('écran %i : « Rejoindre Dakar Immo » et « %s » écrit, au téléphone comme au bureau', (etape, attendu) => {
    monter(etape, true);
    expect(screen.getAllByText('Rejoindre Dakar Immo')).toHaveLength(2);
    const ecrits = Array.from(document.querySelectorAll('[data-avancement-ecrit]')).map((n) => n.textContent);
    expect(ecrits).toEqual([attendu, attendu]);
  });

  it('brouillon pas encore relu : aucun avancement, ni écrit ni en pastilles', () => {
    monter(0, false);
    expect(document.querySelector('[data-avancement-ecrit]')).toBeNull();
    expect(screen.queryByRole('img', { name: /Étape/ })).toBeNull();
  });
});
