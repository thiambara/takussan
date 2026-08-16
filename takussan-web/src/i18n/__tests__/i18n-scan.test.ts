/**
 * Preuve que le scanner de `scripts/check-i18n.mjs` compte ce qu'il prétend compter — et RIEN
 * d'autre.
 *
 * Sans ce test, la garde peut devenir aveugle en silence : une garde qui ne trouve plus rien et
 * une garde qui n'a plus rien à trouver rendent exactement la même sortie verte. C'est le faux
 * négatif que la dette D-23 décrit (« une garde qui cherche un JETON ne mesure pas la PROPRIÉTÉ »).
 *
 * Chaque cas ci-dessous est une MUTATION : on soumet au scanner un fichier qui contient
 * exactement une chose, et on vérifie le compte.
 */
import { describe, expect, it } from 'vitest';
import { compteFichier, ressembleATailwind } from '../../../scripts/i18n-scan.mjs';

type Occurrence = { ligne: number; categorie: string; extrait: string };

const scan = (source: string): Occurrence[] => compteFichier('fixture.tsx', source);
const categories = (source: string) => scan(source).map((o) => o.categorie).sort();

describe('scanner i18n — ce qu’il DOIT compter', () => {
  it('compte le texte JSX nu', () => {
    expect(categories('export const A = () => <h1>Tableau de bord</h1>;')).toEqual(['jsx']);
  });

  it('compte un attribut d’affichage littéral', () => {
    expect(categories('export const A = () => <input placeholder="Rechercher un bien" />;'))
      .toEqual(['attribut']);
  });

  it('compte un attribut ARIA textuel', () => {
    expect(categories('export const A = () => <button aria-label="Fermer" />;')).toEqual(['aria']);
  });

  it('compte un littéral accentué hors JSX', () => {
    expect(categories("export const LABEL = 'Réservation confirmée';")).toEqual(['litteral']);
  });

  it('compte un littéral de deux mots sans accent hors JSX', () => {
    expect(categories("export const LABEL = 'Pending review';")).toEqual(['litteral']);
  });

  it('compte les valeurs d’une table de libellés', () => {
    const source = "export const STATUS = { draft: 'Réservé', active: 'En cours' } as const;";
    // `draft`/`active` sont des NOMS de propriété et ne comptent pas ; les deux VALEURS comptent,
    // l'une par son accent, l'autre par sa phrase de deux mots.
    expect(categories(source)).toEqual(['litteral', 'litteral']);
  });
});

describe('scanner i18n — les limites, épinglées', () => {
  /**
   * Ces trois cas ÉCHAPPENT au compte. Ils sont ici pour que la limite soit une décision datée et
   * non une surprise : le total de la garde est un PLANCHER. Si l'un d'eux se met à compter un
   * jour, ce test rougira et il faudra remesurer la baseline — c'est le comportement voulu.
   */
  it('ne compte PAS un mot français isolé sans accent hors JSX', () => {
    // `Brouillon`, `Actif`, `Fermer` : un seul mot, aucun accent — indistinguable d'un jeton
    // technique (`draft`, `active`) sans dictionnaire de langue.
    expect(scan("export const LABEL = 'Brouillon';")).toHaveLength(0);
  });

  it('ne compte PAS un gabarit interpolé', () => {
    expect(scan('export const m = (n: string) => `Bonjour ${n}, bienvenue`;')).toHaveLength(0);
  });

  it('ne compte PAS une prop de composant maison hors ATTRS_AFFICHAGE', () => {
    expect(scan('export const A = () => <Carte texteVide="Aucun résultat" />;')).toHaveLength(0);
  });
});

describe('scanner i18n — ce qu’il NE DOIT PAS compter', () => {
  it('ignore un libellé passé par next-intl', () => {
    expect(scan("export const A = () => <h1>{t('dashboard.title')}</h1>;")).toHaveLength(0);
  });

  it('ignore le namespace passé à useTranslations', () => {
    expect(scan("const t = useTranslations('nav.sidebar');")).toHaveLength(0);
  });

  it('ignore les classes Tailwind en attribut className', () => {
    expect(scan('export const A = () => <div className="flex items-center gap-2" />;'))
      .toHaveLength(0);
  });

  it('ignore les classes Tailwind hors className (le cas cva, seul FP systématique mesuré)', () => {
    const source = 'export const v = cva("group/badge inline-flex rounded-4xl [&>svg]:size-3");';
    expect(scan(source)).toHaveLength(0);
  });

  it('ignore les directives de prologue', () => {
    expect(scan("'use client';\nexport const A = 1;")).toHaveLength(0);
    expect(scan("'use server';\nexport const A = 1;")).toHaveLength(0);
  });

  it('ignore les chemins de module', () => {
    expect(scan("import { cn } from '@/lib/utils';")).toHaveLength(0);
  });

  it('ignore les types littéraux', () => {
    expect(scan("export type Statut = 'en attente' | 'validé';")).toHaveLength(0);
  });

  it('ignore les attributs techniques', () => {
    const source = 'export const A = () => <a href="/mes-biens" data-testid="lien-mes-biens" '
      + 'id="lien-biens" role="link" />;';
    expect(scan(source)).toHaveLength(0);
  });

  it('ignore une clé d’objet, même accentuée', () => {
    expect(scan("export const M = { 'clé-étrange': 1 };")).toHaveLength(0);
  });
});

describe('ressembleATailwind', () => {
  it('reconnaît une chaîne de classes', () => {
    expect(ressembleATailwind('flex items-center gap-2 rounded-md')).toBe(true);
    expect(ressembleATailwind('hover:bg-muted dark:text-foreground')).toBe(true);
  });

  it('ne prend pas de la prose pour des classes, même sans accent', () => {
    expect(ressembleATailwind('Pending review')).toBe(false);
    expect(ressembleATailwind('Add a property')).toBe(false);
  });

  it('ne classe jamais en Tailwind une chaîne accentuée', () => {
    expect(ressembleATailwind('text-center rounded-md à gauche')).toBe(false);
  });
});
