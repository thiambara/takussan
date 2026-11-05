import { describe, expect, it } from 'vitest';
import { composerMenu } from '../composer-menu';
import { etapesARendre } from '../demarrer';
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
