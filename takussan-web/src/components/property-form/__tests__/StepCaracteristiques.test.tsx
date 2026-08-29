import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

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

function Harnais({
  type,
  contrat = 'sale',
  tagIds = [],
  tags = TAGS,
}: {
  type: PropertyFormValues['type'];
  contrat?: PropertyFormValues['contract_type'];
  tagIds?: number[];
  tags?: Tag[];
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
    } as PropertyFormValues,
  });
  return <StepCaracteristiques form={form} tags={tags} />;
}

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
    expect(screen.queryByRole('group', { name: /équipements/i })).not.toBeInTheDocument();
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

  it('les équipements déjà retenus sont VISIBLEMENT retenus', () => {
    monter({ type: 'villa', tagIds: [2] });

    expect(screen.getByRole('button', { name: 'Piscine' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('un clic ajoute un équipement, un second le retire', async () => {
    const user = userEvent.setup();
    monter({ type: 'villa' });

    const wifi = screen.getByRole('button', { name: 'WiFi' });
    await user.click(wifi);
    expect(wifi).toHaveAttribute('aria-pressed', 'true');

    await user.click(wifi);
    expect(wifi).toHaveAttribute('aria-pressed', 'false');
  });

  it('n’affiche pas le bloc des équipements quand aucun tag n’est fourni', () => {
    monter({ type: 'villa', tags: [] });
    expect(screen.queryByRole('group', { name: /équipements/i })).not.toBeInTheDocument();
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
});
