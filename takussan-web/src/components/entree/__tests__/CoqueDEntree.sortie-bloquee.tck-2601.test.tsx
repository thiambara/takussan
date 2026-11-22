/**
 * TCK-2601 (AC5) — `sortieBloquee` : la page tient une tâche à finir à côté de la barre (le panneau de
 * compte de `/publish` au bureau, ses écritures). « Quitter », « ✕ » et la marque sont annoncés
 * désactivés, sortent de la tabulation, et leur clic ne mène nulle part — pas même à la confirmation
 * de sortie. Levé, tout revient. Harnais de `CoqueDEntree.tck-2598.test.tsx`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

import { CoqueDEntree, DeclarerEntree, type LibellesDeLaCoque } from '../CoqueDEntree';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/onboarding/intention',
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

// Un vrai `<a>` : le lien de Next sans routeur monté n'est pas l'objet du test.
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const C = frMessages.coqueDEntree;

const LIBELLES: LibellesDeLaCoque = {
  marque: 'Takussan',
  retourAuSite: C.retourAuSite,
  fermer: C.fermer,
  quitter: C.quitter,
  avancement: C.avancement,
  sortie: C.sortie,
};

/** Les clics de LIEN qui atteignent le document, et s'ils étaient annulés (une navigation retenue). */
let clics: { href: string | null; annule: boolean }[] = [];
function enregistrer(evenement: MouseEvent) {
  const lien = (evenement.target as Element).closest('a');
  if (!lien) return;
  clics.push({ href: lien.getAttribute('href'), annule: evenement.defaultPrevented });
  evenement.preventDefault(); // jsdom ne navigue pas : on évite son avertissement.
}

beforeEach(() => {
  clics = [];
  window.addEventListener('click', enregistrer);
});
afterEach(() => {
  window.removeEventListener('click', enregistrer);
});

function Page({ bloquee }: { readonly bloquee: boolean }) {
  return (
    <CoqueDEntree libelles={LIBELLES} titre="Publier votre bien" sortie={{ href: '/', forme: 'quitter' }}>
      <DeclarerEntree saisie sortieBloquee={bloquee} />
    </CoqueDEntree>
  );
}

describe('la sortie bloquée (TCK-2601, AC5)', () => {
  it('bloquée : « Quitter », « ✕ » et la marque inertes, aucun clic ne part ni n’ouvre la confirmation ; levée, la sortie reprend', () => {
    const { rerender } = render(withIntl(<Page bloquee />));
    const sorties = [
      screen.getByRole('link', { name: 'Quitter' }),
      screen.getByRole('link', { name: 'Fermer' }),
      ...screen.getAllByRole('link', { name: 'Takussan' }),
    ];
    for (const lien of sorties) {
      expect(lien).toHaveAttribute('aria-disabled', 'true');
      expect(lien).toHaveAttribute('tabindex', '-1');
      fireEvent.click(lien);
    }
    expect(clics.every((c) => c.annule)).toBe(true);
    expect(clics).toHaveLength(sorties.length);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    clics = [];
    rerender(withIntl(<Page bloquee={false} />));
    const quitter = screen.getByRole('link', { name: 'Quitter' });
    expect(quitter).not.toHaveAttribute('aria-disabled');
    // TCK-2598 (r1) — levée, la marque redevient une sortie GARDÉE : une saisie existe, elle demande
    // (elle sortait sans demander, et ce test l'acceptait).
    for (const marque of screen.getAllByRole('link', { name: 'Takussan' })) {
      expect(marque).not.toHaveAttribute('aria-disabled');
      fireEvent.click(marque);
      expect(screen.getByText(C.sortie.titre)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: C.sortie.rester }));
    }
    expect(clics.every((c) => c.annule)).toBe(true);
    fireEvent.click(quitter);
    // Une saisie existe : la sortie demande confirmation, comme avant.
    expect(clics.at(-1)?.annule).toBe(true);
    expect(screen.getByText(C.sortie.titre)).toBeInTheDocument();
  });
});
