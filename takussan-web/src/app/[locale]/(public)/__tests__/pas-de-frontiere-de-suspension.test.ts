import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
 * le produit — d'où un test qui regarde des noms de fichiers.
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
 * **(a) `generateMetadata` ne protège PAS le statut.** La fiche de bien appelle `notFound()` dans
 * son `generateMetadata` depuis TCK-335, précisément pour tenir le code HTTP — et elle passe tout
 * de même à 200 dès qu'un `loading.tsx` existe dans son segment. Le remède de TCK-335 et cette
 * garde ne sont pas redondants : le premier ne suffit pas sans la seconde.
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
