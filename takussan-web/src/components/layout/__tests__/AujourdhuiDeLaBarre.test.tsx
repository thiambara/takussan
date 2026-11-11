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

// TCK-2712:début
/**
 * TCK-2712 (11c, ADR-0106) — « Aujourd'hui » dans la colonne dépliée, comme la maquette (`chrome-app.tsx`,
 * bloc « Aujourd'hui ») : titre de 18 px (`pb-1`), lignes `h-8` (28,8 px à 1440) en 13 px, SANS icône et
 * sans interstice ; compte `rounded-full` 11 px 600, neutre sur `muted` à l'encre douce opaque (TCK-658).
 * Le rail garde l'icône (I1) et le tiroir sa ligne de 40 px en 15 px à icône de 20 (aucune maquette ne
 * dessine « Aujourd'hui » au téléphone) : jsdom n'applique pas le CSS, ce sont les variantes qui sont lues.
 */
describe('TCK-2712 — « Aujourd’hui » aux cotes de la maquette', () => {
  const LIGNES = [
    { cle: 'pendingVisits', nombre: 17, href: '/app/visits?tab=requested' },
    { cle: 'unreadMessages', nombre: 3, href: '/app/messages' },
  ] as const;
  const cl = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

  it('les lignes : h-8 en 13 px dans la colonne, h-9 au rail, 40 px en 15 px au tiroir ; sans interstice', () => {
    monter(LIGNES);
    const lien = screen.getByRole('link', { name: /^Visites à confirmer/ });
    const c = cl(lien);
    expect(c).toEqual(expect.arrayContaining(['h-8', 'text-ui', 'icones:h-9', 'max-md:h-10', 'max-md:text-corps']));
    expect(c).not.toContain('h-9');
    expect(c).not.toContain('text-sm');
    expect(cl(lien.closest('ul'))).not.toContain('space-y-px');
  });

  it('l’icône : cachée dans la colonne dépliée, rendue au rail et au tiroir', () => {
    monter(LIGNES);
    const icone = screen.getByRole('link', { name: /^Visites à confirmer/ }).querySelector('svg')!;
    expect(cl(icone)).toEqual(expect.arrayContaining(['hidden', 'max-md:block', 'icones:block']));
  });

  it('le titre : 18 px (`pb-1`) dans la colonne, la ligne de 28 px d’avant au tiroir', () => {
    monter(LIGNES);
    const titre = screen.getByText('Aujourd’hui', { selector: 'p' });
    const c = cl(titre);
    expect(c).toEqual(expect.arrayContaining(['px-2', 'pb-1', 'max-md:flex', 'max-md:h-7', 'max-md:pb-0']));
    expect(c).not.toContain('h-7');
  });

  it('le compte : rond, 11 px 600 ; primaire au premier, neutre `muted` à l’encre douce ensuite', () => {
    monter(LIGNES);
    const [premier, second] = Array.from(document.querySelectorAll('[data-slot="compte-aujourdhui"]')).map(cl);
    for (const c of [premier!, second!]) {
      expect(c).toEqual(expect.arrayContaining(['rounded-full', 'h-5', 'min-w-5', 'px-1.5', 'text-legende', 'font-semibold', 'tabular-nums']));
      expect(c).not.toContain('rounded-md');
    }
    expect(premier).toEqual(expect.arrayContaining(['bg-primary', 'text-primary-foreground']));
    expect(second).toEqual(expect.arrayContaining(['bg-muted', 'text-encre-douce']));
    expect(second).not.toContain('bg-foreground/7');
  });
});
// TCK-2712:fin
