/**
 * TCK-2589 (maquette a-1, décision 3a) — la forme « ligne » de `CustomerTagPicker`, sur la carte du
 * référent de la fiche client : au repos « icône · pastilles · + Étiquette », sans champ ni croix ;
 * « + Étiquette » ouvre le champ (le curseur y va) et les pastilles retirables ; « Terminé » ou Échap
 * le referment. La forme par défaut (le champ toujours ouvert) ne change pas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Voir les clients avec l’étiquette meublé' }));
    expect(filtrer).toHaveBeenCalledWith('meublé');
  });

  it('« + Étiquette » ouvre le champ, le curseur dedans, et les pastilles retirables', async () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));

    const champ = screen.getByRole('combobox', { name: 'Ajouter une étiquette au client' });
    expect(champ).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Retirer l’étiquette meublé' })).toBeInTheDocument();
  });

  it('une étiquette ajoutée reste dans la ligne refermée par « Terminé »', async () => {
    actions.attach.mockResolvedValue({ ok: true, data: [MEUBLE, { id: 2, name: 'vue mer', slug: 'vue-mer-x1', color: null }] });
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.type(screen.getByRole('combobox'), 'vue mer{Enter}');
    await waitFor(() => expect(actions.attach).toHaveBeenCalledWith(7, ['vue mer']));
    await screen.findByText('vue mer');

    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Étiquettes' })).toHaveTextContent('vue mer');
  });

  it('Échap referme le champ', async () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajouter une étiquette' })).toBeInTheDocument();
  });

  it('un refus se dit aussi dans la ligne refermée', async () => {
    actions.detach.mockResolvedValue({ ok: false, message: 'Refusé par le serveur' });
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retirer l’étiquette meublé' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé par le serveur');
    await userEvent.click(screen.getByRole('button', { name: 'Terminé' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Refusé par le serveur');
  });

  it('Échap rend le focus à « + Étiquette » (il tombait sur body)', async () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Ajouter une étiquette' })).toHaveFocus();
  });

  it('« Terminé » au clavier rend le focus à « + Étiquette »', async () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} forme="ligne" />));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
    screen.getByRole('button', { name: 'Terminé' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajouter une étiquette' })).toHaveFocus();
  });

  it('la forme par défaut ne change pas : le champ ouvert, sans « + Étiquette » ni « Terminé »', () => {
    render(withIntl(<CustomerTagPicker customerId={7} initialTags={[MEUBLE]} />));
    expect(screen.getByRole('combobox', { name: 'Ajouter une étiquette au client' })).not.toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Ajouter une étiquette' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Terminé' })).toBeNull();
  });
});

const VUE = { id: 2, name: 'vue mer', slug: 'vue-mer-x1', color: null };
const SUGGESTIONS = [
  { id: 10, name: 'vue mer', slug: 'vue-mer-x1', color: null },
  { id: 11, name: 'vue dégagée', slug: 'vue-degagee-x1', color: null },
];

/** Ouvre le champ de la forme demandée (la ligne passe par « + Étiquette »). */
async function champ(forme: 'ligne' | 'champ', initialTags = [MEUBLE, VUE]) {
  render(withIntl(<CustomerTagPicker customerId={7} initialTags={initialTags} suggestions={SUGGESTIONS} forme={forme} />));
  if (forme === 'ligne') await userEvent.click(screen.getByRole('button', { name: 'Ajouter une étiquette' }));
  return screen.getByRole('combobox', { name: 'Ajouter une étiquette au client' });
}

describe.each(['ligne', 'champ'] as const)('CustomerTagPicker au clavier — forme « %s » (contre-vérification de TCK-2589)', (forme) => {
  it('retirer une pastille rend le focus à sa voisine, puis au champ quand il n’en reste plus', async () => {
    actions.detach.mockResolvedValue({ ok: true });
    await champ(forme);
    screen.getByRole('button', { name: 'Retirer l’étiquette meublé' }).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retirer l’étiquette meublé' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirer l’étiquette vue mer' })).toHaveFocus());

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retirer l’étiquette vue mer' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });

  it('un retrait refusé rend le focus à la croix de la pastille, toujours là', async () => {
    actions.detach.mockResolvedValue({ ok: false, message: 'Refusé par le serveur' });
    await champ(forme);
    const croix = screen.getByRole('button', { name: 'Retirer l’étiquette meublé' });
    croix.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé par le serveur');
    await waitFor(() => expect(croix).toHaveFocus());
  });

  it('une suggestion se choisit aux flèches et à Entrée — Entrée ne prend pas la saisie partielle', async () => {
    let finir: (v: unknown) => void = () => {};
    actions.attach.mockReturnValue(new Promise((r) => { finir = r; }));
    const saisie = await champ(forme, []);
    await userEvent.type(saisie, 'vu');
    expect(saisie).toHaveAttribute('aria-expanded', 'true');
    expect(saisie).not.toHaveAttribute('aria-activedescendant');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const designee = screen.getByRole('option', { name: 'vue dégagée' });
    expect(designee).toHaveAttribute('aria-selected', 'true');
    expect(saisie).toHaveAttribute('aria-activedescendant', designee.id);
    expect(saisie).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(actions.attach).toHaveBeenCalledTimes(1));
    expect(actions.attach).toHaveBeenCalledWith(7, ['vue dégagée']);
    // Le champ est désactivé pendant l'envoi : le navigateur lui retire le focus, ce que jsdom ne fait
    // pas — un leurre le prend à sa place. L'envoi fini, le curseur revient dans le champ.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeDisabled());
    const leurre = document.body.appendChild(document.createElement('button'));
    act(() => leurre.focus());
    expect(leurre).toHaveFocus();
    await act(async () => finir({ ok: true, data: [{ id: 11, name: 'vue dégagée', slug: 'vue-degagee-x1', color: null }] }));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
    leurre.remove();
  });

  it('les flèches tournent ; sans suggestion désignée, Entrée prend la saisie', async () => {
    actions.attach.mockResolvedValue({ ok: true, data: [{ id: 12, name: 'vu', slug: 'vu-x1', color: null }] });
    const saisie = await champ(forme, []);
    await userEvent.type(saisie, 'vu');
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('option', { name: 'vue dégagée' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'vue mer' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.type(saisie, ' ');
    await userEvent.keyboard('{Backspace}');
    expect(saisie).not.toHaveAttribute('aria-activedescendant');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(actions.attach).toHaveBeenCalledWith(7, ['vu']));
  });
});
