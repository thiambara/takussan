# Radar 2 et suggestions de recherche — plan d'exécution (2026-11-04)

ADR : [0087](../adr/0087-le-radar-lit-par-site-decouvre-par-sitemap-et-cible-la-demande.md),
[0088](../adr/0088-le-journal-anonyme-des-recherches.md). Tickets : TCK-2465 → TCK-2476 (vague 81).
Branche unique : `feat/radar-2-et-suggestions`, une PR vers `dev`.

## Organisation

Un seul arbre, une seule branche. Les agents **éditent** ; la session **commite** par ticket (pathspecs). Aucune commande
git qui écrit côté agent. Les suites entières tournent en CI ; un agent ne lance que ses fichiers de test.
`docs/features.md` et `docs/models-spec.md` ont un seul écrivain : la session, après la dernière vague.

| Vague | Tickets (un agent chacun) | Pourquoi ensemble |
|---|---|---|
| A | TCK-2465 (adaptateurs), TCK-2468 (cibles, API), TCK-2472 (journal), TCK-2473 (analyse de la saisie) | aucune dépendance entre eux, fichiers disjoints |
| B | TCK-2466 (extraction économe), TCK-2467 (sitemap), TCK-2469 (console des cibles), TCK-2474 (index et route), TCK-2470 côté API | chacun ne dépend que de la vague A |
| C | TCK-2475 (barre de recherche), TCK-2476 (variantes IA), TCK-2471 (message), TCK-2470 côté console | dépendent de B |
| D | vérification adverse (un agent par groupe), intégration des specs, Pint, lint, push, PR | — |

## Fichiers partagés et qui les tient

- `ExtractRadarListing` : TCK-2465 (A), puis TCK-2466 (B). TCK-2468 **n'y touche pas** : le rattachement aux cibles se fait
  par un observateur du passage à `extracted`, après le commit.
- `RadarCrawler` : TCK-2468 (A), puis TCK-2467 (B).
- `routes/console.php`, `AppServiceProvider`, `PlatformRoutesDefaultDenyTest`, le fichier de routes du Radar : édition par
  `Edit` seulement (l'outil refuse une écriture sur un fichier modifié depuis sa lecture), entrées ajoutées, jamais
  réordonnées.
- Dictionnaires i18n du front : vagues B et C, mêmes règles.
