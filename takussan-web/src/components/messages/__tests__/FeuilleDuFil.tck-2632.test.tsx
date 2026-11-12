/**
 * TCK-2632 (maquette a/2, téléphone) — « ⋯ » d'un fil direct ouvre une feuille au nom de la personne :
 * le bien, la fiche du client (« nom · étape »), WhatsApp et la sourdine. Elle ne montre que ce que
 * `/context` rend : sans `customer` (un client, un bailleur), ni fiche ni numéro.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { FeuilleDuFil } from '../FeuilleDuFil';

let contexte: unknown;
const sourdine = vi.fn();
const geste = vi.fn();
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
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
  useConversation: () => ({
    data: {
      data: {
        id: 21,
        type: 'direct',
        participants: [
          { user_id: 1, left_at: null, is_muted: false, full_name: 'Moi' },
          { user_id: 9, left_at: null, is_muted: false, full_name: 'Malick Seck' },
        ],
      },
    },
  }),
  useConversationContext: () => ({ data: contexte }),
  useToggleMute: () => ({ mutate: sourdine }),
  useConsignerGesteDuClient: () => ({ mutate: geste }),
}));
vi.mock('../ConversationList', () => ({ titreDeConversation: () => 'Malick Seck' }));

const BIEN = {
  id: 5,
  slug: 'maison-avec-jardin',
  title: 'Maison de 4 chambres avec jardin',
  reference_number: 'TK-48213',
  price: 68_000_000,
  status: 'published',
  cover_url: null,
};
const CLIENT = { id: 31, full_name: 'Malick Seck', stage: 'qualified', phone: '+221775124018', assigned_agent: null };

beforeEach(() => {
  personnel = true;
  contexte = { data: { property: BIEN, lease: null, maintenance: null, customer: CLIENT } };
  sourdine.mockReset();
  geste.mockReset();
});

describe('<FeuilleDuFil> (TCK-2632, téléphone)', () => {
  it('au nom de la personne : le bien, la fiche « nom · étape », WhatsApp groupé, la sourdine', async () => {
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={() => {}} />));
    const feuille = screen.getByRole('dialog', { name: 'Malick Seck' });
    const bien = within(feuille).getByTestId('feuille-du-fil-bien');
    expect(bien).toHaveAttribute('href', '/properties/maison-avec-jardin');
    expect(bien).toHaveTextContent(/68\s000\s000/);
    expect(bien).toHaveTextContent('Publié');
    expect(bien).toHaveTextContent('TK-48213');
    const fiche = within(feuille).getByRole('link', { name: /Fiche du client/ });
    expect(fiche).toHaveAttribute('href', '/app/customers/31');
    expect(fiche).toHaveTextContent('Malick Seck · étape Qualifié');
    const whatsapp = within(feuille).getByRole('link', { name: /Écrire sur WhatsApp/ });
    expect(whatsapp).toHaveTextContent('+221 77 512 40 18');

    await userEvent.click(whatsapp);
    expect(geste).toHaveBeenCalledWith({ id: 31, channel: 'whatsapp' }, expect.anything());
    await userEvent.click(within(feuille).getByRole('button', { name: 'Couper les notifications' }));
    expect(sourdine).toHaveBeenCalledWith({ is_muted: true }, expect.anything());
  });

  it('P228.06 — la sourdine refusée se dit dans la feuille', async () => {
    sourdine.mockImplementation((_v: unknown, o: { onError: (e: unknown) => void }) => o.onError(new Error('x')));
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={() => {}} />));
    const feuille = screen.getByRole('dialog', { name: 'Malick Seck' });
    await userEvent.click(within(feuille).getByRole('button', { name: 'Couper les notifications' }));
    expect(within(feuille).getByRole('alert').textContent).not.toBe('');
  });

  /** La page tient l'ouverture : fermer la feuille la retire vraiment du document. */
  function FeuilleTenue() {
    const [ouverte, setOuverte] = useState(true);
    return (
      <>
        <FeuilleDuFil conversationId={21} open={ouverte} onOpenChange={setOuverte} />
        <button type="button" onClick={() => setOuverte(true)}>
          rouvrir
        </button>
      </>
    );
  }

  it('P228.06 — WhatsApp non noté : la feuille reste ouverte et le dit, la phrase ne survit pas à la fermeture', async () => {
    geste.mockImplementation((_v: unknown, o: { onError: () => void }) => o.onError());
    render(withIntl(<FeuilleTenue />));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Malick Seck' })).getByRole('link', { name: /Écrire sur WhatsApp/ }));
    const feuille = screen.getByRole('dialog', { name: 'Malick Seck' });
    expect(within(feuille).getByRole('alert')).toHaveTextContent('Le contact n’a pas été noté sur la fiche du client.');

    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Malick Seck' })).not.toBeInTheDocument());
    geste.mockReset();
    await userEvent.click(screen.getByRole('button', { name: 'rouvrir' }));
    expect(within(screen.getByRole('dialog', { name: 'Malick Seck' })).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('WhatsApp noté : la feuille se ferme', async () => {
    geste.mockImplementation((_v: unknown, o: { onSuccess: () => void }) => o.onSuccess());
    render(withIntl(<FeuilleTenue />));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Malick Seck' })).getByRole('link', { name: /Écrire sur WhatsApp/ }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Malick Seck' })).not.toBeInTheDocument());
  });

  it('sans fiche rendue (un client, un bailleur) : ni fiche ni numéro, le bien et la sourdine restent', () => {
    contexte = { data: { property: BIEN, lease: null, maintenance: null } };
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={() => {}} />));
    const feuille = screen.getByRole('dialog', { name: 'Malick Seck' });
    expect(within(feuille).queryByRole('link', { name: /Fiche du client/ })).not.toBeInTheDocument();
    expect(within(feuille).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(within(feuille).getByTestId('feuille-du-fil-bien')).toBeInTheDocument();
    expect(within(feuille).getByRole('button', { name: 'Couper les notifications' })).toBeInTheDocument();
  });

  it('« Planifier une visite » au pied : ferme la feuille et ouvre la planification, le bien et la fiche posés', async () => {
    const fermer = vi.fn();
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={fermer} />));
    expect(screen.queryByTestId('planifier-dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Planifier une visite' }));
    expect(fermer).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('planifier-dialog')).toHaveTextContent(
      'bien=5:Maison de 4 chambres avec jardin client=31:Malick Seck:qualified',
    );
  });

  it('ni hors du personnel actif, ni sans fiche rendue : pas de « Planifier une visite »', () => {
    personnel = false;
    const { unmount } = render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={() => {}} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
    unmount();

    personnel = true;
    contexte = { data: { property: BIEN, lease: null, maintenance: null } };
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={() => {}} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });
});
