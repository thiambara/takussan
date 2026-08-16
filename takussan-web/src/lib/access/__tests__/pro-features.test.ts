import { describe, it, expect } from 'vitest';

import { PRO_ROUTES, isProRouteLocked } from '../pro-features';
import type { User, UserRole } from '@/types/user';

/**
 * TCK-284 — AC2/AC3 : le cadenas doit couvrir EXACTEMENT ce que les gardes
 * serveur refusent. Ni moins (une entrée cliquable qui renvoie en silence),
 * ni plus (un cadenas devant un écran auquel rien ne s'oppose).
 *
 * Ce fichier n'existait pas : `PRO_ROUTES` et `isProRouteLocked` ont été
 * modifiés quatre fois en trois mois — ajout de quatre routes, retrait des
 * quatre, réintroduction — sans qu'aucun test n'exécute jamais la fonction.
 * `scripts/check-pro-routes.mjs` lit la LISTE et les pages ; personne ne
 * lisait le prédicat. *Une liste gardée par un script et une décision gardée
 * par rien.*
 */

const utilisateur = (roles: UserRole[]): User => ({
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  phone: null,
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: null,
  two_factor_enabled: false,
  agency_id: 7,
  roles,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
});

describe('PRO_ROUTES', () => {
  it('ne contient que les surfaces que la spec réserve aux agences standard', () => {
    // Le contenu exact est la décision produit de TCK-284, pas un détail
    // d'implémentation : « Vue agence » (le reporting cross-équipe nommément
    // restreint par features.md §1.12) et « Propriétaires » (TCK-256).
    expect([...PRO_ROUTES].filter((r) => r.startsWith('/app'))).toEqual([
      '/app/overview/agency',
      '/app/owners',
    ]);
  });

  it("ne cadenasse ni les KPI ni les alertes de seuil — aucune spec ne les restreint", () => {
    expect(PRO_ROUTES.has('/app/overview/kpis')).toBe(false);
    expect(PRO_ROUTES.has('/app/overview/alerts')).toBe(false);
  });
});

describe('isProRouteLocked', () => {
  it('cadenasse un agency_admin d’agence individual', () => {
    expect(isProRouteLocked(utilisateur(['agency_admin']), false, '/app/owners')).toBe(true);
  });

  it('cadenasse un agent d’agence individual sur la vue agence', () => {
    // La page le redirige et l'API lui rend 403 : sans cadenas, il cliquait
    // une entrée d'apparence normale pour se faire renvoyer sans explication.
    expect(isProRouteLocked(utilisateur(['agent']), false, '/app/overview/agency')).toBe(true);
  });

  it("ne cadenasse RIEN quand l'agence est standard", () => {
    for (const href of PRO_ROUTES) {
      expect(isProRouteLocked(utilisateur(['agency_admin']), true, href)).toBe(false);
      expect(isProRouteLocked(utilisateur(['agent']), true, href)).toBe(false);
    }
  });

  it('refuse de conclure « ouvert » quand le kind est inconnu — fail-closed', () => {
    // `undefined` = l'agence n'a pas pu être résolue. Un écran réservé se
    // refuse quand on ne SAIT PAS, pas seulement quand on sait que non.
    expect(isProRouteLocked(utilisateur(['agency_admin']), undefined, '/app/owners')).toBe(true);
  });

  it('ne cadenasse jamais un super_admin', () => {
    for (const href of PRO_ROUTES) {
      expect(isProRouteLocked(utilisateur(['super_admin']), false, href)).toBe(false);
    }
  });

  it('AC3 — ne cadenasse pas les rôles hors périmètre', () => {
    // Un owner ou un tenant ne se voit pousser aucune de ces entrées ; si le
    // prédicat les cadenassait quand même, on ne saurait plus distinguer une
    // garde juste d'une garde trop large.
    for (const roles of [['owner'], ['tenant'], ['customer']] as UserRole[][]) {
      for (const href of PRO_ROUTES) {
        expect(isProRouteLocked(utilisateur(roles), false, href)).toBe(false);
      }
    }
  });

  it('ne cadenasse aucune route absente de PRO_ROUTES', () => {
    for (const href of ['/app/overview/kpis', '/app/overview/alerts', '/app/messages']) {
      expect(isProRouteLocked(utilisateur(['agency_admin']), false, href)).toBe(false);
    }
  });
});
