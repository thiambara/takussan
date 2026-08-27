import type { Locale } from '@/i18n/config';
import { cheminLocalise } from '@/i18n/routing';

import { ORIGINE_SITE } from './alternates';

/**
 * Le socle commun des données structurées — TCK-435.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI UN SEUL UTILITAIRE, ET NON UNE COPIE PAR PAGE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `src/lib/jsonld-property.ts` était un travail soigné dont **rien n'était réutilisé** : sa
 * sérialisation et son filtre de clés vides vivaient l'un dans la page de fiche, l'autre en
 * privé dans le module. Trois surfaces de plus arrivent avec ce ticket ; recopier l'échappement
 * quatre fois, c'est se donner quatre occasions de l'oublier une fois — et un `</script>` oublié
 * n'est pas un balisage invalide, c'est une **balise HTML fermée au milieu du document**.
 */

export type NoeudJsonLd = Record<string, unknown>;

/**
 * Retire les clés VIDES — `undefined`, `null` et la chaîne vide.
 *
 * ⚠️ Les trois, et pas seulement `undefined` : c'est l'AC3 de TCK-435. Une ville nulle ne doit
 * produire ni `"null"`, ni `null`, ni `""` — le dépôt a déjà payé le motif dans la
 * `<meta description>` d'une fiche, où `String(null)` peignait littéralement « null » à l'écran
 * (TCK-292, réparé par TCK-335). En JSON-LD, une valeur fausse est pire qu'une valeur absente :
 * un moteur la lit comme une affirmation.
 *
 * `0` et `false` sont CONSERVÉS — ce sont des valeurs, pas des absences. Un bien à zéro chambre
 * l'affirme ; c'est une note à zéro sur zéro avis que ce ticket interdit, et elle est traitée là
 * où elle se décide, pas ici (cf. `aggregateRating` de `jsonld-profil.ts`).
 */
export function sansVides(noeud: NoeudJsonLd): NoeudJsonLd {
  return Object.fromEntries(
    Object.entries(noeud).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

/**
 * Sérialise un nœud pour `dangerouslySetInnerHTML`.
 *
 * `</script>` dans une description de bien ou dans une biographie d'agent terminerait la balise —
 * le reste du JSON serait alors interprété comme du HTML. `<` est échappé en `<`, une
 * séquence que JSON comprend et que l'analyseur HTML ne voit pas.
 *
 * ⚠ On échappe TOUS les `<`, pas seulement `</script`. Un échappement qui reconnaît un motif
 * précis est un échappement qu'on contourne : `</script>`, `</SCRIPT >`, `<!--` sont autant
 * de formes que l'analyseur HTML traite et qu'un motif littéral rate.
 */
export function scriptJsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}

/**
 * Le bloc `<script type="application/ld+json">` — **le seul point d'émission du dépôt**.
 *
 * Composant serveur, sans état : une page l'emploie autant de fois qu'elle a de nœuds à déclarer.
 * C'est `React.Fragment` qui n'a pas de place ici — un `<script>` doit être un nœud du document.
 */
export function DonneesStructurees({ donnees }: { readonly donnees: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: scriptJsonLd(donnees) }} />
  );
}

/**
 * L'URL ABSOLUE et PRÉFIXÉE d'un chemin public — la seule forme qu'un `@id` ou un `item` doive
 * porter.
 *
 * ⚠️ Deux erreurs qu'elle ferme d'un coup, et les deux sont invisibles à l'œil :
 *
 * · **une URL relative** dans un JSON-LD est résolue contre l'URL du DOCUMENT. Sur
 *   `/fr/properties/x`, un `url: '/properties/x'` désigne donc `https://hôte/properties/x` —
 *   qui rend **307** depuis TCK-434. Le balisage annoncerait une redirection ;
 * · **une URL non préfixée** ferait déclarer la même entité par les trois langues sous une seule
 *   adresse, laquelle ne sert aucune des trois.
 */
export function urlAbsolue(chemin: string, locale: Locale): string {
  return `${ORIGINE_SITE}${cheminLocalise(chemin, locale)}`;
}
