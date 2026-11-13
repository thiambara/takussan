/**
 * TCK-2594 — la liste lit une nature (`filter[kind]`), une recherche, un bien, un client, et le
 * client inclus (nom, téléphone) ; les compteurs viennent d'UNE lecture de `counts`, sous les mêmes
 * filtres que la liste, nature et statut exceptés.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQuery(...args),
  useApiMutation: vi.fn(),
}));

const { useBookings, useBookingCounts } = await import('../bookings');

describe('useBookings — trois natures (TCK-2594)', () => {
  beforeEach(() => useApiQuery.mockReset());

  it('la nature part en filter[kind], avec la recherche, le bien et le client', () => {
    useBookings({ kind: 'offer', status: 'pending', search: 'Sarr', propertyId: 12, customerId: 7, avecClient: true });
    const { params } = useApiQuery.mock.calls[0]?.[2];
    expect(params.filter).toEqual({ kind: 'offer', status: 'pending', search: 'Sarr', property_id: 12, customer_id: 7 });
    expect(params.include).toEqual(['property', 'customer']);
    // Le téléphone du client n'est émis qu'au personnel de l'agence de la réservation : `agency_id` lu.
    expect(params.fields.bookings).toEqual(expect.arrayContaining(['kind', 'list_price_at_booking', 'agency_id', 'customer_id']));
    expect(params.fields.customers).toEqual(['id', 'first_name', 'last_name', 'phone']);
  });

  it('sans le client demandé, ni include ni fields[customers]', () => {
    useBookings({ status: 'pending' });
    const { params } = useApiQuery.mock.calls[0]?.[2];
    expect(params.include).toEqual(['property']);
    expect(params.fields.customers).toBeUndefined();
  });

  it('une lecture en attente (nature pas encore tranchée) ne part pas', () => {
    useBookings({ status: 'pending', enabled: false });
    expect(useApiQuery.mock.calls[0]?.[2]).toMatchObject({ enabled: false });
  });
});

describe('useBookingCounts (TCK-2594)', () => {
  beforeEach(() => useApiQuery.mockReset());

  it('une seule lecture de /api/bookings/counts, sous la portée et la recherche de la liste', () => {
    useBookingCounts({ onlyMine: true, search: 'Ba', propertyId: 3 });
    expect(useApiQuery).toHaveBeenCalledTimes(1);
    const [, chemin, options] = useApiQuery.mock.calls[0]!;
    expect(chemin).toBe('/api/bookings/counts');
    expect(options.params.filter).toEqual({ managed_by: 'me', search: 'Ba', property_id: 3 });
    expect(options.params.filter).not.toHaveProperty('kind');
    expect(options.params.filter).not.toHaveProperty('status');
  });
});
