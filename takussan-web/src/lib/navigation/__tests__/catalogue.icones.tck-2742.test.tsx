import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UserRole } from '@/types/user';
import { CATALOGUE, estOuverte, iconeDe } from '../catalogue';

/**
 * TCK-2742 — quatre entrées du menu portaient une icône qu'aucune maquette ne dessine. Toutes les
 * références gelées `app-*` leur donnent la même, et la décision du lead (2026-11-11) est de suivre
 * les maquettes. Le catalogue est la source unique : colonne, rail, tiroir, « Aller à… », récents et
 * barre d'onglets lisent `iconeDe()`.
 *
 * Le test épingle la classe lucide RENDUE (`lucide-receipt`…) et non le composant importé : c'est elle
 * que l'outil de fidélité compare, et deux noms d'export peuvent désigner la même icône.
 *
 * La ligne « Crédits » du menu et de la feuille du compte n'en dépend pas : elle garde `Coins`
 * (`MenuDuCompte`, `FeuilleDuCompte`, app-coque a-5) — épinglé à part, AC3.
 */
const ATTENDUES: readonly { id: string; roles: UserRole[]; classe: string; ancienne: string }[] = [
  { id: 'commissions', roles: ['agent'], classe: 'lucide-receipt', ancienne: 'lucide-hand-coins' },
  { id: 'etats-des-lieux', roles: ['agent'], classe: 'lucide-clipboard-check', ancienne: 'lucide-clipboard-list' },
  { id: 'credits', roles: ['agency_admin'], classe: 'lucide-credit-card', ancienne: 'lucide-coins' },
  { id: 'recherches', roles: ['tenant'], classe: 'lucide-search', ancienne: 'lucide-bookmark-check' },
];

function classeRendue(id: string, roles: UserRole[]): string {
  const destination = CATALOGUE.find((d) => d.id === id);
  expect(destination, id).toBeDefined();
  const ctx = { roles, capacites: null };
  expect(estOuverte(destination!, ctx), `${id} ouverte à ${roles.join('+')}`).toBe(true);
  const html = renderToStaticMarkup(createElement(iconeDe(destination!, ctx)));
  return /class="([^"]*)"/.exec(html)?.[1] ?? '';
}

describe('TCK-2742 — les icônes du menu suivent les maquettes', () => {
  for (const { id, roles, classe, ancienne } of ATTENDUES) {
    it(`« ${id} » rend ${classe} (la persona qui la voit : ${roles.join('+')})`, () => {
      const classes = classeRendue(id, roles).split(/\s+/);
      expect(classes).toContain(classe);
      expect(classes).not.toContain(ancienne);
    });
  }
});
