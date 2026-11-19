/**
 * TCK-2973 — la fiabilité des participants se lit aussi dans le DOSSIER d'une salle (bail, réservation), au bureau
 * comme dans la feuille du téléphone. Relevé du 2026-11-19 : elle n'était montée que dans la colonne de contexte et
 * la feuille d'un fil direct, donc jamais dans une salle de bail. Elle ne s'affiche que si `/context` rend
 * `commitments_records` (le personnel seul).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';

let contexte: unknown = null;

vi.mock('../../pont/ElementsDuPont', () => ({ ParticipantsEtCanauxDuFil: () => null }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('../EngagementsDuFil', () => ({ EngagementsDuFil: () => null }));
vi.mock('../../salle/requetesDeLaSalle', () => ({ useBailDeLaSalle: () => ({ data: undefined, isLoading: true }) }));
vi.mock('@/lib/queries/bookings', () => ({ useBooking: () => ({ data: undefined, isLoading: true }) }));
vi.mock('@/lib/queries/documents', () => ({
  useDocuments: () => ({ data: undefined, isLoading: true }),
  useDocumentsGeneres: () => ({ data: undefined, isLoading: true }),
}));
vi.mock('@/lib/queries/conversations', () => ({
  useConversationContext: () => ({ data: contexte }),
}));

const { DossierDuFil } = await import('../../salle/DossierDuFil');

const SALLE = {
  id: 178,
  type: 'lease',
  subject_type: 'lease',
  subject_id: 7,
  lease_id: 7,
  participants: [{ user_id: 16, left_at: null, user: { id: 16, full_name: 'Astou Sy' } }],
} as never;

describe('TCK-2973 — la fiabilité dans le dossier d’une salle', () => {
  it.each(['feuille', 'colonne'] as const)('le personnel la lit dans le dossier (%s)', (forme) => {
    contexte = { data: { commitments_records: { 16: { kept: 4, late: 1 } } } };
    render(withIntl(<DossierDuFil conversation={SALLE} forme={forme} />));
    expect(screen.getByTestId('fiabilite-du-fil')).toBeInTheDocument();
    expect(screen.getByTestId('fiabilite-16')).toBeInTheDocument();
  });

  it('sans `commitments_records` (le locataire), rien', () => {
    contexte = { data: {} };
    render(withIntl(<DossierDuFil conversation={SALLE} forme="colonne" />));
    expect(screen.queryByTestId('fiabilite-du-fil')).not.toBeInTheDocument();
  });
});
