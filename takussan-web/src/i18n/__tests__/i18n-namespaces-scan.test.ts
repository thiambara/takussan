/**
 * Preuve que le dériveur de `scripts/check-i18n-namespaces.mjs` trouve ce qu'il prétend trouver —
 * et qu'il ne trouve PAS ce qu'il prétend ignorer.
 *
 * Même motif que `i18n-scan.test.ts`, et pour la même raison : **une garde devenue aveugle et une
 * garde qui n'a plus rien à trouver rendent exactement la même sortie verte.** Ici la sanction
 * d'un aveuglement n'est pas un document faux, c'est un chemin de clé peint à l'écran d'un
 * utilisateur — le dériveur décide quels espaces de noms chaque page reçoit réellement.
 *
 * Chaque cas est une MUTATION : on soumet une source qui contient exactement une chose, et on
 * vérifie ce qui en ressort.
 */
import { describe, expect, it } from 'vitest';
import {
  espacesAtteignables,
  importsDe,
  premierNiveau,
  recolteRacine,
  releveFichier,
  resoudreDynamique,
  retireCommentairesPleineLigne,
} from '../../../scripts/i18n-namespaces-scan.mjs';

const CONNUS = new Set(['property', 'errors', 'nav', 'dashboard', 'crm', 'superAdmin', 'agents']);
const CONNUS_LECTEURS = new Set([...CONNUS, 'meta']);

describe('règle A — le namespace littéral', () => {
  it('relève `useTranslations(\'a.b\')` au premier niveau', () => {
    expect(releveFichier("const t = useTranslations('property.types');").litteraux).toEqual(['property']);
  });

  it('range la forme serveur `getTranslations` à part — elle ne lit jamais le provider client', () => {
    // P105.04 (amendement d'ADR-0022 du 2026-10-25) : `getTranslations` résout contre le
    // dictionnaire ENTIER de la requête (`src/i18n/request.ts`), jamais contre le sous-ensemble
    // sérialisé pour le navigateur. Le compter côté client embarquait `meta` et `serverActions`
    // dans chaque document.
    const r = releveFichier("await getTranslations('crm.pipeline.stage');");
    expect(r.litteraux).toEqual([]);
    expect(r.litterauxServeur).toEqual(['crm']);
  });

  it('un fichier qui lit le même espace des deux façons le garde côté client', () => {
    const r = releveFichier("await getTranslations('crm.a'); const t = useTranslations('crm.b');");
    expect(r.litteraux).toEqual(['crm']);
  });

  it('relève la forme objet `getTranslations({ namespace })`', () => {
    const r = releveFichier("await getTranslations({ locale, namespace: 'superAdmin.users' });");
    expect(r.litteraux).toContain('superAdmin');
  });

  it('ne confond pas un espace avec le chemin complet', () => {
    expect(premierNiveau('property.status.draft')).toBe('property');
  });
});

describe('règle B — le namespace calculé', () => {
  const TABLE = `export const PROPERTY_ENUM_NAMESPACES = {
    type: 'property.types',
    status: 'property.status',
  } as const;`;

  it('signale l’expression au lieu de l’ignorer', () => {
    const r = releveFichier('const t = useTranslations(PROPERTY_ENUM_NAMESPACES.status);');
    expect(r.litteraux).toEqual([]);
    expect(r.dynamiques).toEqual(['PROPERTY_ENUM_NAMESPACES.status']);
  });

  it('replie `TABLE.clé` sur la valeur de la clé', () => {
    expect(resoudreDynamique('PROPERTY_ENUM_NAMESPACES.status', [TABLE])).toEqual(['property.status']);
  });

  it('replie une clé absente sur TOUTES les valeurs de la table (sur-approximation assumée)', () => {
    expect(resoudreDynamique('PROPERTY_ENUM_NAMESPACES.inconnue', [TABLE]).sort())
      .toEqual(['property.status', 'property.types']);
  });

  it('replie un identifiant nu sur les littéraux qui lui sont liés — le cas d’une PROP', () => {
    const sources = [
      "function KycUploader({ i18nNamespace = 'serviceProviders.onboarding.kyc' }) {}",
      '<KycUploader i18nNamespace="agents.onboarding.kyc" />',
    ];
    expect(resoudreDynamique('i18nNamespace', sources).sort())
      .toEqual(['agents.onboarding.kyc', 'serviceProviders.onboarding.kyc']);
  });

  it('rend un ensemble VIDE quand rien ne se replie — c’est ce qui fait échouer la garde', () => {
    expect(resoudreDynamique('espaceInconnu', ['const x = 1;'])).toEqual([]);
  });

  it('ne demande pas de résoudre un site SERVEUR — il ne nourrit pas le provider', () => {
    const r = releveFichier('const t = await getTranslations(namespace);');
    expect(r.dynamiques).toEqual([]);
    expect(r.dynamiquesServeur).toEqual(['namespace']);
  });
});

describe('lecteurs serveur et client — ce qui entre dans le dictionnaire du navigateur', () => {
  const RACINE = '/src';
  // Un seul fichier : `resoudreModule` lit le vrai disque, et le graphe n'est pas ce qu'on éprouve.
  const fichiers: Record<string, string> = {
    '/src/app/page.tsx': [
      'export async function generateMetadata() {',
      "  const t = await getTranslations('meta.home');",
      '}',
      "const tRacine = await getTranslations(); tRacine('dashboard.x');",
      "function Carte() { const t = useTranslations('nav'); }",
    ].join('\n'),
  };
  const lire = (f: string) => {
    if (!(f in fichiers)) throw new Error(f);
    return fichiers[f]!;
  };

  it('ne sert au navigateur que les espaces d’un lecteur client', () => {
    const { espaces } = espacesAtteignables(['/src/app/page.tsx'], RACINE, CONNUS_LECTEURS, lire);
    expect([...espaces].sort()).toEqual(['nav']);
  });

  it('nomme à part les espaces que seul le serveur lit — pour le rapport', () => {
    const { serveurSeul } = espacesAtteignables(['/src/app/page.tsx'], RACINE, CONNUS_LECTEURS, lire);
    expect([...serveurSeul].sort()).toEqual(['dashboard', 'meta']);
  });
});

describe('règle C — le traducteur RACINE', () => {
  it('repère un `useTranslations()` sans argument', () => {
    expect(releveFichier('const t = useTranslations();').racine).toBe(true);
    expect(releveFichier("const t = useTranslations('nav');").racine).toBe(false);
  });

  it('un `getTranslations()` sans argument est un traducteur racine SERVEUR', () => {
    // `actions/property.ts` : `tRacine('publicLeadErrors.contactUnavailable')`, lu par une action
    // serveur, faisait servir `publicLeadErrors` au navigateur de toutes les pages (P105.04).
    const r = releveFichier("const tRacine = await getTranslations();");
    expect(r.racine).toBe(false);
    expect(r.racineServeur).toBe(true);
  });

  it('récolte les chemins absolus, y compris ceux qui ne sont pas des arguments d’appel', () => {
    // `DashboardShortcuts` porte ses clés dans une TABLE, jamais au point d'appel : le relevé des
    // sites `t('…')` seul ne verrait pas `nav`.
    const source = "const l = [{ labelKey: 'nav.sidebar.myFavorites' }]; t('dashboard.shortcuts.heading');";
    expect(recolteRacine(source, CONNUS).sort()).toEqual(['dashboard', 'nav']);
  });

  it('ne peut inventer aucun espace : le dictionnaire borne la récolte', () => {
    // `leases` n'existe pas au dictionnaire (c'est `lease`). Une récolte non bornée l'aurait pris.
    expect(recolteRacine("t('leases.deposit');", CONNUS)).toEqual([]);
  });

  it('ignore un littéral sans point — un jeton technique n’est pas un chemin de clé', () => {
    expect(recolteRacine("const mode = 'property';", CONNUS)).toEqual([]);
  });
});

describe('les commentaires pleine ligne — le faux positif qui coûtait 27 ko à chaque page', () => {
  it('jette un bloc JSDoc et son exemple de code', () => {
    const source = [
      '/**',
      " * const t = useTranslations('property.types');",
      ' */',
      "const t = useTranslations('nav');",
    ].join('\n');
    expect(releveFichier(retireCommentairesPleineLigne(source)).litteraux).toEqual(['nav']);
  });

  it('jette un commentaire de ligne', () => {
    const source = "// useTranslations('crm.pipeline')\nconst t = useTranslations('nav');";
    expect(releveFichier(retireCommentairesPleineLigne(source)).litteraux).toEqual(['nav']);
  });

  it('ne touche JAMAIS au milieu d’une ligne — une URL n’est pas un commentaire', () => {
    // C'est le faux NÉGATIF qu'un stripper suivant les chaînes produit : le `//` de `https://`
    // avale la fin de la ligne, et l'espace de noms disparaît du sous-ensemble servi.
    const source = "const src = 'https://images.unsplash.com/x'; const t = useTranslations('nav');";
    expect(retireCommentairesPleineLigne(source)).toBe(source);
    expect(releveFichier(retireCommentairesPleineLigne(source)).litteraux).toEqual(['nav']);
  });

  it('ne prend pas une apostrophe de texte français pour un littéral', () => {
    const source = "const A = () => <p>l'utilisateur</p>;\nconst t = useTranslations('nav');";
    expect(releveFichier(retireCommentairesPleineLigne(source)).litteraux).toEqual(['nav']);
  });
});

describe('le graphe d’imports', () => {
  it('suit l’alias `@/`, le relatif, le dynamique et `require`', () => {
    const source = [
      "import { A } from '@/components/a';",
      "import B from './b';",
      "export { C } from '../c';",
      "const D = await import('@/lib/d');",
      "const E = require('./e');",
      "import type { F } from 'react';",
    ].join('\n');
    expect(importsDe(source).sort()).toEqual([
      '../c', './b', './e', '@/components/a', '@/lib/d', 'react',
    ]);
  });
});
