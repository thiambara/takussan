import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseApiQuery = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => mockUseApiQuery(...args),
  useApiMutation: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

const { useConversations } = await import('@/lib/queries/conversations-list');
const { useBooking } = await import('@/lib/queries/bookings');

/**
 * P150.05 (TCK-1286) — deux paramètres que l'API ignore sans le dire. `ConversationController::index`
 * ne lit ni `filter[status]` ni `filter[property_id]` (il lit `?archived=`) : un filtre « archivées »
 * aurait rendu les actives. `BookingController::show` charge ses relations lui-même, et
 * `booking_payments` n'est pas une relation : l'`include` trompait le lecteur.
 */
describe('paramètres que l’API ignore', () => {
  beforeEach(() => mockUseApiQuery.mockReset());

  const paramsEnvoyes = () =>
    (mockUseApiQuery.mock.calls[0][2] as { params: { filter?: Record<string, unknown>; include?: string[] } }).params;

  it('useConversations n’offre ni status ni property_id', () => {
    // @ts-expect-error — `status` et `property_id` ne font plus partie de UseConversationsParams
    useConversations({ status: 'archived', property_id: 4 });
    expect(paramsEnvoyes().filter ?? {}).toEqual({});
  });

  it('useBooking ne demande pas booking_payments', () => {
    useBooking(9);
    expect(paramsEnvoyes().include).not.toContain('booking_payments');
  });
});
