/** TCK-2984 (ADR-0132) — le pont monté dans la colonne de contexte et sous la carte du fil. */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import type { Message } from '@/types/message';

let contexte: unknown;
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));
vi.mock('../../engagements/FiabiliteDuFil', () => ({ FiabiliteDuFilOuvert: () => null }));
vi.mock('../../engagements/EngagementsDuFil', () => ({ EngagementsDuFil: () => null }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversationContext: () => ({ data: contexte, isLoading: false }),
  useConversation: () => ({ data: { data: { participants: [{ user_id: 9, user: { id: 9, full_name: 'Ousmane Ndiaye' } }] } } }),
}));

const { ColonneDeContexte } = await import('../../ColonneDeContexte');
const { CarteDuFil } = await import('../../cartes/CarteDuFil');

const monter = (ui: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
};

const contexteAvec = (participants: unknown[]) => ({ data: { property: null, lease: null, maintenance: null, participants } });

describe('<ColonneDeContexte> — « Participants et canaux »', () => {
  beforeEach(() => {
    contexte = undefined;
  });

  it('le personnel (bloc `pont` présent) : le panneau, nommé (l’invitation revient avec TCK-2981)', () => {
    contexte = contexteAvec([{ user_id: 9, relation: 'locataire', pont: { joint: false, invitable: true } }]);
    monter(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />);
    const panneau = screen.getByTestId('participants-et-canaux');
    expect(panneau.textContent).toContain('Ousmane Ndiaye');
    expect(screen.queryByRole('button', { name: 'Joindre par WhatsApp' })).toBeNull();
  });

  it('le locataire (aucun bloc `pont`) : rien', () => {
    contexte = contexteAvec([{ user_id: 9, relation: 'locataire' }]);
    monter(<ColonneDeContexte conversationId={7} ouverte onOuvrir={() => {}} />);
    expect(screen.queryByTestId('participants-et-canaux')).toBeNull();
  });
});

describe('<CarteDuFil> — la trace du lien', () => {
  const carte = (extra: Partial<Message>): Message => ({
    id: 50,
    conversation_id: 7,
    sender_id: null,
    sender: null,
    content: 'lease_payment.due_soon',
    type: 'card',
    attachments: [],
    metadata: { object: { type: 'lease_payment', id: 4 }, code: 'lease_payment.due_soon', data: {} },
    object: { id: 4, status: 'pending', due_date: '2026-12-01', abilities: {} },
    created_at: '2026-11-18T11:40:00Z',
    updated_at: '2026-11-18T11:40:00Z',
    ...extra,
  });

  it('le personnel : « Lien envoyé · ouvert · fait » sous la carte', () => {
    monter(<ul><CarteDuFil message={carte({ action_link: { sent_at: '2026-11-18T11:41:00Z', opened_at: '2026-11-18T11:50:00Z', used_at: '2026-11-18T11:52:00Z' } })} conversationId={7} moi={false} auteur /></ul>);
    expect(screen.getByTestId('trace-du-lien').textContent).toMatch(/Lien envoyé à .*ouvert à .*fait à/);
  });

  it('le locataire (sans `action_link`) : aucune trace', () => {
    monter(<ul><CarteDuFil message={carte({})} conversationId={7} moi={false} auteur /></ul>);
    expect(screen.queryByTestId('trace-du-lien')).toBeNull();
  });
});
