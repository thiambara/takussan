/**
 * TCK-2632 (AC5) — la colonne de contexte du bureau : le bien, la fiche du client (étape, téléphone,
 * agent) et ce qui est lié (bail, intervention), avec leurs liens ; repliée, un rail qui la rouvre.
 * Elle ne montre que ce que `/context` rend : sans `customer` (un client, un bailleur), rien du client.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ColonneDeContexte } from '../ColonneDeContexte';

let reponse: unknown;
let personnel = true;
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => personnel }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({
  PlanifierDialog: ({ property, customer }: { property: { id: number; libelle: string }; customer: { id: number; libelle: string; etape?: string | null } }) => (
    <div data-testid="planifier-dialog">
      bien={property.id}:{property.libelle} client={customer.id}:{customer.libelle}:{customer.etape}
    </div>
  ),
}));
vi.mock('@/lib/queries/conversations', () => ({
  useConversationContext: () => ({ data: reponse, isLoading: false }),
}));

const BIEN = {
  id: 5,
  slug: 'maison-avec-jardin',
  title: 'Maison avec jardin · Thiès',
  reference_number: 'TK-THS-001',
  price: 68_000_000,
  status: 'published',
  cover_url: null,
};
const CLIENT = {
  id: 31,
  full_name: 'Malick Seck',
  stage: 'qualified',
  phone: '+221775124018',
  assigned_agent: { id: 2, name: 'Fatou Sow' },
};

beforeEach(() => {
  personnel = true;
  reponse = { data: { property: BIEN, lease: null, maintenance: null, customer: CLIENT } };
});

describe('<ColonneDeContexte> (TCK-2632)', () => {
  it('le bien : prix, statut, titre en lien, référence', () => {
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const bien = screen.getByTestId('contexte-bien');
    expect(bien).toHaveTextContent(/68\s000\s000/);
    // TCK-2638 — le statut `published` se dit « Validé » (ADR-0097 § 4, décision du porteur du 2026-11-10).
    expect(within(bien).getByText('Validé')).toBeInTheDocument();
    expect(within(bien).getByRole('link', { name: 'Maison avec jardin · Thiès' })).toHaveAttribute('href', '/properties/maison-avec-jardin');
    expect(bien).toHaveTextContent('TK-THS-001');
  });

  it('AC5 — la fiche du client : l’étape, le téléphone, l’agent, et le lien vers la fiche', () => {
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const client = screen.getByTestId('contexte-client');
    expect(client).toHaveTextContent('Malick Seck');
    expect(within(client).getByText('Qualifié')).toBeInTheDocument();
    // Groupé pour la lecture, comme la maquette (« +221 77 512 40 18 »).
    expect(client).toHaveTextContent('+221 77 512 40 18');
    expect(client).toHaveTextContent('Fatou Sow');
    expect(screen.getByRole('link', { name: 'Voir la fiche du client' })).toHaveAttribute('href', '/app/customers/31');
  });

  it('sans fiche rendue (un client, un bailleur) : rien du client, ni lien vers une fiche', () => {
    reponse = { data: { property: BIEN, lease: null, maintenance: null } };
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    expect(screen.queryByTestId('contexte-client')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Voir la fiche du client' })).not.toBeInTheDocument();
    expect(screen.getByText('Ni bail ni intervention pour l’instant.')).toBeInTheDocument();
  });

  it('le bail et l’intervention liés, chacun en lien vers sa page', () => {
    reponse = {
      data: {
        property: BIEN,
        lease: { id: 3, status: 'active', reference: 'BAIL-0003', tenant_name: 'Awa Ndiaye' },
        maintenance: { id: 8, status: 'in_progress', title: 'Fuite sous l’évier', scheduled_at: null },
        customer: null,
      },
    };
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    const bail = screen.getByRole('link', { name: /Voir le bail/ });
    expect(bail).toHaveAttribute('href', '/app/leases/3');
    expect(bail).toHaveTextContent('BAIL-0003 · Awa Ndiaye · Actif');
    const intervention = screen.getByRole('link', { name: /Fuite sous l’évier/ });
    expect(intervention).toHaveAttribute('href', '/app/maintenance/8');
    expect(intervention).toHaveTextContent('En cours');
    expect(screen.queryByText('Ni bail ni intervention pour l’instant.')).not.toBeInTheDocument();
  });

  it('repliée : un rail, tout entier le bouton qui la rouvre', async () => {
    const onOuvrir = vi.fn();
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte={false} onOuvrir={onOuvrir} />));
    expect(screen.getByTestId('colonne-de-contexte')).toHaveAttribute('data-etat', 'repliee');
    expect(screen.queryByTestId('contexte-bien')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher le contexte' }));
    expect(onOuvrir).toHaveBeenCalledTimes(1);
  });

  it('dès xl seulement, ouverte comme repliée', () => {
    const { rerender } = render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    expect(screen.getByTestId('colonne-de-contexte')).toHaveClass('max-xl:hidden');
    rerender(withIntl(<ColonneDeContexte conversationId={7} ouverte={false} onOuvrir={() => {}} />));
    expect(screen.getByTestId('colonne-de-contexte')).toHaveClass('max-xl:hidden');
  });

  it('« Planifier une visite » ouvre la planification, le bien et la fiche du fil posés ; personnel seulement', async () => {
    const { unmount } = render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    await userEvent.click(screen.getByRole('button', { name: 'Planifier une visite' }));
    expect(screen.getByTestId('planifier-dialog')).toHaveTextContent('bien=5:Maison avec jardin · Thiès client=31:Malick Seck:qualified');
    unmount();

    personnel = false;
    render(withIntl(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });
});

