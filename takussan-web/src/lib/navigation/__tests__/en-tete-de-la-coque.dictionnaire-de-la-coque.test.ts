import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import namespaces from '@/i18n/namespaces.json';
import type { UserRole } from '@/types/user';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { ROUTES_HORS_MENU, titreDeLaRoute } from '../en-tete-de-la-coque';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2675 — l'en-tête du téléphone est rendu par la coque de `/app`, AU-DESSUS des frontières de
 * dictionnaire des sections (`(dashboard)/app/agency`, `…/owners`…). Le titre qu'il dérive d'une
 * route hors du menu se traduit donc sous le seul dictionnaire de la coque : `admin.reconciliation.title`
 * y levait MISSING_MESSAGE au rendu serveur, et `/app/agency/finances/reconciliation` (et chaque
 * relevé) répondait 500. Chaque titre dérivé d'une route hors du menu vit ici dans un espace que la
 * coque transporte, et existe en français.
 */
type Frontieres = Record<string, readonly string[]>;
const { plancher, frontieres } = namespaces as unknown as { plancher: readonly string[]; frontieres: Frontieres };
const DE_LA_COQUE = new Set([...plancher, ...(frontieres['(dashboard)'] ?? []), ...(frontieres['(dashboard)/app'] ?? [])]);

const ADMIN: ContexteDeMenu = { roles: ['agency_admin'] as UserRole[], capacites: null, cheminsAdmin: PAGES_ADMIN.map((p) => p.chemin) };

function lire(chemin: string): unknown {
  return chemin.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), fr);
}

describe('le titre dérivé d’une route hors du menu, sous le dictionnaire de la coque', () => {
  it('le relevé n’est pas vide, et la coque transporte `nav`', () => {
    expect(ROUTES_HORS_MENU.length).toBeGreaterThan(10);
    expect(DE_LA_COQUE.has('nav')).toBe(true);
  });

  it.each(ROUTES_HORS_MENU.map((r) => [r]))('%s', (route) => {
    const titre = titreDeLaRoute(route, ADMIN, 'admin-agence');
    expect(titre, route).not.toBeNull();
    const espace = titre?.espace.split('.')[0] ?? '';
    expect(DE_LA_COQUE.has(espace), `${route} → ${titre?.espace} hors du dictionnaire de la coque`).toBe(true);
    expect(typeof lire(`${titre?.espace}.${titre?.cle}`), `${titre?.espace}.${titre?.cle}`).toBe('string');
  });

  it('un relevé (`…/reconciliation/12`) prend le titre du rapprochement', () => {
    expect(titreDeLaRoute('/app/agency/finances/reconciliation/12', ADMIN, 'admin-agence')).toEqual({ espace: 'nav.admin', cle: 'reconciliation' });
  });
});
