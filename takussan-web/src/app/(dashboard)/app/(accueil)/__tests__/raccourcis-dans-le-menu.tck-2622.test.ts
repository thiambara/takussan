import { describe, expect, it } from 'vitest';

import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { composerMenu, entreesDuMenu } from '@/lib/navigation/composer-menu';
import { ongletsDesRapports } from '@/lib/navigation/rapports';
import { resoudrePersona } from '@/lib/navigation/personas';
import type { ContexteDeMenu } from '@/lib/navigation/types';
import type { UserRole } from '@/types/user';

/**
 * TCK-2622 — « Plus de Raccourcis : le menu et « Aller à… » les portent ». `DashboardShortcuts` est
 * supprimé ; ce test FIGE ce qu'il proposait à chaque compte (sa table `buildShortcuts`, relevée avant
 * suppression) et exige que chaque destination soit dans le menu composé du persona.
 *
 * Les raccourcis FAUX du client (« Mes baux », « Paiements » sans bail) quittent l'ACCUEIL (AC4,
 * `page.tck-2622.test.tsx`). Le menu du client, lui, les ouvre délibérément (`catalogue.ts`,
 * `baux` / `paiements` : `client(ctx)`, ADR-0089) : ce n'est pas l'objet de ce ticket.
 */

/** Les raccourcis de l'ancien accueil, par compte (dédupliqués comme `buildShortcuts`). */
const ANCIENS_RACCOURCIS: readonly { readonly nom: string; readonly roles: UserRole[]; readonly hrefs: readonly string[] }[] = [
  // `entreeAdmin` : la première page d'administration ouverte, ici l'équipe (premier chemin de la table).
  { nom: 'admin d’agence', roles: ['agency_admin', 'customer'], hrefs: [PAGES_ADMIN[0]!.chemin, '/app/overview', '/app/overview/exports', '/app/messages'] },
  { nom: 'agent', roles: ['agent', 'customer'], hrefs: ['/app/customers', '/app/visits', '/app/calendar', '/app/messages'] },
  { nom: 'bailleur', roles: ['owner', 'customer'], hrefs: ['/app/properties', '/app/leases', '/app/payments', '/app/messages'] },
  { nom: 'locataire', roles: ['customer', 'tenant'], hrefs: ['/app/leases', '/app/payments', '/app/documents', '/app/favorites', '/app/messages'] },
  { nom: 'client', roles: ['customer'], hrefs: ['/app/documents', '/app/favorites', '/app/messages'] },
  { nom: 'prestataire', roles: ['service_provider', 'customer'], hrefs: ['/app/maintenance', '/app/calendar', '/app/messages'] },
];

/** Tout ce que le menu composé du persona porte : action, carte, groupes, « Plus », « Aussi ». */
function hrefsDuMenu(roles: UserRole[]): Set<string> {
  const ctx: ContexteDeMenu = {
    roles,
    // Les capacités du profil : le menu n'en lit qu'une (publier un bien), accordée au personnel.
    capacites: roles.includes('agency_admin') || roles.includes('agent') ? ['properties.create'] : [],
    cheminsAdmin: roles.includes('agency_admin') ? PAGES_ADMIN.map((p) => p.chemin) : [],
  };
  const menu = composerMenu(ctx, resoudrePersona({ roles, typeProfilActif: null, agenceIndividuelle: false }));
  return new Set([...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : []), ...(menu.action ? [menu.action.href] : [])]);
}

/**
 * TCK-2628 (ADR-0096 § 4) — « Statistiques » et « Exports » sont devenus « Rapports » et son onglet Exports :
 * l'ancien raccourci est dans le menu quand « Rapports » y est ET que l'onglet est ouvert pour la persona.
 */
const DEVENUS_DES_ONGLETS: Readonly<Record<string, 'ensemble' | 'exports'>> = { '/app/overview': 'ensemble', '/app/overview/exports': 'exports' };

describe('TCK-2622 — chaque destination d’un ancien raccourci reste dans le menu composé', () => {
  it.each(ANCIENS_RACCOURCIS)('$nom', ({ roles, hrefs }) => {
    const menu = hrefsDuMenu(roles);
    const persona = resoudrePersona({ roles, typeProfilActif: null, agenceIndividuelle: false });
    for (const href of hrefs) {
      const onglet = DEVENUS_DES_ONGLETS[href];
      if (onglet) {
        expect(menu.has('/app/reports'), `${roles.join('+')} — ${href} → /app/reports`).toBe(true);
        expect(ongletsDesRapports({ persona, cheminsAdmin: PAGES_ADMIN.map((p) => p.chemin), capacites: [] }), href).toContain(onglet);
      } else expect(menu.has(href), `${roles.join('+')} — ${href}`).toBe(true);
    }
  });
});
