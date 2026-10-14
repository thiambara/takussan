import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';

/**
 * TCK-633 (AC9) — région, ville et quartier choisis dans le référentiel.
 *
 * Le référentiel est une doublure REMPLIE (deux régions, trois villes, trois quartiers de Dakar dont
 * une proposition en attente) : c'est elle qui fait la différence avec la doublure vide des tests
 * du parcours, où les mêmes champs restent du texte libre.
 */
vi.mock('@/components/property-form/useReferentielGeo', () => {
  const regions = [
    { id: 1, name: 'Dakar', slug: 'dakar' },
    { id: 2, name: 'Thiès', slug: 'thies' },
  ];
  const villes = [
    { id: 10, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7215, longitude: -17.4728 },
    { id: 11, region_id: 1, name: 'Guédiawaye', slug: 'guediawaye', latitude: 14.7731, longitude: -17.3943 },
    { id: 20, region_id: 2, name: 'Thiès', slug: 'thies', latitude: 14.791, longitude: -16.9359 },
  ];
  const quartiers = [
    { id: 100, city_id: 10, name: 'Liberté 4', slug: 'liberte-4', latitude: null, longitude: null, status: 'approved' },
    { id: 101, city_id: 10, name: 'Mermoz', slug: 'mermoz', latitude: null, longitude: null, status: 'approved' },
    { id: 102, city_id: 10, name: 'Cité Moi', slug: 'cite-moi', latitude: null, longitude: null, status: 'pending' },
  ];
  return {
    useReferentielGeo: (regionId: number | null, villeId: number | null) => ({
      regions,
      villes: regionId === null ? villes : villes.filter((v) => v.region_id === regionId),
      quartiers: villeId === 10 ? quartiers : [],
      chargement: { villes: false, quartiers: false },
    }),
    useResolutionDeLien: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import { ChampsLieu } from '../ChampsLieu';

function harnais(defauts: Partial<PropertyFormValues> = {}) {
  const sortie: { form?: UseFormReturn<PropertyFormValues> } = {};
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', city: '', furnished: false, tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    sortie.form = form;
    return <ChampsLieu form={form} />;
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!.getValues();
}

describe('ChampsLieu — le référentiel', () => {
  it('choisir une ville pose son identifiant ET sa région', async () => {
    const user = userEvent.setup();
    const valeurs = harnais();

    await user.type(screen.getByLabelText(/ville/i), 'Guéd');
    await user.click(await screen.findByRole('option', { name: 'Guédiawaye' }));

    expect(screen.getByLabelText(/ville/i)).toHaveValue('Guédiawaye');
    expect(screen.getByLabelText(/région/i)).toHaveValue('Dakar');
    expect(valeurs()).toMatchObject({ city: 'Guédiawaye', geo_city_id: 11, region: 'Dakar', geo_region_id: 1 });
  });

  it('une recherche sans accent trouve le nom accentué', async () => {
    const user = userEvent.setup();
    harnais();

    await user.type(screen.getByLabelText(/ville/i), 'guediawaye');

    expect(await screen.findByRole('option', { name: 'Guédiawaye' })).toBeInTheDocument();
  });

  it('un texte déjà là (brouillon, géo-IP) reçoit l’identifiant de la SEULE ville qu’il nomme', async () => {
    const valeurs = harnais({ city: 'DAKAR' });

    await waitFor(() => expect(valeurs().geo_city_id).toBe(10));
    // La région, que personne n'avait écrite, suit la ville.
    expect(valeurs()).toMatchObject({ region: 'Dakar', geo_region_id: 1 });
  });

  it('retaper efface l’identifiant : un texte corrigé ne part pas avec l’ancien choix', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10, region: 'Dakar', geo_region_id: 1 });

    await user.type(screen.getByLabelText(/ville/i), ' Plateau');

    expect(valeurs()).toMatchObject({ city: 'Dakar Plateau', geo_city_id: null });
  });

  it('un quartier inconnu s’ajoute DEPUIS la liste et part en texte seul, avec son indice', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.type(screen.getByLabelText(/quartier/i), 'Keur Gorgui Nord');
    await user.click(await screen.findByRole('option', { name: /ajouter « keur gorgui nord »/i }));

    expect(screen.getByLabelText(/quartier/i)).toHaveValue('Keur Gorgui Nord');
    expect(valeurs()).toMatchObject({ quarter: 'Keur Gorgui Nord', geo_neighborhood_id: null });
    expect(screen.getByText(/nouveau quartier : notre équipe le vérifiera/i)).toBeInTheDocument();
  });

  it('un quartier de la liste se choisit, sans indice de nouveauté', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.type(screen.getByLabelText(/quartier/i), 'liberte');
    await user.click(await screen.findByRole('option', { name: 'Liberté 4' }));

    expect(valeurs()).toMatchObject({ quarter: 'Liberté 4', geo_neighborhood_id: 100 });
    expect(screen.queryByText(/nouveau quartier/i)).not.toBeInTheDocument();
  });

  it('une proposition en attente est listée avec son indice', async () => {
    const user = userEvent.setup();
    harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.type(screen.getByLabelText(/quartier/i), 'cite');

    expect(await screen.findByRole('option', { name: /cité moi/i })).toHaveTextContent('en attente de vérification');
  });

  it('une région qui n’est pas celle de la ville vide la ville et le quartier', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({
      region: 'Dakar', geo_region_id: 1, city: 'Dakar', geo_city_id: 10, quarter: 'Mermoz', geo_neighborhood_id: 101,
    });

    await user.clear(screen.getByLabelText(/région/i));
    await user.type(screen.getByLabelText(/région/i), 'Thi');
    await user.click(await screen.findByRole('option', { name: 'Thiès' }));

    expect(valeurs()).toMatchObject({
      region: 'Thiès', geo_region_id: 2, city: '', geo_city_id: null, quarter: '', geo_neighborhood_id: null,
    });
  });

  it('une AUTRE ville vide le quartier', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10, quarter: 'Mermoz', geo_neighborhood_id: 101 });

    await user.clear(screen.getByLabelText(/ville/i));
    await user.type(screen.getByLabelText(/ville/i), 'Guéd');
    await user.click(await screen.findByRole('option', { name: 'Guédiawaye' }));

    expect(valeurs()).toMatchObject({ city: 'Guédiawaye', geo_city_id: 11, quarter: '', geo_neighborhood_id: null });
  });

  // ADR-0062 §3 — la mention ODbL est due LÀ OÙ le référentiel est servi, pas seulement dans les
  // pages légales : sous les listes qui le montrent.
  it('les listes du référentiel portent la mention OpenStreetMap (ODbL)', () => {
    harnais();

    expect(screen.getByText(/© les contributeurs d’OpenStreetMap \(ODbL\)/)).toBeInTheDocument();
  });

  // Le cas où la mention est DUE : une ville choisie, la liste de SES quartiers (extraits d'OSM)
  // servie. Une mention rendue seulement sans ville resterait verte au cas précédent.
  it('la mention reste sous la liste des quartiers une fois la ville choisie', async () => {
    const user = userEvent.setup();
    harnais({ city: 'Dakar', geo_city_id: 10 });

    await user.click(screen.getByLabelText(/quartier/i));
    expect(await screen.findByRole('option', { name: 'Mermoz' })).toBeInTheDocument();
    expect(screen.getByText(/© les contributeurs d’OpenStreetMap \(ODbL\)/)).toBeInTheDocument();
  });
});
