/**
 * TCK-2984 — le panneau « Participants et canaux » (« Joindre par WhatsApp ») se monte dans les TROIS lieux où le
 * dossier d'un fil se lit : la colonne de contexte (bureau, fil direct), le dossier d'une salle (bail, réservation,
 * au bureau comme dans la feuille du téléphone) et la feuille d'un fil direct au téléphone. Relevé du 2026-11-19 :
 * il n'était monté que dans la colonne de contexte, donc jamais dans une salle de bail ni au téléphone, alors
 * que `/context` rendait le bloc `pont`. Le panneau est doublé : ce test ne juge que son montage et ses données.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';

const PONT = {
  16: { joint: false, invitation_en_attente: false, canal: null, accord_at: null, opposition_at: null, fenetre_jusqu_a: null, invitable: true },
};
const FICHE = { customer_id: 31, full_name: 'Awa Ndiaye', invitable: true, invitation_en_attente: false, opposition_at: null };
let contexte: unknown = { data: { property: null, lease: null, maintenance: null, customer: null, pont: PONT, pont_fiche: FICHE } };

vi.mock('../ElementsDuPont', () => ({
  ParticipantsEtCanauxDuFil: ({ conversationId, participants, fiche }: { conversationId: number; participants?: { user_id: number }[]; fiche?: { customer_id: number } | null }) => (
    <div
      data-testid="panneau-du-pont-double"
      data-fil={conversationId}
      data-participants={(participants ?? []).map((p) => p.user_id).join(',')}
      data-fiche={fiche?.customer_id ?? ''}
    />
  ),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true }));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));
vi.mock('../../engagements/EngagementsDuFil', () => ({ EngagementsDuFil: () => null }));
vi.mock('../../ConversationList', () => ({ titreDeConversation: () => 'Malick Seck' }));
vi.mock('../../salle/requetesDeLaSalle', () => ({ useBailDeLaSalle: () => ({ data: undefined, isLoading: true }) }));
vi.mock('@/lib/queries/bookings', () => ({ useBooking: () => ({ data: undefined, isLoading: true }) }));
vi.mock('@/lib/queries/documents', () => ({
  useDocuments: () => ({ data: undefined, isLoading: true }),
  useDocumentsGeneres: () => ({ data: undefined, isLoading: true }),
}));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 21, type: 'direct', participants: [] } } }),
  useConversationContext: () => ({ data: contexte }),
  useToggleMute: () => ({ mutate: vi.fn() }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { DossierDuFil } = await import('../../salle/DossierDuFil');
const { FeuilleDuFil } = await import('../../FeuilleDuFil');

const SALLE = { id: 178, type: 'lease', subject_type: 'lease', subject_id: 7, lease_id: 7, participants: [] } as never;

describe('TCK-2984 — le panneau du pont dans les dossiers', () => {
  it.each(['feuille', 'colonne'] as const)('le dossier d’une salle (%s) monte le panneau, avec le pont et la fiche de /context', (forme) => {
    contexte = { data: { pont: PONT, pont_fiche: FICHE } };
    render(withIntl(<DossierDuFil conversation={SALLE} forme={forme} />));
    const panneau = screen.getByTestId('panneau-du-pont-double');
    expect(panneau).toHaveAttribute('data-fil', '178');
    expect(panneau).toHaveAttribute('data-participants', '16');
    expect(panneau).toHaveAttribute('data-fiche', '31');
  });

  it('la feuille d’un fil direct, au téléphone, monte le panneau', () => {
    contexte = { data: { property: null, lease: null, maintenance: null, customer: null, pont: PONT, pont_fiche: null } };
    render(withIntl(<FeuilleDuFil conversationId={21} open onOpenChange={() => undefined} />));
    const panneau = screen.getByTestId('panneau-du-pont-double');
    expect(panneau).toHaveAttribute('data-fil', '21');
    expect(panneau).toHaveAttribute('data-participants', '16');
  });

  it('sans bloc `pont` (lecteur qui n’est pas personnel), le panneau ne reçoit aucun participant', () => {
    contexte = { data: { pont_fiche: null } };
    render(withIntl(<DossierDuFil conversation={SALLE} forme="feuille" />));
    expect(screen.getByTestId('panneau-du-pont-double')).toHaveAttribute('data-participants', '');
  });
});
