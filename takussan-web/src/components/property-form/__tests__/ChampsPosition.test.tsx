import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';

/**
 * TCK-633 (AC9) — « Collez un lien ou une position », latitude et longitude visibles, carte
 * recentrée sur la ville choisie.
 */
const doublure = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/components/property-form/useReferentielGeo', () => ({
  useReferentielGeo: () => ({
    regions: [{ id: 1, name: 'Dakar', slug: 'dakar' }],
    villes: [
      { id: 10, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7215, longitude: -17.4728 },
      { id: 20, region_id: 2, name: 'Ziguinchor', slug: 'ziguinchor', latitude: 12.5681, longitude: -16.2733 },
    ],
    quartiers: [],
    chargement: { villes: false, quartiers: false },
  }),
  useResolutionDeLien: () => ({ mutate: doublure.mutate, isPending: false }),
}));

// La carte réelle (Leaflet) n'a rien à prouver ici : on lit ce qu'elle RECEVRAIT.
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: (p: { lat?: number | null; lng?: number | null; centre?: { latitude: number; longitude: number } | null }) => (
    <div
      data-testid="carte"
      data-centre={p.centre ? `${p.centre.latitude},${p.centre.longitude}` : ''}
      data-position={p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : ''}
    />
  ),
}));

import { ChampsPosition } from '../ChampsPosition';

const soumis = vi.fn();

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
    return (
      <form onSubmit={(e) => { e.preventDefault(); soumis(); }}>
        <ChampsPosition form={form} indiceCarte="Touchez la carte." />
      </form>
    );
  }
  render(withIntl(<Harnais />));
  return () => sortie.form!.getValues();
}

function coller(texte: string) {
  fireEvent.paste(screen.getByLabelText(/coller un lien ou une position/i), {
    clipboardData: { getData: () => texte },
  });
}

beforeEach(() => {
  doublure.mutate.mockReset();
  soumis.mockReset();
});

describe('ChampsPosition', () => {
  it('des coordonnées collées remplissent latitude et longitude, et le disent', () => {
    const valeurs = harnais();

    coller('14.6937, -17.4441');

    expect(valeurs()).toMatchObject({ latitude: 14.6937, longitude: -17.4441 });
    expect(screen.getByLabelText(/^latitude$/i)).toHaveValue(14.6937);
    expect(screen.getByLabelText(/^longitude$/i)).toHaveValue(-17.4441);
    expect(screen.getByRole('status')).toHaveTextContent(/position placée sur la carte/i);
    expect(screen.getByTestId('carte')).toHaveAttribute('data-position', '14.6937,-17.4441');
  });

  it('un Plus Code COURT se lit à partir de la ville choisie', () => {
    const valeurs = harnais({ city: 'Dakar', geo_city_id: 10 });

    coller('8J+MW');

    expect(valeurs().latitude).toBeCloseTo(14.7166875, 6);
    expect(valeurs().longitude).toBeCloseTo(-17.4676875, 6);
  });

  // Le rattachement se juge AU CHAMP, pas seulement dans l'algorithme : un champ qui rapporterait
  // tout code court à Dakar placerait ce bien de Ziguinchor à 250 km, dans l'océan au large de Dakar.
  it('un Plus Code COURT se rapporte à la ville CHOISIE, pas à Dakar', () => {
    const valeurs = harnais({ city: 'Ziguinchor', geo_city_id: 20 });

    coller('HPMH+86');

    expect(valeurs().latitude).toBeCloseTo(12.5833125, 6);
    expect(valeurs().longitude).toBeCloseTo(-16.2719375, 6);
  });

  it('sans ville, un Plus Code court demande la ville d’abord — et ne pose rien', () => {
    const valeurs = harnais();

    coller('8J+MW');

    expect(screen.getByRole('alert')).toHaveTextContent(/choisissez d’abord la ville/i);
    expect(valeurs().latitude).toBeUndefined();
  });

  it('une position hors du Sénégal est placée, puis signalée', () => {
    const valeurs = harnais();

    coller('48.8584, 2.2945');

    expect(valeurs()).toMatchObject({ latitude: 48.8584, longitude: 2.2945 });
    expect(screen.getByRole('alert')).toHaveTextContent(/hors du sénégal/i);
  });

  it('un lien court part au serveur, et sa réponse est placée', () => {
    doublure.mutate.mockImplementation((_v: unknown, o: { onSuccess: (r: unknown) => void }) =>
      o.onSuccess({ data: { latitude: 14.68, longitude: -17.46, outside_senegal: false } }),
    );
    const valeurs = harnais();

    coller('https://maps.app.goo.gl/abc123');

    expect(doublure.mutate).toHaveBeenCalledWith({ url: 'https://maps.app.goo.gl/abc123' }, expect.any(Object));
    expect(valeurs()).toMatchObject({ latitude: 14.68, longitude: -17.46 });
  });

  it('un lien que le serveur ne lit pas le dit', () => {
    doublure.mutate.mockImplementation((_v: unknown, o: { onError: () => void }) => o.onError());
    harnais();

    coller('https://maps.app.goo.gl/introuvable');

    expect(screen.getByRole('alert')).toHaveTextContent(/ne mène à aucune position lisible/i);
  });

  it('un texte quelconque est refusé avec la liste des formats', () => {
    harnais();

    coller('chez tonton, derrière la boutique');

    expect(screen.getByRole('alert')).toHaveTextContent(/format non reconnu/i);
  });

  it('Entrée lit le champ et ne soumet PAS le formulaire', async () => {
    const user = userEvent.setup();
    const valeurs = harnais();

    await user.type(screen.getByLabelText(/coller un lien ou une position/i), '14.7, -17.45{Enter}');

    expect(valeurs()).toMatchObject({ latitude: 14.7, longitude: -17.45 });
    expect(soumis).not.toHaveBeenCalled();
  });

  it('une latitude vidée vaut null, pas 0 (le golfe de Guinée)', async () => {
    const user = userEvent.setup();
    const valeurs = harnais({ latitude: 14.7, longitude: -17.45 });

    await user.clear(screen.getByLabelText(/^latitude$/i));

    expect(valeurs().latitude).toBeNull();
  });

  it('la carte se centre sur la ville choisie', () => {
    harnais({ city: 'Dakar', geo_city_id: 10 });

    expect(screen.getByTestId('carte')).toHaveAttribute('data-centre', '14.7215,-17.4728');
  });
});
