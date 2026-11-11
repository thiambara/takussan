import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import frMessages from '@/messages/fr.json';

/**
 * TCK-2616 — les mots de l'entrée (ADR-0095, révisé le 2026-11-10 : « vouvoiement partout »).
 *
 * Chaque surface d'entrée est décrite par ses FICHIERS, jamais par une liste d'espaces de noms
 * recopiée à la main : le test lit les espaces que ces fichiers ouvrent (`useTranslations('…')`,
 * `getTranslations('…')`, `i18nNamespace="…"`), puis toutes les chaînes `fr` qu'ils contiennent.
 * Une clé neuve sous l'un de ces espaces est donc jugée sans que personne ne pense à l'ajouter ici.
 *
 * Ce qui est jugé, c'est la SOURCE du texte rendu : le texte en dur dans ces fichiers est déjà
 * refusé par `check-i18n` (cliquet par fichier). Le wolof est en pause et un texte wolof existant
 * ne se réécrit pas (ADR-0095 § 4) : seul le `fr` est lu.
 */

const SRC = join(__dirname, '..', '..', '..');

/** Les espaces partagés par tout le produit : on n'y juge que ce que l'entrée en lit (aucun ici). */
const PARTAGES = new Set(['common', 'errors', 'ui.toast', 'profile.types', 'profile.switcher', 'meta.home']);

const SURFACES: Readonly<Record<string, readonly string[]>> = {
  'connexion et inscription': [
    'app/(auth)/layout.tsx',
    'app/(auth)/auth/login',
    'app/(auth)/auth/register',
    'app/(auth)/auth/oauth',
    'components/auth',
    'app/actions/auth.ts',
  ],
  'mot de passe oublié': ['app/(auth)/auth/forgot-password', 'app/(auth)/auth/reset-password'],
  'vérification de l’adresse': ['app/(auth)/auth/verify-email'],
  'sécurité (second facteur exigé)': ['app/onboarding/securite', 'app/actions/security.ts'],
  orientation: ['app/onboarding/intention', 'components/onboarding/EtapePrenom.tsx', 'components/onboarding/QuestionDIntention.tsx', 'components/onboarding/OnboardingShell.tsx'],
  publier: [
    'app/publish',
    'components/property-form/PropertyWizard.tsx',
    'components/property-form/wizard',
    'components/contact/PublicationAvecCoordonnees.tsx',
    'components/contact/CoordonneesPublication.tsx',
    'app/actions/auto-onboard.ts',
    'app/actions/publish-property.ts',
  ],
  invitation: ['app/invitations', 'app/actions/invitations.ts'],
  'assistant bailleur': ['app/onboarding/owner', 'components/onboarding/OwnerOnboardingWizard.tsx', 'app/actions/owner-onboarding.ts'],
  'assistant agent': ['app/onboarding/agent', 'components/onboarding/AgentOnboardingWizard.tsx', 'app/actions/agent-onboarding.ts'],
  'assistant prestataire': [
    'app/onboarding/service-provider',
    'components/onboarding/ServiceProviderOnboardingWizard.tsx',
    'components/onboarding/ServiceProviderMultiAgencyWelcome.tsx',
    'app/actions/service-provider-onboarding.ts',
  ],
  'assistant administrateur d’agence': ['app/onboarding/agency-admin', 'components/onboarding/AgencyAdminOnboardingWizard.tsx'],
  'assistant administrateur de la plateforme': [
    'app/onboarding/super-admin',
    'components/super-admin/SuperAdminOnboardingWizard.tsx',
    'app/actions/super-admin-cooptation.ts',
  ],
  'assistant hôte': ['app/onboarding/host', 'components/onboarding/HostIndividualWizard.tsx', 'app/actions/onboarding.ts'],
};

/** ADR-0095 § 5 : le jargon de l'entrée. `XOF` reste le code envoyé à l'API, jamais l'affichage. */
const MOTS_BANNIS =
  /(?<!\p{L})(?:leads?|wizards?|dashboards?|KYC|TOTP|valider|XOF)(?!\p{L})|vraie agence|(?<!\p{L})êtes invité(?!\p{L})/iu;

/** Les formes du tutoiement qui ne sont jamais autre chose (pronoms et possessifs de la 2ᵉ personne). */
const TUTOIEMENT = /(?<!\p{L})(?:tu|te|toi|ton|ta|tes|tien|tienne|tiens|tiennes)(?!\p{L})|(?<!\p{L})t['’](?=\p{L})|-(?:toi|tu)(?!\p{L})/iu;

function fichiers(chemin: string): string[] {
  const absolu = join(SRC, chemin);
  if (statSync(absolu).isFile()) return [absolu];
  return readdirSync(absolu, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map((f) => join(absolu, f));
}

function espacesDeNoms(chemins: readonly string[]): string[] {
  const espaces = new Set<string>();
  for (const f of chemins.flatMap(fichiers)) {
    const source = readFileSync(f, 'utf8');
    for (const m of source.matchAll(/(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*namespace:\s*)?['"]([^'"]+)['"]/g)) {
      espaces.add(m[1]);
    }
    for (const m of source.matchAll(/i18nNamespace=["']([^"']+)["']/g)) espaces.add(m[1]);
  }
  return [...espaces].filter((e) => !PARTAGES.has(e)).sort();
}

function chaines(espace: string): Array<[string, string]> {
  const racine = espace.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], frMessages);
  const sortie: Array<[string, string]> = [];
  const parcourir = (noeud: unknown, chemin: string) => {
    if (typeof noeud === 'string') sortie.push([chemin, noeud]);
    else if (noeud && typeof noeud === 'object') {
      for (const [k, v] of Object.entries(noeud)) parcourir(v, `${chemin}.${k}`);
    }
  };
  parcourir(racine, espace);
  return sortie;
}

describe.each(Object.entries(SURFACES))('TCK-2616 — les mots de la surface « %s »', (_surface, chemins) => {
  const espaces = espacesDeNoms(chemins);
  const textes = espaces.flatMap(chaines);

  it('lit bien des textes (un relevé vide ne prouverait rien)', () => {
    expect(espaces.length).toBeGreaterThan(0);
    expect(textes.length).toBeGreaterThan(0);
  });

  it('AC1 — aucun mot banni (« lead », « wizard », « dashboard », « KYC », « TOTP », « Valider », « XOF »…)', () => {
    expect(textes.filter(([, v]) => MOTS_BANNIS.test(v))).toEqual([]);
  });

  it('AC2 — aucune forme du tutoiement', () => {
    expect(textes.filter(([, v]) => TUTOIEMENT.test(v))).toEqual([]);
  });
});

describe('TCK-2616 — les gardes de ce fichier mordent', () => {
  it('le motif des mots bannis reconnaît chaque mot de l’ADR, sans accuser un mot voisin', () => {
    for (const mauvais of [
      'Votre premier lead',
      'la fin du wizard',
      'votre dashboard',
      'mon dossier KYC',
      'Code TOTP invalide.',
      'Valider',
      'Tarif horaire (XOF)',
      'créer une vraie agence',
      'Vous êtes invité sur Takussan',
    ]) {
      expect(MOTS_BANNIS.test(mauvais), mauvais).toBe(true);
    }
    for (const bon of ['Votre premier prospect', 'leadership', 'Vérifier le code', 'validée', 'Tarif horaire (F CFA)', 'Une agence vous invite']) {
      expect(MOTS_BANNIS.test(bon), bon).toBe(false);
    }
  });

  it('le motif du tutoiement reconnaît les pronoms et l’élision, sans accuser « boîte » ni « tête »', () => {
    for (const mauvais of ['Vérifie ton numéro', 't’inscrire', 'Connecte-toi', 'on te répond', 'Tes biens']) {
      expect(TUTOIEMENT.test(mauvais), mauvais).toBe(true);
    }
    for (const bon of ['Vérifiez votre boîte mail', 'En tête de liste', 'Une étape', 'Vos biens']) {
      expect(TUTOIEMENT.test(bon), bon).toBe(false);
    }
  });
});
