import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { ContactSheet } from '../ContactSheet';

vi.mock('@/app/actions/property', () => ({ submitAgentContactLead: vi.fn() }));

function monte(ui: React.ReactElement) {
  return render(withIntl(<ToastProvider>{ui}</ToastProvider>));
}

/**
 * TCK-1078 (P85.05) — sans courriel, sans téléphone et sans `agentSlug`, aucun bouton.
 *
 * Sur grand écran, chaque bouton est déjà conditionnel. Sur mobile, le déclencheur « Contacter »
 * était rendu sans condition et ouvrait un volet vide : c'est le cas de la fiche d'un espace
 * `individual`, dont l'agence naît sans courriel ni téléphone. Le second test garde l'autre sens :
 * une seule action suffit à rendre le déclencheur mobile.
 */
describe('ContactSheet — TCK-1078', () => {
  it("ne rend aucun bouton quand aucune action n'existe", () => {
    monte(<ContactSheet name="Espace de Awa" email={null} phone={null} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('rend le déclencheur mobile dès qu’une action existe', () => {
    const { rerender } = monte(<ContactSheet name="Dakar Immo" email="contact@dakar-immo.sn" />);
    expect(screen.getByRole('button', { name: 'Contacter' })).toBeInTheDocument();

    rerender(withIntl(<ToastProvider><ContactSheet name="Dakar Immo" phone="+221 33 000 00 00" /></ToastProvider>));
    expect(screen.getByRole('button', { name: 'Contacter' })).toBeInTheDocument();

    rerender(withIntl(<ToastProvider><ContactSheet name="Awa Diop" agentSlug="awa-diop" /></ToastProvider>));
    expect(screen.getAllByRole('button', { name: 'Contacter' }).length).toBeGreaterThan(0);
  });
});
