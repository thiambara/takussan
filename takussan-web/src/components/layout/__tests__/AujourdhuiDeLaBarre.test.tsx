/**
 * Revue adverse de TCK-2490 — « Aujourd'hui » rendu seul : le plafond des nombres (M1) et le rail (I1).
 * Les règles du bloc dans la colonne (ordre, liste blanche, zéro, menu immobile) sont dans
 * `AppSidebar.test.tsx`.
 */
import { render, screen, within } from '@testing-library/react';
import { MessageSquare, CalendarClock } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';
import type { LigneAujourdhui } from '@/lib/navigation/a-traiter';
import { AujourdhuiDeLaBarre } from '../AujourdhuiDeLaBarre';
import { compteAffiche } from '../compte-affiche';
import type { EntreeRendue } from '../useMenuDeLEspace';

const ENTREES = [
  { id: 'messagerie', href: '/app/messages', counterKey: 'unreadMessages', icon: MessageSquare },
  { id: 'visites', href: '/app/visits', counterKey: 'pendingVisits', icon: CalendarClock },
] as unknown as EntreeRendue[];

function monter(lignes: readonly LigneAujourdhui[]) {
  return render(withIntl(<AujourdhuiDeLaBarre lignes={lignes} entrees={ENTREES} />));
}

describe('M1 — « Aujourd’hui » plafonne à 99+, comme le menu, par la même fonction', () => {
  it('la fonction : le nombre jusqu’à 99, « 99+ » au-delà', () => {
    expect([0, 7, 99, 100, 181].map(compteAffiche)).toEqual(['0', '7', '99', '99+', '99+']);
  });

  it('au-delà de 99, la puce montre « 99+ » ; le nom accessible garde le vrai compte', () => {
    monter([
      { cle: 'pendingVisits', nombre: 17, href: '/app/visits?tab=requested' },
      { cle: 'unreadMessages', nombre: 181, href: '/app/messages' },
    ]);
    const puces = Array.from(document.querySelectorAll('[data-slot="compte-aujourdhui"]'));
    expect(puces.map((p) => within(p as HTMLElement).queryByText(/\d/, { ignore: '.sr-only' })?.textContent)).toEqual([
      '17',
      '99+',
    ]);
    expect(screen.getByRole('link', { name: /^Messages non lus,\s?181$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Visites à confirmer,\s?17$/ })).toBeInTheDocument();
  });
});
