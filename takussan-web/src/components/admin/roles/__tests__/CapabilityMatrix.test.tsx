import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CapabilityMatrix } from '../CapabilityMatrix';
import type { CapabilityCatalogue } from '@/types/agency-role';

/**
 * Catalogue réduit, mais de la MÊME forme que `GET /api/capabilities` :
 * `platform_reserved` à côté de `domains`, pas dedans.
 */
const CATALOGUE: CapabilityCatalogue = {
  domains: [
    { domain: 'properties', capabilities: ['properties.create', 'properties.publish', 'properties.moderate'] },
    { domain: 'team', capabilities: ['team.invite', 'team.assign_role'] },
  ],
  total: 5,
  platform_reserved: ['properties.moderate'],
};

function box(capability: string): HTMLInputElement {
  const label = screen.getByText(capability).closest('label');
  if (!label) throw new Error(`Aucun libellé pour ${capability}`);
  return within(label).getByRole('checkbox') as HTMLInputElement;
}

describe('<CapabilityMatrix>', () => {
  it('grise les capacités réservées à la plateforme au lieu de les masquer', () => {
    render(
      withIntl(
        <CapabilityMatrix catalogue={CATALOGUE} value={[]} onChange={vi.fn()} />,
      ),
    );

    // Visible — la masquer laisserait sans réponse « pourquoi je n'ai pas
    // cette capacité ? ».
    expect(screen.getByText('properties.moderate')).toBeInTheDocument();
    expect(box('properties.moderate')).toBeDisabled();
    expect(box('properties.create')).toBeEnabled();
    expect(screen.getByText('Réservé à la plateforme')).toBeInTheDocument();
  });

  it("n'émet jamais une capacité réservée, même sur un clic direct", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      withIntl(
        <CapabilityMatrix catalogue={CATALOGUE} value={[]} onChange={onChange} />,
      ),
    );

    await user.click(box('properties.moderate'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('« Tout cocher » exclut les réservées plateforme', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      withIntl(
        <CapabilityMatrix catalogue={CATALOGUE} value={[]} onChange={onChange} />,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Tout cocher' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as string[];
    expect(emitted).not.toContain('properties.moderate');
    expect(emitted).toEqual(
      expect.arrayContaining(['properties.create', 'properties.publish', 'team.invite', 'team.assign_role']),
    );
  });

  it('compte « x sur y » sur les seules capacités attribuables', () => {
    render(
      withIntl(
        <CapabilityMatrix
          catalogue={CATALOGUE}
          value={['properties.create', 'properties.publish', 'team.invite', 'team.assign_role']}
          onChange={vi.fn()}
        />,
      ),
    );

    // 4 attribuables sur 5 au catalogue : `properties.moderate` est hors
    // du dénominateur, sinon le compteur plafonnerait à 4/5 pour un rôle
    // qui a pourtant tout ce qu'il PEUT avoir.
    expect(screen.getByTestId('capability-matrix-count')).toHaveTextContent(
      '4 sur 4 capacités accordées',
    );
  });

  it('bascule une capacité et rend la liste complète, pas le delta', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      withIntl(
        <CapabilityMatrix
          catalogue={CATALOGUE}
          value={['properties.create']}
          onChange={onChange}
        />,
      ),
    );

    await user.click(box('team.invite'));
    // `PUT .../capabilities` est un REMPLACEMENT : envoyer le seul ajout
    // effacerait tout le reste.
    expect(onChange).toHaveBeenCalledWith(['properties.create', 'team.invite']);
  });

  it('rend tout non modifiable en lecture seule, et retire les raccourcis', () => {
    render(
      withIntl(
        <CapabilityMatrix
          catalogue={CATALOGUE}
          value={['properties.create']}
          onChange={vi.fn()}
          readOnly
        />,
      ),
    );

    expect(box('properties.create')).toBeDisabled();
    expect(box('team.invite')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Tout cocher' })).not.toBeInTheDocument();
  });

  it('replie un domaine sans toucher aux valeurs cochées', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <CapabilityMatrix
          catalogue={CATALOGUE}
          value={['team.invite']}
          onChange={vi.fn()}
        />,
      ),
    );

    const toggle = screen.getByRole('button', { name: /domaine Équipe/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('team.invite')).not.toBeInTheDocument();
    // Le compteur global ne bouge pas : replier n'est pas décocher.
    expect(screen.getByTestId('capability-matrix-count')).toHaveTextContent(
      '1 sur 4 capacités accordées',
    );
  });

  it('retombe sur la valeur brute pour une capacité absente du dictionnaire', () => {
    render(
      withIntl(
        <CapabilityMatrix
          catalogue={{
            domains: [{ domain: 'quantum', capabilities: ['quantum.entangle'] }],
            total: 1,
            platform_reserved: [],
          }}
          value={[]}
          onChange={vi.fn()}
        />,
      ),
    );

    // Un 45ᵉ cas ajouté au catalogue côté serveur ne doit pas faire tomber
    // l'écran en attendant sa traduction.
    expect(screen.getAllByText('quantum.entangle').length).toBeGreaterThan(0);
    expect(screen.getByText('quantum')).toBeInTheDocument();
  });
});
