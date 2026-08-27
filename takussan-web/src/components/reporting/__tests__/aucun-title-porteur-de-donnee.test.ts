import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC2 de TCK-361 — **plus aucune infobulle native ne porte de donnée dans `components/reporting/`.**
 *
 * Pourquoi une garde de FICHIER et non une assertion de rendu : l'infobulle native est le repli par
 * défaut de quiconque veut « afficher la valeur au survol ». Elle est séduisante (une ligne) et
 * cassée sur trois axes à la fois — ni stylable, ni atteignable au clavier, ni affichée sur mobile.
 * Un test de rendu ne l'attraperait que sur le composant qu'il monte ; celle-ci couvre le répertoire
 * entier, y compris les composants qui n'existent pas encore.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PREMIÈRE VERSION LAISSAIT PASSER — deux formes sur deux essayées
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle cherchait le motif `/(^|\s)title=[{"']/`, ligne par ligne. Une revue adverse l'a défaite
 * deux fois de suite, et les deux trous disent la même chose :
 *
 *   1. **Elle était aveugle à l'élément SVG `<title>`** — c'est-à-dire à la SEULE forme qui produise
 *      réellement une infobulle native à l'intérieur d'un `<svg>` : un attribut `title=` posé sur un
 *      `<rect>` SVG n'affiche rien du tout. La garde interdisait donc la forme qui ne marche pas et
 *      autorisait celle qui marche.
 *   2. **Elle exigeait `title=` collés**, alors que JSX accepte les espaces — et les retours à la
 *      ligne — autour du `=`. `title = {taux}` rend exactement le même attribut HTML.
 *
 * **La leçon tient en une phrase, et c'est elle qui gouverne la forme ci-dessous : une garde doit
 * voir la PROPRIÉTÉ, pas une écriture de cette propriété.** D'où deux contrôles qui portent chacun
 * sur un mécanisme du DOM — l'attribut `title` et l'élément `<title>` —, une analyse sur le contenu
 * ENTIER du fichier plutôt que ligne à ligne (un `=` peut être à la ligne suivante), et une
 * tolérance explicite aux espaces partout où la syntaxe en tolère.
 *
 * ⚠ La garde vise la propriété `title`, pas le mot « title » : `params={{ title }}`, une clé
 * d'objet `title:` et un composant `<Title>` (majuscule) restent légitimes.
 *
 * ⚠ Les commentaires ne sont PAS retirés avant analyse, délibérément — même raison que
 * `scripts/check-super-admin-tokens.mjs` : un docblock qui montre la forme interdite en syntaxe
 * copiable est exactement la documentation périmée qui fait repousser le motif. Le récit s'écrit en
 * toutes lettres (« un attribut `title` »), pas en JSX.
 */

const RACINE = join(__dirname, '..');

/**
 * A · l'ATTRIBUT `title` d'un élément de rendu.
 *
 * Le préfixe `(^|[\s{(,])` évite `subtitle={…}` et `data-title={…}` ; `\s*=\s*` absorbe les espaces
 * ET les retours à la ligne que JSX autorise autour du `=` ; `[{"'`]` exige une VALEUR — un
 * `title === x` ou un `title == null` d'une comparaison ne sont pas des attributs.
 */
const ATTRIBUT_TITLE = /(^|[\s{(,])title\s*=\s*[{"'`]/g;

/**
 * B · l'ÉLÉMENT SVG `<title>`, la forme qui produit vraiment l'infobulle dans un `<svg>`.
 *
 * Minuscule imposée : `<Title>` est un composant React, pas un élément du DOM.
 */
const ELEMENT_TITLE = /<\s*title[\s>/]/g;

const CONTROLES = [
  ['A', "attribut `title` sur un élément de rendu", ATTRIBUT_TITLE],
  ['B', 'élément SVG `<title>` (infobulle native non stylable)', ELEMENT_TITLE],
] as const;

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === '__tests__' ? [] : fichiersTsx(chemin);
    return entree.name.endsWith('.tsx') ? [chemin] : [];
  });
}

/** Numéro de ligne d'un décalage — l'analyse porte sur le fichier entier, le rapport sur la ligne. */
function ligneDe(contenu: string, decalage: number): number {
  return contenu.slice(0, decalage).split('\n').length;
}

function infractions(chemin: string): string[] {
  const contenu = readFileSync(chemin, 'utf8');

  return CONTROLES.flatMap(([id, libelle, motif]) => {
    motif.lastIndex = 0;

    return [...contenu.matchAll(motif)].map(
      (m) => `${id} · ${libelle} — ${chemin}:${ligneDe(contenu, m.index ?? 0)} — ${m[0].trim()}`,
    );
  });
}

describe('components/reporting — AC2 (TCK-361)', () => {
  it('ne porte aucune infobulle native, ni par attribut ni par élément SVG', () => {
    const fichiers = fichiersTsx(RACINE);

    // Une garde qui parcourt une liste vide passe au vert sans rien vérifier : la forme de vacuité
    // la plus difficile à voir, parce que la sortie ressemble à un succès.
    expect(fichiers.length).toBeGreaterThan(0);
    expect(fichiers.flatMap(infractions)).toEqual([]);
  });

  /**
   * La garde doit pouvoir ÉCHOUER, et sur les formes qui l'ont défaite.
   *
   * Les quatre premières sont celles de la revue adverse et de mes propres mutations : élément SVG,
   * espaces autour du `=`, retour à la ligne avant le `=`, guillemets doubles. Un motif faux
   * resterait vert à jamais sans elles.
   */
  it.each([
    ['élément SVG', '<title>{`${p.bucket} : ${format(p.value)}`}</title>'],
    ['élément SVG multiligne', '<title\n  >{taux}</title>'],
    ['espaces autour du =', 'title = {`${(rate * 100).toFixed(1)} %`}'],
    ['retour à la ligne avant le =', 'title\n  ={taux}'],
    ['double espace', 'title  =  "42 %"'],
    ['forme collée d’origine', 'title={`${row.bucket}: ${row.count}`}'],
    ['guillemets simples', "<div title='42 %' />"],
  ])('reconnaît « %s » (la garde sait échouer)', (_libelle, extrait) => {
    const vu = CONTROLES.some(([, , motif]) => {
      motif.lastIndex = 0;

      return motif.test(extrait);
    });

    expect(vu).toBe(true);
  });

  /** …et ne doit PAS mordre sur ce qui n'est pas une infobulle, sous peine d'être désarmée. */
  it.each([
    ['propriété d’objet abrégée', 'params={{ title }}'],
    ['clé d’objet', "toast.add({ title: t('errorTitle') })"],
    ['prop dont le nom COMMENCE par title', 'titleClassName={cn("x")}'],
    ['prop dont le nom FINIT par title', 'subtitle={t("x")}'],
    ['composant React', '<Title>{t("x")}</Title>'],
    ['prose', "// L'attribut `title` a disparu"],
  ])('ne mord pas sur « %s »', (_libelle, extrait) => {
    const vu = CONTROLES.some(([, , motif]) => {
      motif.lastIndex = 0;

      return motif.test(extrait);
    });

    expect(vu).toBe(false);
  });
});
