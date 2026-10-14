import { describe, expect, it } from 'vitest';
import { LayoutDashboard } from 'lucide-react';

import type { AccesAdmin } from '@/lib/access/pages-admin';
import { avecSectionAgence, buildNavItems, type NavItem } from '../AppSidebar';
import type { User } from '@/types/user';

/**
 * TCK-649 (ADR-0064 §2) — `avecSectionAgence`, la fonction qui DÉRIVE la section d'agence de la
 * table des pages. Le rendu, profil par profil, est éprouvé par `AppSidebar.section-agence.test.tsx` ;
 * ici, la règle seule : une entrée par page À MENU accessible, rien d'autre, rien sinon.
 *
 * Elle remplace `avecEntreeAdmin` (TCK-633), qui substituait UNE entrée « Administration » à un
 * emplacement posé par `buildNavItems`.
 */
const accueil: NavItem = { href: '/app', labelKey: 'dashboard', icon: LayoutDashboard, section: 'primary' };

const SOLO: AccesAdmin = {
  chemins: ['/app/agency', '/app/agency/kyc', '/app/agency/finances', '/app/agency/finances/reconciliation'],
  espaceIndividuel: true,
};

describe('avecSectionAgence (TCK-649)', () => {
  it('ajoute une entrée par page à menu accessible, après les entrées de travail', () => {
    const items = avecSectionAgence([accueil], SOLO);
    expect(items[0]).toBe(accueil);
    expect(items.slice(1).map((i) => [i.href, i.labelKey, i.section, i.labelSpace])).toEqual([
      ['/app/agency', 'agency', 'admin', 'nav.admin'],
      ['/app/agency/kyc', 'kyc', 'admin', 'nav.admin'],
      ['/app/agency/finances', 'finances', 'admin', 'nav.admin'],
    ]);
  });

  it('une page sans entrée de menu (le rapprochement) n’en reçoit pas, même accessible', () => {
    expect(avecSectionAgence([], SOLO).map((i) => i.href)).not.toContain('/app/agency/finances/reconciliation');
  });

  it('aucune page accessible : la liste est rendue telle quelle', () => {
    expect(avecSectionAgence([accueil], { chemins: [], espaceIndividuel: false })).toEqual([accueil]);
  });

  it('seules les deux files de modération portent un compteur', () => {
    const tout = avecSectionAgence([], {
      chemins: ['/app/agency/team', '/app/agency/moderation', '/app/agency/moderation/properties'],
      espaceIndividuel: false,
    });
    expect(tout.map((i) => [i.href, i.counterKey])).toEqual([
      ['/app/agency/team', undefined],
      ['/app/agency/moderation', 'reviewModeration'],
      ['/app/agency/moderation/properties', 'propertyModeration'],
    ]);
  });

  it('buildNavItems ne pose plus d’emplacement d’administration : c’est la table qui décide', () => {
    for (const roles of [['agency_admin'], ['super_admin'], ['agent'], ['owner']] as const) {
      const items = buildNavItems({ id: 1, roles: [...roles], agency_id: 7 } as unknown as User);
      expect(items.filter((i) => i.section === 'admin')).toEqual([]);
    }
  });
});
