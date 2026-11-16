/**
 * TCK-2860 (AC4, maquette a/2 téléphone, l. 696-699) — la feuille du fil porte la demande de contact
 * liée (« Demande de contact du 9 nov. » / « Par l'annonce « … » », en lien), et, après la sourdine,
 * « Marquer comme non lue », « Ajouter un participant » et « Signaler la conversation » en rouge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { FeuilleDuFil } from '../FeuilleDuFil';
import type { GestesDuFil } from '../GestesDuFil';

let contexte: unknown;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => false }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 21, type: 'direct', participants: [] } } }),
  useConversationContext: () => ({ data: contexte }),
  useToggleMute: () => ({ mutate: vi.fn() }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false }),
}));
vi.mock('../ConversationList', () => ({ titreDeConversation: () => 'Malick Seck' }));

const CLIENT = {
  id: 31,
  full_name: 'Malick Seck',
  stage: null,
  phone: null,
  assigned_agent: null,
  contact_lead: { id: 88, created_at: '2026-11-09T10:00:00Z', property_title: 'Maison de 4 chambres avec jardin' },
};

let gestes: { onMarquerNonLue: ReturnType<typeof vi.fn>; onAjouterUnParticipant: ReturnType<typeof vi.fn>; onSignaler: ReturnType<typeof vi.fn> };
const onOpenChange = vi.fn();

function monter() {
  return render(
    withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={onOpenChange} gestes={gestes as unknown as GestesDuFil} />),
  );
}

beforeEach(() => {
  contexte = { data: { property: null, lease: null, maintenance: null, customer: CLIENT } };
  gestes = { onMarquerNonLue: vi.fn(), onAjouterUnParticipant: vi.fn(), onSignaler: vi.fn() };
  onOpenChange.mockReset();
});

describe('<FeuilleDuFil> — la demande liée et les gestes (TCK-2860)', () => {
  it('la demande de contact liée, en lien vers la demande, avec son annonce', () => {
    monter();
    const lien = screen.getByTestId('feuille-du-fil-demande');
    expect(lien).toHaveAttribute('href', '/app/leads?lead=88');
    expect(lien).toHaveTextContent('Demande de contact du 9 nov.');
    expect(lien).toHaveTextContent('Par l’annonce « Maison de 4 chambres avec jardin »');
  });

  it('AC4 — « Signaler la conversation » ferme la feuille et ouvre le signalement', async () => {
    monter();
    const signaler = screen.getByRole('button', { name: 'Signaler la conversation' });
    expect(signaler).toHaveClass('text-destructive');
    await userEvent.click(signaler);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(gestes.onSignaler).toHaveBeenCalledTimes(1);
  });

  it('« Marquer comme non lue » ferme la feuille au succès ; « Ajouter un participant » ouvre son dialogue', async () => {
    gestes.onMarquerNonLue.mockImplementation(({ onSuccess }: { onSuccess: () => void }) => onSuccess());
    monter();
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme non lue' }));
    expect(gestes.onMarquerNonLue).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un participant' }));
    expect(gestes.onAjouterUnParticipant).toHaveBeenCalledTimes(1);
  });

  it('sans demande liée : pas de rangée ; sans gestes : ni non lue ni signalement', () => {
    contexte = { data: { property: null, lease: null, maintenance: null, customer: { ...CLIENT, contact_lead: null } } };
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={onOpenChange} />));
    expect(screen.queryByTestId('feuille-du-fil-demande')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Signaler la conversation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marquer comme non lue' })).toBeNull();
  });
});
