/**
 * TCK-2589 (maquette a-1, décision 3a) — la forme « ligne » de `CustomerTagPicker`, sur la carte du
 * référent de la fiche client : au repos « icône · pastilles · + Étiquette », sans champ ni croix ;
 * « + Étiquette » ouvre le champ (le curseur y va) et les pastilles retirables ; « Terminé » ou Échap
 * le referment. La forme par défaut (le champ toujours ouvert) ne change pas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CustomerTagPicker } from '../CustomerTagPicker';
import { withIntl } from '@/test/intl';

const actions = vi.hoisted(() => ({ attach: vi.fn(), detach: vi.fn() }));
vi.mock('@/app/actions/dashboard-customers', () => ({
  attachCustomerTagsAction: (...a: unknown[]) => actions.attach(...a),
  detachCustomerTagAction: (...a: unknown[]) => actions.detach(...a),
}));

const MEUBLE = { id: 1, name: 'meublé', slug: 'meuble-x1', color: null };

beforeEach(() => {
  actions.attach.mockReset();
  actions.detach.mockReset();
});

describe('CustomerTagPicker — forme « ligne »', () => {
  it('au repos : les pastilles et « + Étiquette », ni champ ni croix ; une pastille filtre la liste', async () => {
    const filtrer = vi.fn();
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" onTagClick={filtrer} />));

    const ligne = screen.getByRole('group', { name: 'Étiquettes' });
    expect(ligne).toHaveTextContent('meublé');
    expect(screen.getByRole('button', { name: 'Ajouter une étiquette' })).toHaveTextContent('+ Étiquette');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Voir les clients tagués meublé' }));
    expect(filtrer).toHaveBeenCalledWith('meublé');
  });

  it('« + Étiquette » ouvre le champ, le curseur dedans, et les pastilles retirables', async () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));

    const champ = screen.getByRole('textbox', { name: 'Ajouter un tag au client' });
    expect(champ).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Retirer le tag meublé' })).toBeInTheDocument();
  });

  it('une étiquette ajoutée reste dans la ligne refermée par « Terminé »', async () => {
    actions.attach.mockResolvedValue({ ok: true, data: [MEUBLE, { id: 2, name: 'vue mer', slug: 'vue-mer-x1', color: null }] });
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.type(screen.getByRole('textbox'), 'vue mer{Enter}');
    await waitFor(() => expect(actions.attach).toHaveBeenCalledWith(7, ['vue mer']));
    await screen.findByText('vue mer');

    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Étiquettes' })).toHaveTextContent('vue mer');
  });

  it('Échap referme le champ', async () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajouter une étiquette' })).toBeInTheDocument();
  });

  it('un refus se dit aussi dans la ligne refermée', async () => {
    actions.detach.mockResolvedValue({ ok: false, message: 'Refusé par le serveur' });
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le tag meublé' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé par le serveur');
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Refusé par le serveur');
  });

  it('la forme par défaut ne change pas : le champ ouvert, sans « + Étiquette » ni « Terminé »', () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} />));
    expect(screen.getByRole('textbox', { name: 'Ajouter un tag au client' })).not.toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Ajouter une étiquette' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Terminé' })).toBeNull();
  });
});
