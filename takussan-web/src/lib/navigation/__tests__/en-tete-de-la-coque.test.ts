import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import type { UserRole } from '@/types/user';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { formeDeLaRoute, parentDeLaRoute, titreDeLaRoute, type TitreDerive } from '../en-tete-de-la-coque';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2617 — la forme, le titre et le repli de l'en-tête du téléphone, sur CHAQUE `page.tsx` de `/app`.
 * Une route neuve sans titre fait rougir : « une page sans titre propre n'est jamais sans titre ».
 */
const RACINE_APP = join(process.cwd(), 'src', 'app', '(dashboard)', 'app');

function routes(dossier: string): string[] {
  const sortie: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom === '__tests__') continue;
      sortie.push(...routes(chemin));
    } else if (nom === 'page.tsx') {
      const segments = relative(RACINE_APP, dossier)
        .split(sep)
        .filter((s) => s !== '' && !/^\(.*\)$/.test(s)) // groupes de routes : hors URL
        .map((s) => (/^\[(?!\.\.\.)/.test(s) ? '42' : s)); // un segment dynamique : un identifiant
      sortie.push(['/app', ...segments].join('/'));
    }
  }
  return sortie;
}

const TOUTES = routes(RACINE_APP).filter((r) => !r.includes('[...')); // l'introuvable n'a pas d'en-tête propre

const ADMIN: ContexteDeMenu = {
  roles: ['agency_admin', 'agent', 'customer'] as UserRole[],
  capacites: [],
  cheminsAdmin: PAGES_ADMIN.map((p) => p.chemin),
};
const CLIENT: ContexteDeMenu = { roles: ['customer', 'tenant'] as UserRole[], capacites: [] };

function libelle(titre: TitreDerive | null): string | undefined {
  if (!titre) return undefined;
  const valeur = [...titre.espace.split('.'), ...titre.cle.split('.')].reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    fr,
  );
  return typeof valeur === 'string' ? valeur : undefined;
}

describe('TCK-2617 — chaque route de /app a une forme et un titre', () => {
  it('le relevé des routes est complet (garde-fou du parcours)', () => {
    expect(TOUTES.length).toBeGreaterThan(50);
    expect(TOUTES).toContain('/app/leases/42');
    expect(TOUTES).toContain('/app/agency/finances/reconciliation/42');
  });

  it.each(TOUTES)('%s : un titre traduit, pour l’admin comme pour le client', (route) => {
    expect(libelle(titreDeLaRoute(route, ADMIN)), JSON.stringify(titreDeLaRoute(route, ADMIN))).toBeTruthy();
    expect(libelle(titreDeLaRoute(route, CLIENT))).toBeTruthy();
  });

  it.each(TOUTES)('%s : un détail a un parent qui est une page de /app', (route) => {
    const parent = parentDeLaRoute(route);
    if (formeDeLaRoute(route) !== 'detail') return;
    expect(parent).not.toBeNull();
    expect(TOUTES).toContain(parent);
  });
});

describe('TCK-2617 — la forme par route', () => {
  it('accueil, racines, détails, plein écran', () => {
    expect(formeDeLaRoute('/app')).toBe('accueil');
    for (const r of ['/app/leases', '/app/leads', '/app/messages', '/app/profile', '/app/agency/team', '/app/overview/owner', '/app/notifications']) {
      expect(formeDeLaRoute(r), r).toBe('racine');
    }
    for (const r of ['/app/leases/7', '/app/customers/3', '/app/maintenance/9', '/app/documents/1', '/app/profile/notifications', '/app/agency/finances/reconciliation/12']) {
      expect(formeDeLaRoute(r), r).toBe('detail');
    }
    for (const r of ['/app/properties/new', '/app/leases/new', '/app/customers/new']) {
      expect(formeDeLaRoute(r), r).toBe('plein-ecran');
    }
  });

  it('la requête et la barre finale ne changent rien', () => {
    expect(formeDeLaRoute('/app/leases/7/')).toBe('detail');
    expect(parentDeLaRoute('/app/leases/7?onglet=paiements')).toBe('/app/leases');
  });
});

describe('TCK-2617 — le repli du retour est la liste parente', () => {
  it.each([
    ['/app/leases/7', '/app/leases'],
    ['/app/maintenance/9', '/app/maintenance'],
    ['/app/documents/1', '/app/documents'],
    ['/app/customers/3', '/app/customers'],
    ['/app/agency/finances/reconciliation/12', '/app/agency/finances/reconciliation'],
    ['/app/leases/new', '/app/leases'],
  ])('%s → %s', (route, parent) => {
    expect(parentDeLaRoute(route)).toBe(parent);
  });

  it('une racine n’a pas de retour', () => {
    expect(parentDeLaRoute('/app/leases')).toBeNull();
    expect(parentDeLaRoute('/app')).toBeNull();
    expect(parentDeLaRoute('/super-admin/users/3')).toBeNull();
  });
});

describe('TCK-2617 — le titre dérivé du menu', () => {
  it('le libellé de l’entrée qui sert la route, selon le compte', () => {
    expect(libelle(titreDeLaRoute('/app/leases', ADMIN))).toBe('Baux');
    expect(libelle(titreDeLaRoute('/app/leases', CLIENT))).toBe('Mes baux');
    expect(libelle(titreDeLaRoute('/app/leads', ADMIN))).toBe('Demandes de contact');
    expect(libelle(titreDeLaRoute('/app/agency/team', ADMIN))).toBe('Équipe');
  });

  it('un détail non nommé prend le titre de sa liste ; hors /app, rien', () => {
    expect(libelle(titreDeLaRoute('/app/leases/7', ADMIN))).toBe('Baux');
    expect(titreDeLaRoute('/super-admin', ADMIN)).toBeNull();
    expect(titreDeLaRoute('/fr/properties', ADMIN)).toBeNull();
  });
});
