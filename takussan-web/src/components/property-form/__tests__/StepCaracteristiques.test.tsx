import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, useWatch, type Control } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';
import { StepCaracteristiques } from '../wizard/steps/StepCaracteristiques';

/**
 * TCK-464 — AC2 / AC3 : l'étape des caractéristiques ne DÉCIDE rien, elle interroge la matrice.
 *
 * Ces tests portent sur la conséquence visible de cette délégation, pas sur son mécanisme : ce
 * qui compte est qu'un terrain n'affiche pas de champ « Chambres », quelle que soit la façon dont
 * la règle est écrite. Si un jour quelqu'un réécrit la condition en clair dans le composant, ces
 * tests restent verts — c'est le rôle de la relecture, pas du test — mais si la règle DIVERGE de
 * `field-matrix.ts`, ils rougissent.
 */
const TAGS: Tag[] = [
  { id: 1, name: 'WiFi', slug: 'wifi', type: 'amenity', icon: null, color: null, description: null },
  { id: 2, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null, description: null },
];

/** Ce que le formulaire retient — lu par `useWatch`, rendu pour être asserté. */
function Sonde({ control }: { control: Control<PropertyFormValues> }) {
  const [ids, noms, etage] = useWatch({ control, name: ['tag_ids', 'tag_names', 'floor_number'] });
  return <output data-testid="sonde">{JSON.stringify({ tag_ids: ids, tag_names: noms ?? [], floor_number: etage ?? null })}</output>;
}

function Harnais({
  type,
  contrat = 'sale',
  tagIds = [],
  tags = TAGS,
  etage,
}: {
  type: PropertyFormValues['type'];
  contrat?: PropertyFormValues['contract_type'];
  tagIds?: number[];
  tags?: Tag[];
  etage?: number;
}) {
  const form = useForm<PropertyFormValues>({
    defaultValues: {
      title: '',
      type,
      contract_type: contrat,
      currency: 'XOF',
      city: '',
      furnished: false,
      tag_ids: tagIds,
      tag_names: [] as string[],
      floor_number: etage,
    } as PropertyFormValues,
  });
  return (
    <>
      <StepCaracteristiques form={form} tags={tags} />
      <Sonde control={form.control} />
    </>
  );
}

const sonde = () => JSON.parse(screen.getByTestId('sonde').textContent ?? '{}') as {
  tag_ids: number[]; tag_names: string[]; floor_number: number | null;
};

/** `useWatch` publie APRÈS le rendu qui a écrit : on attend la sonde, on ne la lit pas tout de suite. */
const attendre = (attendu: Partial<ReturnType<typeof sonde>>) =>
  waitFor(() => expect(sonde()).toMatchObject(attendu));

function monter(props: Parameters<typeof Harnais>[0]) {
  return render(withIntl(<Harnais {...props} />));
}

describe('StepCaracteristiques', () => {
  it('AC2 — un TERRAIN ne demande ni chambres, ni salles de bain, ni meublé, ni année', () => {
    monter({ type: 'land' });

    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/salles de bain/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/meublé/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/année de construction/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/places de parking/i)).not.toBeInTheDocument();
  });

  it('AC2 — un TERRAIN demande en revanche son statut foncier', () => {
    monter({ type: 'land' });
    expect(screen.getByRole('group', { name: /statut foncier/i })).toBeInTheDocument();
  });

  it('AC2 — un TERRAIN ne propose aucun équipement domestique', () => {
    monter({ type: 'land' });
    expect(screen.queryByLabelText(/équipements/i)).not.toBeInTheDocument();
  });

  it('AC3 — un APPARTEMENT demande chambres, salles de bain et étage', () => {
    monter({ type: 'apartment' });

    expect(screen.getByLabelText(/chambres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/salles de bain/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^étage/i)).toBeInTheDocument();
  });

  it('AC3 — un APPARTEMENT ne demande pas son nombre de niveaux', () => {
    monter({ type: 'apartment' });
    expect(screen.queryByLabelText(/nombre de niveaux/i)).not.toBeInTheDocument();
  });

  it('une VILLA demande meublé, année de construction et places de parking — les trois champs qu’un TERRAIN n’a pas', () => {
    // Contrepartie POSITIVE du test « un TERRAIN ne demande ni… » ci-dessus : sans elle, une clé
    // renommée, un `<label>` désassocié ou les trois champs purement et simplement supprimés
    // laisseraient les assertions négatives sur `land` vertes.
    monter({ type: 'villa' });

    expect(screen.getByLabelText(/meublé/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/année de construction/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/places de parking/i)).toBeInTheDocument();
  });

  it('une MAISON demande son nombre de niveaux, pas son étage', () => {
    monter({ type: 'house' });

    expect(screen.getByLabelText(/nombre de niveaux/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^étage/i)).not.toBeInTheDocument();
  });

  it('un STUDIO ne demande pas ses chambres — le type les implique', () => {
    monter({ type: 'studio' });

    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/salles de bain/i)).toBeInTheDocument();
  });

  it('un PARKING ne demande pas combien il a de places de parking', () => {
    monter({ type: 'parking' });
    expect(screen.queryByLabelText(/places de parking/i)).not.toBeInTheDocument();
  });

  it('le LIBELLÉ de la surface change avec le type — parcelle ou surface habitable', () => {
    const { unmount } = monter({ type: 'land' });
    expect(screen.getByLabelText(/surface du terrain/i)).toBeInTheDocument();
    unmount();

    monter({ type: 'villa' });
    expect(screen.getByLabelText(/surface habitable/i)).toBeInTheDocument();
  });

  it('la surface est demandée pour TOUS les types — seul son libellé varie', () => {
    monter({ type: 'parking' });
    expect(screen.getByLabelText(/surface/i)).toBeInTheDocument();
  });

  it('les équipements déjà retenus sont VISIBLEMENT retenus — une puce, qu’on peut retirer', () => {
    monter({ type: 'villa', tagIds: [2] });

    expect(screen.getByRole('button', { name: 'Retirer Piscine' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer WiFi' })).not.toBeInTheDocument();
  });

  it('TCK-633 (AC10) — un équipement se CHERCHE, se choisit, puis se retire', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa' });

    await user.type(screen.getByLabelText(/équipements/i), 'pisc');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));
    await user.keyboard('{Escape}');
    await attendre({ tag_ids: [2] });

    await user.click(screen.getByRole('button', { name: 'Retirer Piscine' }));
    await attendre({ tag_ids: [] });
  });

  it('TCK-633 (AC10) — un équipement NOUVEAU s’ajoute par Entrée, tel que saisi, en attente', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa' });

    await user.type(screen.getByLabelText(/équipements/i), 'Groupe électrogène{Enter}');
    await user.keyboard('{Escape}');

    await attendre({ tag_ids: [], tag_names: ['Groupe électrogène'] });
    expect(screen.getByRole('button', { name: 'Retirer Groupe électrogène' }).parentElement)
      .toHaveTextContent(/groupe électrogène.*en attente de vérification/i);
  });

  it('TCK-633 — le champ est rendu même SANS catalogue : on peut toujours ajouter', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa', tags: [] });

    await user.type(screen.getByLabelText(/équipements/i), 'Forage{Enter}');

    await attendre({ tag_names: ['Forage'] });
  });

  it('le statut foncier se désélectionne — il est facultatif', async () => {
    const user = userEvent.setup();
    monter({ type: 'land' });

    const bail = screen.getByRole('button', { name: 'Bail' });
    await user.click(bail);
    expect(bail).toHaveAttribute('aria-pressed', 'true');

    await user.click(bail);
    expect(bail).toHaveAttribute('aria-pressed', 'false');
  });

  it('TCK-508 / AC7 — ni un TERRAIN ni une FERME ne demandent l’état du bien', () => {
    const { unmount } = monter({ type: 'land' });
    expect(screen.queryByRole('group', { name: /état du bien/i })).not.toBeInTheDocument();
    unmount();

    monter({ type: 'farm' });
    expect(screen.queryByRole('group', { name: /état du bien/i })).not.toBeInTheDocument();
  });

  it('TCK-508 — une VILLA demande son état, et il se désélectionne : il est facultatif', async () => {
    // Contrepartie positive du test précédent : sans elle, un groupe supprimé ou renommé
    // laisserait les assertions négatives vertes.
    const user = userEvent.setup();
    monter({ type: 'villa' });

    expect(screen.getByRole('group', { name: /état du bien/i })).toBeInTheDocument();
    const neuf = screen.getByRole('button', { name: 'Neuf' });
    await user.click(neuf);
    expect(neuf).toHaveAttribute('aria-pressed', 'true');

    await user.click(neuf);
    expect(neuf).toHaveAttribute('aria-pressed', 'false');
  });

  it('re-revue M-12 — le statut foncier reste en `aria-pressed`, jamais en radiogroup', () => {
    // La frontière est VOULUE, pas un oubli : le statut foncier est désélectionnable, et un groupe
    // de radios ne se désélectionne pas (cf. le docblock de `ChoiceChips`). Nommer l'invariant ici
    // évite qu'une future retouche le fasse basculer en `radioGroup` par mimétisme avec
    // `StepBien`. (TCK-633 : les équipements sont passés en liste à puces.)
    monter({ type: 'land' });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /statut foncier/i })).toBeInTheDocument();
  });

  describe('TCK-633 (AC10) — les nombres se choisissent dans une liste', () => {
    it('les chambres vont de « Non précisé » à 20', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment' });

      await user.click(screen.getByLabelText(/chambres/i));
      const liste = await screen.findByRole('listbox');
      const libelles = within(liste).getAllByRole('option').map((o) => o.textContent);
      expect(libelles[0]).toBe('Non précisé');
      expect(libelles.slice(1)).toEqual(Array.from({ length: 21 }, (_, i) => String(i)));
    });

    it('l’étage propose le sous-sol et le rez-de-chaussée, et un sous-sol s’enregistre à −1', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment' });

      await user.click(screen.getByLabelText(/^étage/i));
      await user.click(await screen.findByRole('option', { name: 'Sous-sol' }));

      await attendre({ floor_number: -1 });
      expect(screen.getByLabelText(/^étage/i)).toHaveTextContent('Sous-sol');
    });

    it('une valeur hors de la liste (un bien existant) est GARDÉE, et proposée dans la liste', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment', etage: 55 });

      expect(screen.getByLabelText(/^étage/i)).toHaveTextContent('55');
      await user.click(screen.getByLabelText(/^étage/i));
      expect(await screen.findByRole('option', { name: '55' })).toBeInTheDocument();
      await attendre({ floor_number: 55 });
    });

    it('« Non précisé » retire la valeur', async () => {
      const user = userEvent.setup();
      monter({ type: 'apartment', etage: 3 });

      await user.click(screen.getByLabelText(/^étage/i));
      await user.click(await screen.findByRole('option', { name: 'Non précisé' }));

      await attendre({ floor_number: null });
    });
  });
});
