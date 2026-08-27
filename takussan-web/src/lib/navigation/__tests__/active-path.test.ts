/**
 * TCK-377 — La règle de surlignage, éprouvée hors de tout composant.
 *
 * Elle vit maintenant à un seul endroit pour trois shells ; c'est donc ici que se paie une
 * erreur, et ici qu'il faut la garder. Les cas ne sont pas inventés : ce sont les routes réelles
 * de `/app` et `/admin` qui se chevauchent.
 */
import { describe, expect, it } from 'vitest';
import {
  ADMIN_EXACT_ROOTS,
  APP_EXACT_ROOTS,
  SUPER_ADMIN_EXACT_ROOTS,
  isActiveHref,
  resolveActiveHref,
} from '../active-path';

const APP = [
  '/app',
  '/app/properties',
  '/app/properties/new',
  '/app/leases',
  '/app/leases/onboarding-pending',
  '/app/maintenance',
  '/app/maintenance/providers',
  '/app/overview',
  '/app/overview/exports',
  '/app/overview/kpis',
];

describe('resolveActiveHref — le plus long préfixe, et lui seul', () => {
  it.each([
    ['/app', '/app'],
    ['/app/properties', '/app/properties'],
    ['/app/properties/42', '/app/properties'],
    ['/app/properties/new', '/app/properties/new'],
    ['/app/leases/7', '/app/leases'],
    ['/app/leases/new', '/app/leases'],
    ['/app/leases/onboarding-pending', '/app/leases/onboarding-pending'],
    ['/app/maintenance/9', '/app/maintenance'],
    ['/app/maintenance/providers', '/app/maintenance/providers'],
    ['/app/overview/exports', '/app/overview/exports'],
    ['/app/overview/kpis', '/app/overview/kpis'],
    ['/app/overview/agent', '/app/overview'],
  ])('%s → %s', (pathname, attendu) => {
    expect(resolveActiveHref(pathname, APP, APP_EXACT_ROOTS)).toBe(attendu);
  });

  it('la racine ne devient le parent de rien', () => {
    expect(resolveActiveHref('/app/profile', APP, APP_EXACT_ROOTS)).toBeNull();
    expect(resolveActiveHref('/app/account/privacy', APP, APP_EXACT_ROOTS)).toBeNull();
  });

  it('sans racine exacte, /app avalerait les 46 routes de l’espace', () => {
    // La démonstration de ce que `exactRoots` empêche — pas une garde de production.
    expect(resolveActiveHref('/app/profile', APP, [])).toBe('/app');
  });

  it('rend null sur un pathname absent (premier rendu serveur)', () => {
    expect(resolveActiveHref(null, APP, APP_EXACT_ROOTS)).toBeNull();
  });

  it('ne rend jamais un href qui n’est qu’un préfixe de CHAÎNE', () => {
    // `/app/properties-archive` commence par `/app/properties` en tant que texte, pas en tant
    // que chemin. C'est le défaut classique d'un `startsWith` sans séparateur.
    expect(resolveActiveHref('/app/properties-archive', APP, APP_EXACT_ROOTS)).toBeNull();
  });

  it('la console admin garde ses DEUX racines exactes', () => {
    const admin = ['/admin', '/admin/agency', '/admin/agency/kyc', '/admin/settings'];
    expect(resolveActiveHref('/admin', admin, ADMIN_EXACT_ROOTS)).toBe('/admin');
    expect(resolveActiveHref('/admin/agency/kyc', admin, ADMIN_EXACT_ROOTS)).toBe('/admin/agency/kyc');
    expect(resolveActiveHref('/admin/agency/autre', admin, ADMIN_EXACT_ROOTS)).toBeNull();
    // Le commentaire d'origine d'`AdminSidebar` : « Paramètres » reste allumé sur /admin/settings/tags.
    expect(resolveActiveHref('/admin/settings/tags', admin, ADMIN_EXACT_ROOTS)).toBe('/admin/settings');
  });
});

describe('isActiveHref — la forme PRÉFIXE, celle que garde le shell super-admin', () => {
  it('laisse le parent allumé avec son enfant', () => {
    expect(isActiveHref('/super-admin/system/tags', '/super-admin/system', SUPER_ADMIN_EXACT_ROOTS))
      .toBe(true);
    expect(isActiveHref('/super-admin/system/tags', '/super-admin/system/tags', SUPER_ADMIN_EXACT_ROOTS))
      .toBe(true);
  });

  it('garde la racine par égalité stricte', () => {
    expect(isActiveHref('/super-admin', '/super-admin', SUPER_ADMIN_EXACT_ROOTS)).toBe(true);
    expect(isActiveHref('/super-admin/users', '/super-admin', SUPER_ADMIN_EXACT_ROOTS)).toBe(false);
  });

  it('rend false sur un pathname absent', () => {
    expect(isActiveHref(null, '/super-admin', SUPER_ADMIN_EXACT_ROOTS)).toBe(false);
  });
});
