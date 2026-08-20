import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InventorySignatures } from '../InventorySignatures';
import type { Inventory } from '@/types/inventory';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mutateAsync = vi.fn();

vi.mock('@/lib/queries/inventory', () => ({
  useSignInventory: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

function stubCanvas() {
  const context = {
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  HTMLCanvasElement.prototype.getContext = vi.fn((contextId: string) =>
    contextId === '2d' ? context : null,
  ) as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,PAYLOAD';
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
}

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1, buttons: 1 });
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40, pointerId: 1 });
}

/**
 * ⚠ Ce harnais montait `messages={{}}`, ce qui fait rendre la CLÉ et non le libellé : à la
 * conversion i18n (TCK-292) tous les `getByText` français cassaient. `withIntl` alimente le
 * provider avec le VRAI `fr.json` — les assertions ci-dessous sont donc INCHANGÉES.
 */
function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function buildInventory(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: 42,
    lease_id: 1,
    property_id: 2,
    type: 'move_in',
    conducted_by: 7,
    tenant_id: 5,
    conducted_at: '2026-04-24T10:00:00Z',
    status: 'pending_signature',
    general_condition: 'good',
    rooms: [],
    notes: null,
    tenant_signed: false,
    tenant_signed_at: null,
    tenant_signature_hash: null,
    owner_signed: false,
    owner_signed_at: null,
    owner_signature_hash: null,
    signed_at: null,
    created_at: '2026-04-24T09:00:00Z',
    ...overrides,
  };
}

describe('<InventorySignatures>', () => {
  beforeEach(() => {
    stubCanvas();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ data: {} });
  });

  it('renders two cards — one per party', () => {
    render(wrap(<InventorySignatures inventory={buildInventory()} />));
    expect(screen.getByTestId('signature-card-tenant')).toBeInTheDocument();
    expect(screen.getByTestId('signature-card-landlord')).toBeInTheDocument();
  });

  it('hides the canvas when the viewer cannot sign the role', () => {
    render(
      wrap(
        <InventorySignatures
          inventory={buildInventory()}
          canSignTenant={false}
          canSignLandlord={false}
        />,
      ),
    );
    expect(screen.queryByTestId('signature-canvas')).toBeNull();
    expect(screen.getAllByText(/en attente de la signature/i).length).toBe(2);
  });

  it('shows a signed badge + date + truncated hash once a party has signed', () => {
    const inventory = buildInventory({
      tenant_signed: true,
      tenant_signed_at: '2026-04-24T12:00:00Z',
      tenant_signature_hash: 'a'.repeat(64),
    });
    render(wrap(<InventorySignatures inventory={inventory} />));

    const tenantCard = screen.getByTestId('signature-card-tenant');
    expect(tenantCard).toHaveTextContent(/signé le/i);
    expect(tenantCard).toHaveTextContent(/empreinte/i);
  });

  it('submits {role, signature} to the sign endpoint when the tenant confirms', () => {
    render(
      wrap(
        <InventorySignatures
          inventory={buildInventory()}
          canSignTenant
          canSignLandlord={false}
        />,
      ),
    );

    // Only the tenant canvas should be rendered here.
    const canvas = screen.getByTestId('signature-canvas');
    drawStroke(canvas);
    fireEvent.click(
      screen.getByRole('button', { name: /signer en tant que locataire/i }),
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      role: 'tenant',
      signature: expect.stringMatching(/^data:image\/png;base64,/),
    });
  });
});
