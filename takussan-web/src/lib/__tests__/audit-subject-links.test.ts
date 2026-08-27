import { describe, it, expect } from 'vitest';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  auditSubjectHref,
  shortSubjectType,
  AUDIT_SUBJECTS_AVEC_ECRAN,
  AUDIT_SUBJECT_ROUTES,
} from '../audit-subject-links';

/**
 * TCK-376 — la table des destinations d'audit, et la garde qui l'empêche de mentir.
 *
 * Le risque de cette table n'est pas qu'elle soit incomplète — un type absent rend du texte, ce
 * qui est le comportement d'avant. Le risque est qu'elle promette une route qui n'existe pas :
 * le lien serait alors mort, et rien dans le typage, le lint ou `tsc` ne le dirait.
 */

describe('shortSubjectType', () => {
  it('rend le dernier segment d’un FQCN', () => {
    expect(shortSubjectType('App\\Models\\Property')).toBe('Property');
    expect(shortSubjectType('Property')).toBe('Property');
  });

  it('rend null sur l’absence, jamais une chaîne vide', () => {
    expect(shortSubjectType(null)).toBeNull();
    expect(shortSubjectType(undefined)).toBeNull();
    expect(shortSubjectType('')).toBeNull();
  });
});

describe('auditSubjectHref', () => {
  // La liste ENTIÈRE et à l'identique : amputer la table fait rougir ce test. La revue adverse
  // de TCK-363 a trouvé trois tables de filtres qui survivaient à leur propre amputation.
  it('n’a d’écran que pour ces quatre types, et pas un de plus', () => {
    expect([...AUDIT_SUBJECTS_AVEC_ECRAN]).toEqual(['Property', 'Booking', 'Lease', 'Customer']);
  });

  it.each([
    ['App\\Models\\Property', 12, '/app/properties/12'],
    ['App\\Models\\Booking', 7, '/app/bookings/7'],
    ['App\\Models\\Lease', 3, '/app/leases/3'],
    ['App\\Models\\Customer', 88, '/app/customers/88'],
  ])('%s #%i → %s', (type, id, attendu) => {
    expect(auditSubjectHref(type, id)).toBe(attendu);
  });

  // Ces types sont RÉELLEMENT audités côté API (`use Auditable` sur 20 modèles au 2026-08-27),
  // et deux d'entre eux sont proposés par le sélecteur de filtre du journal. Une résolution par
  // convention les aurait envoyés sur un 404.
  it.each([
    'App\\Models\\Invoice',
    'App\\Models\\User',
    'App\\Models\\Payout',
    'App\\Models\\KycDossier',
    'App\\Models\\Announcement',
  ])('%s n’a pas de destination', (type) => {
    expect(auditSubjectHref(type, 5)).toBeNull();
  });

  it('rend null sans identifiant — un lien vers `/app/properties/null` serait pire que du texte', () => {
    expect(auditSubjectHref('App\\Models\\Property', null)).toBeNull();
    expect(auditSubjectHref('App\\Models\\Property', undefined)).toBeNull();
    expect(auditSubjectHref('App\\Models\\Property', 0)).toBeNull();
  });

  it('rend null sans type', () => {
    expect(auditSubjectHref(null, 12)).toBeNull();
    expect(auditSubjectHref('', 12)).toBeNull();
  });
});

/**
 * LA garde. Elle ne relit pas la table : elle va voir sur le disque si la route existe.
 *
 * C'est ce qui distingue ce fichier d'un test qui recopierait la table à côté d'elle-même — et
 * c'est la seule forme qui attrape le cas coûteux : quelqu'un ajoute `Invoice: '/app/invoices'`
 * en pensant que l'écran existe, et les liens partent sur un 404 sans qu'aucune suite rougisse.
 */
describe('chaque destination correspond à une route réellement présente', () => {
  it.each([...AUDIT_SUBJECT_ROUTES])('%s/[id]/page.tsx existe', async (route) => {
    const chemin = resolve(
      process.cwd(),
      `src/app/(dashboard)${route}/[id]/page.tsx`,
    );
    await expect(access(chemin)).resolves.toBeUndefined();
  });
});
