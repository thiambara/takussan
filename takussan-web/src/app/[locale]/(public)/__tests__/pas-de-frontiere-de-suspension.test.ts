import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Garde structurelle — TCK-335 (AC17), **étendue aux trois fiches par TCK-438**.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * 1. LE MÉCANISME, ET POURQUOI CETTE GARDE NE RESSEMBLE PAS À UN TEST
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `notFound()` ne peut fixer un code HTTP que **tant que le premier octet n'est pas parti**. Un
 * `loading.tsx` ouvre une frontière de suspension sur son segment ET tous ses enfants : Next envoie
 * alors la coque immédiatement, avec le repli — et **le statut 200 avec elle**. Le `notFound()` qui
 * suit rend le bon écran et ne peut plus rien au code de réponse.
 *
 * Aucun harnais e2e n'existe dans ce dépôt (`npm run test` = vitest/jsdom) : **aucun test ne peut
 * lire un code HTTP.** Une garde qui ne peut pas observer l'effet doit au moins verrouiller ce qui
 * le produit.
 *
 * ⚠️ **Et « ce qui le produit » n'est PAS « un fichier nommé `loading.tsx` ».** La première version
 * de cette garde ne connaissait que des noms de fichiers, et c'est le défaut qu'elle a elle-même
 * illustré : `loading.tsx` n'est qu'une des deux façons d'ouvrir une frontière de suspension.
 * L'autre s'écrit à la main, et la garde ne la voyait pas. Mesuré le 2026-08-28, un
 * `<Suspense fallback={…}>{children}</Suspense>` posé dans `(public)/layout.tsx` :
 *
 * ```
 *                                          properties   agencies   agents   garde
 * référence, aucune frontière                  404        404        404    VERTE  ✓
 * + <Suspense> ÉCRIT À LA MAIN dans le layout  200        200        200    VERTE  ✗
 * retour à la référence                        404        404        404    VERTE  ✓
 * ```
 *
 * *Une garde qui ne connaît que la liste des formes valides et écarte le reste ne garde rien — « le
 * reste » EST le défaut.* Les cas de la section « frontière écrite à la main » ci-dessous ferment
 * cette moitié-là, en lisant le SOURCE des dispositions ancêtres au lieu de leurs noms.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * 2. LES MESURES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * TCK-335, le 2026-08-21, sur `next dev` comme sur `next start` :
 *
 * ```
 * sonde `notFound()` sous /properties, SANS loading.tsx dans l'arbre  → 404
 * la même, AVEC properties/[slug]/loading.tsx                          → 200
 * ```
 *
 * TCK-438, le 2026-08-27, `next dev` 16.3.1, serveur redémarré entre les campagnes, API locale
 * vivante et vérifiée à chaque relevé. La colonne « agents » ne porte aucune modification : c'est
 * le TÉMOIN, et il fixe la non-vacuité de la campagne.
 *
 * ```
 *                                              properties/[slug]   agencies/[slug]   agents/[slug]
 * état de référence                                   404               404              404
 * + loading.tsx dans le segment                       200               200              404  ← témoin
 * + loading.tsx ET notFound() dans un layout.tsx        —                404              404
 * ```
 *
 * Deux enseignements, et le second est celui qui gouverne le dessin de la section publique :
 *
 * **(a) `generateMetadata` ne porte AUCUN statut — ni avec, ni sans frontière de suspension.**
 * Le dépôt a longtemps cru le contraire : TCK-335 avait déplacé `notFound()` dans
 * `generateMetadata` « pour tenir le code HTTP », et trois fichiers l'affirmaient encore. La
 * mesure d'origine portait sur une sonde qui appelait `notFound()` AUX DEUX endroits, et n'avait
 * donc jamais séparé leurs effets. Désagrégé le 2026-08-28, aucune frontière sur le chemin :
 *
 * ```
 * notFound() dans le SEUL generateMetadata  →  200   ← le bon écran, servi en 200 : un soft-404
 * notFound() dans le SEUL corps de page     →  404
 * les deux                                  →  404
 * ```
 *
 * **Le 404 vient du corps, et de lui seul.** *Une mesure prise sur deux causes présentes à la fois
 * ne dit rien de chacune* — et le remède qu'on en tire protège alors ce qu'il ne touche pas. Le
 * `notFound()` de `generateMetadata` reste dans les fiches, mais pour une autre raison, écrite
 * là-bas : il retire `introuvable` de l'union de types, sans quoi `tsc` casse.
 *
 * Conséquence pour cette garde : **elle n'est pas un filet de sécurité qui doublerait un autre
 * mécanisme, elle EST le mécanisme.** Le seul `notFound()` qui porte le statut est celui du corps
 * de page, et il ne survit qu'en l'absence de toute frontière au-dessus de lui.
 *
 * **(b) Remonter la décision dans un `layout.tsx` rend bien le 404 — et ne rend pas le repli
 * utile pour autant.** Un repli couvre exactement ce qui est *en dessous* de lui. Mesuré en
 * déplaçant une attente artificielle de 2 s d'un côté et de l'autre de la frontière, même page,
 * même serveur :
 *
 * ```
 * attente placée DANS LA PAGE (sous le repli)     TTFB 0,81 s   total 2,29 s   ← le repli part tôt
 * attente placée DANS LE LAYOUT (au-dessus)       TTFB 2,25 s   total 2,25 s   ← rien ne part avant
 * ```
 *
 * Or sur ces trois fiches, **l'attente EST la décision** : le seul aller-retour de la page est
 * celui qui dit si le slug existe. Le mettre au-dessus du repli pour sauver le statut le met, du
 * même geste, hors de portée du repli. Un `loading.tsx` n'y produirait pas un état d'attente mais
 * un éclair de squelette juste avant le contenu — au prix d'un `layout.tsx` de plus, d'une
 * frontière de dictionnaire de plus (ADR-0022), et du déplacement de la frontière `not-found` vers
 * le segment parent (mesuré : un `notFound()` levé dans `agencies/[slug]/layout.tsx` est attrapé
 * par `agencies/not-found.tsx`, jamais par `agencies/[slug]/not-found.tsx`).
 *
 * *C'est pourquoi TCK-438 n'a PAS livré les `loading.tsx` de ses trois fiches, alors que son delta
 * les demandait : le ticket a été écrit avant que ce mécanisme ne soit mesuré.* `/bookings` en a
 * un, lui, et c'est cohérent plutôt qu'inconsistant : cette page n'appelle jamais `notFound()`,
 * n'a donc aucun statut à défendre, et son repli peut envelopper l'aller-retour lui-même.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * 3. CE FICHIER REMPLACE `properties/[slug]/__tests__/pas-de-frontiere-de-suspension.test.ts`
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'ancienne garde a été SUPPRIMÉE, et un test supprimé sans successeur prouvé est une régression
 * déguisée. La succession a donc été mesurée plutôt qu'affirmée : l'ancien fichier a été restauré
 * le temps de la campagne, et les deux gardes ont été jouées côte à côte sur chacune de ses trois
 * conditions — celles-là mêmes qui justifiaient son existence.
 *
 * ```
 *                                                                  ancien   nouveau
 * état de référence, rien de perturbé                               VERT     VERT
 * un loading.tsx apparaît dans properties/[slug]                    ROUGE    ROUGE
 * un loading.tsx apparaît dans le parent properties/                ROUGE    ROUGE
 * (liste)/loading.tsx disparaît   (sa non-vacuité)                  ROUGE    ROUGE
 * retour à l'état de référence                                      VERT     VERT
 * ```
 *
 * Le successeur rougit partout où l'ancien rougissait, et verdit où il verdissait. Il couvre en
 * plus ce que l'ancien ne voyait pas — les fiches d'agence et d'agent, leurs parents, les trois
 * ancêtres communs, et le `layout.tsx` qui rendrait un `not-found.tsx` voisin inatteignable —,
 * chacun de ces cas éprouvé par la même méthode.
 *
 * Le déplacement n'est pas cosmétique : une garde qui porte sur trois segments ne peut pas vivre à
 * l'intérieur de l'un d'eux sans mentir sur sa portée.
 *
 * ⚠ Si un jour ces fiches doivent montrer une attente, le remède n'est pas un `loading.tsx` : c'est
 * de séparer l'appel qui décide de l'existence de celui qui porte le portefeuille, et de suspendre
 * le second dans la page. Cela change un contrat d'API et demande son propre ticket.
 */

const ICI = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ICI, '..');
const APP = join(PUBLIC, '..', '..');

/** Les segments où un `loading.tsx` ferait rendre 200 à un vrai 404 — eux et tous leurs ancêtres. */
const INTERDITS = [
  'properties/[slug]',
  'properties',
  'agencies/[slug]',
  'agencies',
  'agents/[slug]',
  'agents',
];

/**
 * Le source d'un fichier, **commentaires retirés**.
 *
 * ⚠ Sans ce retrait, la garde se mordrait la queue : les docblocks de ce dépôt — celui-ci compris —
 * citent `<Suspense>` pour expliquer pourquoi il est interdit. Une garde qui compte les occurrences
 * dans le texte, commentaires compris, rougirait sur sa propre explication.
 */
function sourceSansCommentaires(fichier: string): string {
  return readFileSync(fichier, 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // commentaires JSX
    .replace(/\/\*[\s\S]*?\*\//g, '') // blocs
    .replace(/^[^\n]*?\/\/[^\n]*$/gm, ''); // lignes
}

/**
 * Les `layout.tsx` qui GOUVERNENT un segment : le sien et ceux de tous ses ancêtres jusqu'à
 * `src/app`.
 *
 * ⚠ Cette liste est DÉRIVÉE de l'arborescence, jamais écrite à la main. Une liste écrite à la main
 * aurait été juste le jour de sa rédaction : `src/app/(public)` est devenu `src/app/[locale]/(public)`
 * en TCK-434, et trois renvois de ce dépôt pointaient encore vers l'ancien chemin des semaines
 * après. Une garde qui énumère ses cibles cesse de garder dès que l'arbre bouge, sans rien dire.
 */
function layoutsGouvernant(segment: string): string[] {
  const trouves: string[] = [];
  let courant = join(PUBLIC, segment);
  for (;;) {
    const layout = join(courant, 'layout.tsx');
    if (existsSync(layout)) trouves.push(layout);
    if (courant === APP) break;
    const parent = dirname(courant);
    if (parent === courant) break;
    courant = parent;
  }
  return trouves;
}

/**
 * `{children}` est-il rendu À L'INTÉRIEUR d'un `<Suspense>` dans ce source ?
 *
 * Compte les ouvertures et les fermetures qui précèdent chaque `{children}` : s'il reste une
 * ouverture non fermée, l'enfant est sous la frontière. Cette forme distingue le cas qui déplace le
 * statut — `<Suspense>{children}</Suspense>` — de celui qui ne le déplace pas — un `<Suspense>`
 * posé autour d'un VOISIN de `{children}`, qui ne couvre pas la page et n'a donc rien d'interdit.
 * *Refuser les deux aurait été plus simple à écrire et aurait appris à contourner la garde.*
 *
 * ⚠️ **Le détecteur ne cherche PAS la fin des balises, et c'est délibéré.** Une première version
 * lisait `<Suspense[^>]*?(\/?)>` pour repérer l'auto-fermeture ; elle prenait `>` à l'intérieur du
 * `fallback` — `<Suspense fallback={<i/>}>` se lisait comme auto-fermant — et rendait donc **faux
 * sur la forme exacte du défaut**. Le cas de test qui l'a attrapée est plus bas. On ne repère donc
 * que `<Suspense` et `</Suspense`, qui ne demandent aucune analyse de JSX.
 *
 * ⚠️ Conséquence assumée : un `<Suspense … />` réellement auto-fermant compte comme une ouverture
 * et fait ROUGIR. C'est un faux positif sur un composant qui n'enveloppe rien, donc qui n'a aucune
 * raison d'exister. *Le biais d'une garde va vers le rouge : un faux rouge se lit et se corrige en
 * une minute, un faux vert ne se lit jamais.*
 */
function enfantsSousSuspense(source: string): boolean {
  const jetons = source.matchAll(/<\/?(?:React\.)?Suspense\b|\{\s*children\s*\}/g);
  let ouvertes = 0;
  for (const [texte] of jetons) {
    if (texte.includes('children')) {
      if (ouvertes > 0) return true;
    } else if (texte.startsWith('</')) {
      ouvertes = Math.max(0, ouvertes - 1);
    } else {
      ouvertes += 1;
    }
  }
  return false;
}

const fichiersDe = (repertoire: string): string[] =>
  existsSync(repertoire)
    ? readdirSync(repertoire, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
    : [];

describe('TCK-335 / TCK-438 — aucune fiche à slug ne vit sous une frontière de suspension', () => {
  for (const segment of INTERDITS) {
    it(`${segment} n'a pas de loading.tsx`, () => {
      expect(
        fichiersDe(join(PUBLIC, segment)),
        `un loading.tsx ici fait rendre 200 à un vrai 404 — voir le docblock (§2, tableau)`,
      ).not.toContain('loading.tsx');
    });
  }

  it("aucun ancêtre commun n'en porte non plus", () => {
    // Un `loading.tsx` posé au groupe `(public)`, au segment `[locale]` ou à la racine couvrirait
    // les trois fiches d'un coup — le même défaut, une frontière plus haut, et invisible depuis
    // les six cas ci-dessus.
    for (const ancetre of [PUBLIC, join(APP, '[locale]'), APP]) {
      expect(fichiersDe(ancetre)).not.toContain('loading.tsx');
    }
  });

  describe('la frontière ÉCRITE À LA MAIN — ce que les noms de fichiers ne montrent pas', () => {
    const FICHES = ['properties/[slug]', 'agencies/[slug]', 'agents/[slug]'];

    for (const segment of FICHES) {
      it(`aucune disposition gouvernant ${segment} ne met {children} sous <Suspense>`, () => {
        const layouts = layoutsGouvernant(segment);

        // Non-vacuité : si la dérivation ne trouvait plus rien — arborescence déplacée, groupe
        // renommé —, la boucle ci-dessous serait vide et le cas passerait au vert en n'ayant
        // RIEN regardé. C'est le mode de défaillance d'une garde dérivée, et il est muet.
        expect(layouts.length, `aucun layout trouvé au-dessus de ${segment}`).toBeGreaterThan(0);

        for (const layout of layouts) {
          expect(
            enfantsSousSuspense(sourceSansCommentaires(layout)),
            `${relative(APP, layout)} met {children} sous <Suspense> : les trois fiches ` +
              `rendront 200 au lieu de 404, et aucun nom de fichier ne le montre`,
          ).toBe(false);
        }
      });
    }

    it('la dérivation atteint bien la racine, et pas seulement le groupe public', () => {
      // Seconde non-vacuité, sur la PORTÉE : une frontière posée dans `app/layout.tsx` couvrirait
      // les trois fiches depuis un endroit que personne ne regarde en travaillant sur le site
      // public. Le cas vérifie que ce fichier-là fait partie de ce qui est inspecté.
      const layouts = layoutsGouvernant('agencies/[slug]');

      expect(layouts).toContain(join(APP, 'layout.tsx'));
      expect(layouts).toContain(join(PUBLIC, 'layout.tsx'));
    });

    it('le détecteur voit une frontière manuelle, et ignore un <Suspense> qui ne couvre pas la page', () => {
      // ⚠ Une garde dont on n'éprouve pas le DÉTECTEUR est une garde dont on espère qu'elle
      // détecte. Les quatre formes ci-dessous fixent sa frontière de compétence sans qu'il faille
      // toucher à un vrai layout pour la connaître.
      // ⚠ La PREMIÈRE de ces quatre lignes a fait rougir le détecteur et l'a fait réécrire : un
      // `fallback` qui contient du JSX (`{<i/>}`) trompait la recherche de fin de balise, et la
      // forme EXACTE du défaut passait pour autorisée. Elle reste en tête à ce titre.
      expect(enfantsSousSuspense('<Suspense fallback={<i/>}>{children}</Suspense>')).toBe(true);
      expect(enfantsSousSuspense('<React.Suspense>{ children }</React.Suspense>')).toBe(true);
      // un voisin sous Suspense ne couvre pas la page : autorisé
      expect(enfantsSousSuspense('<Suspense><Barre /></Suspense>{children}')).toBe(false);
      // auto-fermant : compté comme ouverture, donc refusé — faux positif assumé, cf. docblock
      expect(enfantsSousSuspense('<Suspense fallback={<i/>} />{children}')).toBe(true);
    });

    it('les commentaires ne comptent pas — la garde ne se mord pas la queue', () => {
      // Ce dépôt explique dans ses docblocks pourquoi `<Suspense>` est interdit ici. Sans retrait
      // des commentaires, la garde rougirait sur sa propre explication, et le remède évident —
      // effacer l'explication — coûterait le savoir sans corriger le défaut.
      const avecCommentaire = '/* <Suspense>{children}</Suspense> */\n<main>{children}</main>';

      // Lu brut, le commentaire ouvre une frontière imaginaire…
      expect(enfantsSousSuspense(avecCommentaire)).toBe(true);
      // …et le retrait des commentaires la fait disparaître, sans toucher au vrai JSX.
      expect(enfantsSousSuspense(avecCommentaire.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false);
    });
  });

  it('la liste garde le sien, confiné à son groupe de routes', () => {
    // Non-vacuité : si `(liste)/loading.tsx` disparaissait, toutes les assertions ci-dessus
    // passeraient au vert en ayant simplement supprimé la fonctionnalité.
    const liste = join(PUBLIC, 'properties', '(liste)');
    expect(existsSync(join(liste, 'loading.tsx'))).toBe(true);
    expect(existsSync(join(liste, 'page.tsx'))).toBe(true);
  });

  it("/bookings garde le sien — la seule route serveur publique qui puisse en porter un", () => {
    // Seconde non-vacuité, dans l'autre sens : sans elle, supprimer le repli de `/bookings`
    // n'aurait aucune conséquence rouge, et la garde ne dirait plus que « il n'y a de repli nulle
    // part », ce qui est l'état qu'elle est censée distinguer.
    expect(existsSync(join(PUBLIC, 'bookings', 'loading.tsx'))).toBe(true);
    expect(existsSync(join(PUBLIC, 'bookings', 'page.tsx'))).toBe(true);
  });

  it("les fiches d'agence et d'agent gardent la décision DANS la page, donc leur not-found local", () => {
    // Mesuré le 2026-08-27 : un `notFound()` levé depuis `<segment>/layout.tsx` est attrapé par la
    // frontière du segment PARENT. Un `layout.tsx` apparu ici rendrait donc silencieusement mort le
    // `not-found.tsx` voisin — un écran que plus rien ne rend, qu'aucun type ne signale.
    for (const segment of ['agencies/[slug]', 'agents/[slug]', 'properties/[slug]']) {
      expect(existsSync(join(PUBLIC, segment, 'not-found.tsx')), `${segment}/not-found.tsx`).toBe(
        true,
      );
      expect(fichiersDe(join(PUBLIC, segment)), `${segment}/layout.tsx`).not.toContain('layout.tsx');
    }
  });
});
