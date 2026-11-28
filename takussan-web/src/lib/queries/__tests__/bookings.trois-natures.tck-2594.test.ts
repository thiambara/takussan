/**
 * TCK-2594 — la liste lit une nature (`filter[kind]`), une recherche, un bien, un client, et le
 * client inclus (nom, téléphone) ; les compteurs viennent d'UNE lecture de `counts`, sous les mêmes
 * filtres que la liste, nature et statut exceptés.
 *
 * TCK-3010 — les hooks tournent pour de vrai sur l'API simulée (`doublerLApi`) : on lit la requête que
 * l'API reçoit, et la réservation servie est bornée par `fields[bookings]` comme elle le serait.
 */
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { doublerLApi } from '@/test/api-simulee';
import { rendreLeHook } from '@/test/rendu';

import { useBookingCounts, useBookings } from '../bookings';

/** Une offre telle que l'API la rendrait sans `fields` : des colonnes que la liste ne demande pas comprises. */
const OFFRE = {
  id: 5,
  reference_number: 'RES-0005',
  kind: 'offer',
  status: 'pending',
  agency_id: 3,
  customer_id: 7,
  property_id: 12,
  list_price_at_booking: 45_000_000,
  conditions: 'Sous réserve de financement',
  customer: { id: 7, first_name: 'Awa', last_name: 'Sarr', phone: '+221770000007' },
};

const api = doublerLApi()
  .servir('reservations', [OFFRE])
  .sur('GET', '/api/bookings/counts', { data: {} });

const requeteDe = (chemin: string) => api.appels(chemin)[0]?.requete;

describe('useBookings — trois natures (TCK-2594)', () => {
  it('la nature part en filter[kind], avec la recherche, le bien et le client', async () => {
    const { result } = rendreLeHook(() =>
      useBookings({ kind: 'offer', status: 'pending', search: 'Sarr', propertyId: 12, customerId: 7, avecClient: true }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const p = requeteDe('/api/bookings')!;
    expect([p.get('filter[kind]'), p.get('filter[status]'), p.get('filter[search]'), p.get('filter[property_id]'), p.get('filter[customer_id]')]).toEqual([
      'offer',
      'pending',
      'Sarr',
      '12',
      '7',
    ]);
    expect(p.get('include')).toBe('property,customer');
    // Le téléphone du client n'est émis qu'au personnel de l'agence de la réservation : `agency_id` lu.
    expect(p.get('fields[bookings]')!.split(',')).toEqual(expect.arrayContaining(['kind', 'list_price_at_booking', 'agency_id', 'customer_id']));
    expect(p.get('fields[customers]')).toBe('id,first_name,last_name,phone');
    // La liste reçoit ce qu'elle a demandé, et le client que l'index charge quoi qu'on demande.
    expect(result.current.data?.data[0]).toMatchObject({ id: 5, kind: 'offer', customer: { first_name: 'Awa' } });
  });

  it('sans le client demandé, ni include ni fields[customers]', async () => {
    const { result } = rendreLeHook(() => useBookings({ status: 'pending' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const p = requeteDe('/api/bookings')!;
    expect(p.get('include')).toBe('property');
    expect(p.has('fields[customers]')).toBe(false);
  });

  it('une lecture en attente (nature pas encore tranchée) ne part pas', async () => {
    const { result } = rendreLeHook(() => useBookings({ status: 'pending', enabled: false }));

    await api.auRepos();
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.appels('/api/bookings')).toEqual([]);
  });
});

describe('useBookingCounts (TCK-2594)', () => {
  it('une seule lecture de /api/bookings/counts, sous la portée, la recherche et les filtres Bien et Client de la liste', async () => {
    const { result } = rendreLeHook(() => useBookingCounts({ onlyMine: true, search: 'Ba', propertyId: 3, customerId: 9 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.appels()).toHaveLength(1);
    const p = requeteDe('/api/bookings/counts')!;
    expect(Object.fromEntries([...p.entries()].filter(([cle]) => cle.startsWith('filter[')))).toEqual({
      'filter[managed_by]': 'me',
      'filter[search]': 'Ba',
      'filter[property_id]': '3',
      'filter[customer_id]': '9',
    });
  });
});
