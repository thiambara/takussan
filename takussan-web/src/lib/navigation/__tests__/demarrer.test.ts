import { describe, expect, it } from 'vitest';
import { accesDepuis } from '@/lib/access/pages-admin';
import type { UserRole } from '@/types/user';
import { cheminOuvert, composerMenu } from '../composer-menu';
import { etapesARendre, type ModeDemarrer } from '../demarrer';
import { DISPOSITIONS } from '../dispositions';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

const TROIS = [
  { code: 'premier_bien', faite: false },
  { code: 'kyc', faite: false },
  { code: 'equipe', faite: false },
];

describe('TCK-2479 — etapesARendre', () => {
  it('une agence neuve : trois liens, dans l’ordre de l’API', () => {
    expect(etapesARendre(TROIS, 'espace', null)).toEqual({
      restantes: [
        { code: 'premier_bien', href: '/app/properties/new', cle: 'etapes.espace.premier_bien' },
        { code: 'kyc', href: '/app/agency/kyc', cle: 'etapes.espace.kyc' },
        { code: 'equipe', href: '/app/agency/team', cle: 'etapes.espace.equipe' },
      ],
      faites: 0,
      total: 3,
    });
  });

  it('AC5 — une étape faite sort du groupe, et compte dans la progression', () => {
    const { restantes, faites, total } = etapesARendre(
      [{ ...TROIS[0]!, faite: true }, TROIS[1]!, TROIS[2]!],
      'espace',
      null,
    );
    expect(restantes.map((e) => e.code)).toEqual(['kyc', 'equipe']);
    expect([faites, total]).toEqual([1, 3]);
  });

  it('AC5 — tout fait : plus aucune étape à rendre', () => {
    const { restantes, faites, total } = etapesARendre(
      TROIS.map((e) => ({ ...e, faite: true })),
      'espace',
      null,
    );
    expect(restantes).toEqual([]);
    expect([faites, total]).toEqual([3, 3]);
  });

  it('un code inconnu ne fait ni lien ni compte', () => {
    expect(etapesARendre([{ code: 'logo', faite: false }], 'espace', null)).toEqual({
      restantes: [],
      faites: 0,
      total: 0,
    });
  });

  it('bailleur : le KYC rouvre SON assistant ; sans profil bailleur actif, l’assistant choisit', () => {
    const kyc = [{ code: 'kyc', faite: false }];
    expect(etapesARendre(kyc, 'bailleur', 'owner:3').restantes[0]).toEqual({
      code: 'kyc',
      href: '/onboarding/owner?owner=3',
      cle: 'etapes.bailleur.kyc',
    });
    expect(etapesARendre(kyc, 'bailleur', null).restantes[0]?.href).toBe('/onboarding/owner');
    expect(etapesARendre(kyc, 'bailleur', 'agency_admin:2').restantes[0]?.href).toBe('/onboarding/owner');
    expect(etapesARendre(kyc, 'bailleur', 'owner:abc').restantes[0]?.href).toBe('/onboarding/owner');
  });
});

describe('TCK-2479 — « Démarrer » dans les dispositions et le menu composé', () => {
  it('admin d’agence et hôte : l’espace ; bailleur : le sien ; personne d’autre', () => {
    expect(Object.fromEntries(PERSONAS.map((p) => [p, DISPOSITIONS[p].demarrer ?? null]))).toEqual({
      client: null,
      locataire: null,
      bailleur: 'bailleur',
      agent: null,
      'admin-agence': 'espace',
      hote: 'espace',
      prestataire: null,
      plateforme: null,
    });
  });

  it('composerMenu le rend, et le retire d’un espace suspendu', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
    expect(composerMenu(ctx, 'admin-agence').demarrer).toBe('espace');
    expect(composerMenu({ ...ctx, agenceSuspendue: true }, 'admin-agence').demarrer).toBeNull();
    expect(composerMenu(ctx, 'agent').demarrer).toBeNull();
    expect(composerMenu(ctx, 'admin-agence').priorites).toBe(DISPOSITIONS['admin-agence'].priorites);
  });

  it('une entrée composée porte le hrefATraiter de sa destination', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: [], cheminsAdmin: [] };
    const entrees = composerMenu(ctx, 'agent').groupes.flatMap((g) => g.entrees);
    expect(entrees.find((e) => e.id === 'demandes')?.hrefATraiter).toBe('/app/leads?filtre=todo');
    expect(entrees.find((e) => e.id === 'messagerie')).not.toHaveProperty('hrefATraiter');
  });
});

/**
 * Revue de TCK-2479 (M6) — l'API rend les étapes sous `agency.update` (`configure`) ; chaque écran
 * a SA garde : `/app/agency/kyc` exige `agency.update_kyc` (`PAGES_ADMIN`), `/app/properties/new`
 * `properties.create` ou d'être bailleur
 * (`modeDeCreationDeBien`). Les chemins d'administration sont calculés ici par la VRAIE table
 * (`accesDepuis`), comme le layout de `/app` les fournit à la barre.
 */
describe('Revue de TCK-2479 (M6) — une étape ne vise jamais une page que le compte n’ouvre pas', () => {
  const SYSTEME = ['agency.update', 'agency.update_kyc', 'team.invite', 'team.assign_role', 'team.suspend', 'properties.create'];

  function liens(
    roles: UserRole[],
    agence: 'standard' | 'individual' | null,
    capacites: string[],
    mode: ModeDemarrer,
    codes: string[],
    idProfilActif: string | null = null,
  ) {
    const personnel = roles.includes('agency_admin') || roles.includes('agent');
    const ctx: ContexteDeMenu = {
      roles,
      // Comme `AppSidebar` : les capacités ne se lisent que pour le personnel.
      capacites: personnel ? capacites : [],
      cheminsAdmin: accesDepuis({ roles, agence: agence ? { kind: agence } : null, capacites }).chemins,
    };
    const etapes = codes.map((code) => ({ code, faite: false }));
    const rendu = etapesARendre(etapes, mode, idProfilActif, (href) => cheminOuvert(ctx, href));
    return { hrefs: rendu.restantes.map((e) => e.href), total: rendu.total };
  }

  const ADMIN: UserRole[] = ['customer', 'agency_admin'];
  const HOTE: UserRole[] = ['customer', 'agency_admin', 'owner'];
  const BAILLEUR: UserRole[] = ['customer', 'owner'];

  it.each([
    ['admin, rôle système', ADMIN, 'standard', SYSTEME, ['/app/properties/new', '/app/agency/kyc', '/app/agency/team']],
    // `/app/agency/team` s'ouvre à TOUT admin : `ouvertePar` ne juge que le non-admin (`pageAccessible`).
    ['admin, rôle réduit à agency.update', ADMIN, 'standard', ['agency.update'], ['/app/agency/team']],
    ['admin, sans KYC', ADMIN, 'standard', ['agency.update', 'properties.create'], ['/app/properties/new', '/app/agency/team']],
    ['admin, sans création de bien', ADMIN, 'standard', ['agency.update', 'agency.update_kyc'], ['/app/agency/kyc', '/app/agency/team']],
  ] as const)('%s', (_cas, roles, agence, capacites, attendus) => {
    const { hrefs, total } = liens([...roles], agence, [...capacites], 'espace', ['premier_bien', 'kyc', 'equipe']);
    expect(hrefs).toEqual(attendus);
    // Une étape fermée n'est pas comptée non plus : « 0 sur 3 » d'un groupe à un seul lien mentirait.
    expect(total).toBe(attendus.length);
  });

  it('hôte : ses deux étapes ; sans agency.update_kyc, le seul premier bien', () => {
    expect(liens(HOTE, 'individual', SYSTEME, 'espace', ['premier_bien', 'kyc']).hrefs).toEqual([
      '/app/properties/new',
      '/app/agency/kyc',
    ]);
    expect(liens(HOTE, 'individual', ['agency.update', 'properties.create'], 'espace', ['premier_bien', 'kyc']).hrefs).toEqual([
      '/app/properties/new',
    ]);
  });

  it('bailleur : il PROPOSE un bien (`/app/properties/new`), et son assistant n’est pas une page du menu', () => {
    expect(liens(BAILLEUR, null, [], 'bailleur', ['premier_bien', 'kyc'], 'owner:3').hrefs).toEqual([
      '/app/properties/new',
      '/onboarding/owner?owner=3',
    ]);
  });

  it('cheminOuvert ignore la requête, et ne juge pas un chemin hors catalogue', () => {
    const ctx: ContexteDeMenu = { roles: ADMIN, capacites: [], cheminsAdmin: [] };
    expect(cheminOuvert(ctx, '/app/agency/kyc?x=1')).toBe(false);
    expect(cheminOuvert(ctx, '/onboarding/owner')).toBe(true);
  });
});
