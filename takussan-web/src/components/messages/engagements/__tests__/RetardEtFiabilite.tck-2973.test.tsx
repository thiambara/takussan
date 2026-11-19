/**
 * TCK-2973 (ADR-0130 §§ 5 et 6) — la puce « Retard », la ligne d'engagement d'une rangée, et la fiabilité :
 *
 * · « Retard » vient après « À vous » et part au serveur (`filter[file]=retard`) ;
 * · la ligne d'engagement nomme le porteur d'après les participants, jamais par un identifiant ;
 * · la fiabilité n'existe que si l'API rend `commitments_records`, pour les seuls comptes qu'elle y met.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { conversationListParams } from '@/lib/queries/conversations-list';
import { PUCES_DE_PILOTAGE, fileDeLaPuce } from '../../boite/pilotage';

let moi = 7;
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: moi }, token: 't' }) }));

const { SignauxDuFil } = await import('../../boite/RangeeDeLaBoite');
const { FiabiliteDuFil } = await import('../FiabiliteDuFil');

const MAINTENANT = new Date('2026-11-19T12:00:00Z');

function fil(extra: Partial<Conversation>): Conversation {
  return {
    id: 3,
    file: 'retard',
    participants: [
      { user_id: 7, left_at: null, user: { id: 7, full_name: 'Sokhna Sène' } },
      { user_id: 30, left_at: null, user: { id: 30, full_name: 'Ousmane Ndiaye' } },
    ],
    ...extra,
  } as unknown as Conversation;
}

describe('TCK-2973 — la puce « Retard »', () => {
  it('vient après « À vous », et sa file part au serveur', () => {
    expect(PUCES_DE_PILOTAGE).toEqual(['tous', 'nonLus', 'vous', 'retard', 'attente', 'rappel']);
    expect(fileDeLaPuce('retard')).toBe('retard');
    expect(conversationListParams(1, 30, { file: 'retard' }).filter).toEqual({ file: 'retard' });
  });
});

describe('TCK-2973 — la ligne d’engagement d’une rangée', () => {
  const engagement = { id: 9, title: 'je paie le 5', holder_id: 30, due_at: '2026-11-16T10:00:00Z', etat: 'late' as const };

  it('en retard : le porteur nommé, la promesse, les jours de retard — jamais l’identifiant', () => {
    render(withIntl(<SignauxDuFil conversation={fil({ engagement })} maintenant={MAINTENANT} moi={7} confieVisible={false} />));
    const ligne = screen.getByTestId('ligne-d-engagement');
    expect(ligne.textContent).toBe('Ousmane Ndiaye : « je paie le 5 » · 3 j de retard');
    expect(ligne.closest('span.text-warning')).not.toBeNull();
    expect(ligne.textContent).not.toMatch(/\b30\b/);
  });

  it('à venir : en encre douce ; pour le porteur, « Vous aviez prévu »', () => {
    render(
      withIntl(
        <SignauxDuFil conversation={fil({ file: 'ajour', engagement: { ...engagement, etat: 'open', holder_id: 7, due_at: '2026-11-25T09:30:00Z' } })} maintenant={MAINTENANT} moi={7} confieVisible={false} />,
      ),
    );
    expect(screen.getByTestId('ligne-d-engagement').textContent).toBe('Vous aviez prévu : « je paie le 5 »');
  });

  it('un porteur sans nom connu n’est pas nommé ; un engagement tenu ne dit rien', () => {
    const { unmount } = render(withIntl(<SignauxDuFil conversation={fil({ engagement: { ...engagement, holder_id: 99 } })} maintenant={MAINTENANT} moi={7} confieVisible={false} />));
    expect(screen.getByTestId('ligne-d-engagement').textContent).toBe('« je paie le 5 » · 3 j de retard');
    unmount();
    render(withIntl(<SignauxDuFil conversation={fil({ file: 'ajour', engagement: { ...engagement, etat: 'kept' } })} maintenant={MAINTENANT} moi={7} confieVisible={false} />));
    expect(screen.queryByTestId('ligne-d-engagement')).toBeNull();
  });
});

describe('TCK-2973 — la fiabilité, pour le seul personnel (non-fuite)', () => {
  const personnes = [
    { id: 7, nom: 'Sokhna Sène' },
    { id: 30, nom: 'Astou Sy' },
    { id: 40, nom: 'Fatou Wade' },
  ];

  it('commitments_records absent (un client, une impersonation de locataire) : ni le bloc, ni son texte', () => {
    moi = 40;
    const { container } = render(withIntl(<FiabiliteDuFil contexte={{}} personnes={personnes} />));
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('fiabilite-du-fil')).toBeNull();
  });

  it('présent : deux nombres sur 90 jours, pour les seuls comptes rendus, sans soi', () => {
    moi = 7;
    render(withIntl(<FiabiliteDuFil contexte={{ commitments_records: { '30': { kept: 12, late: 2 }, '7': { kept: 1, late: 0 } } }} personnes={personnes} />));
    expect(screen.getByTestId('fiabilite-30').textContent).toContain('12 tenus · 2 en retard · sur 90 jours');
    expect(screen.queryByTestId('fiabilite-40')).toBeNull();
    expect(screen.queryByTestId('fiabilite-7')).toBeNull();
    expect(screen.getByText('Visible par l’équipe de l’agence seulement')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%|★/);
  });
});
