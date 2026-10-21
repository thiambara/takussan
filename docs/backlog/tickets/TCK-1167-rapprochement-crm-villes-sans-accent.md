---
id: TCK-1167
title: "Rapprochement CRM : les villes du prospect se comparent par leur clé repliée, accents compris"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-99--critères-de-ville-et-de-région-rangés-par-nom-face-au-chargeur-du-référentiel"
tags: [back, crm, geo, pistes]
---

## Contexte

Réf : **P99.05** du fichier de pistes (🟠), `validé`.

Les villes d'un prospect sont saisies en texte libre et `ProspectMatcher` les comparait à
`addresses.city` par `CaseInsensitive`, qui ne replie que la casse : « Guediawaye » ne trouvait
pas « Guédiawaye », dans aucun des deux sens. Les quartiers du même formulaire se comparent par
`CleDeQuartier` (accents et tirets repliés) depuis TCK-1083.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix de l'implémenteur.** La piste offre deux voies : rattacher la saisie au référentiel
(`villeParNom`), ou comparer les villes par une clé repliée comme les quartiers. Retenue, la plus
étroite : **la clé repliée**, calculée en PHP par `CleDeQuartier` (la base n'a pas `unaccent`),
sans toucher au formulaire ni au texte saisi. Le docblock qui écrivait « sans replier les
accents » est corrigé, comme la piste le demande.

## Delta à produire

- [x] `propertiesFor()` : les textes `addresses.city` qui ont la clé d'une ville saisie.
- [x] `customersFor()` : `whereCityAccepts()`, les prospects de l'agence dont une ville saisie a
      la clé de la ville du bien, jugés en PHP.
- [x] `whereListAccepts()` perd sa branche repliée, devenue sans appelant.
- [x] Test `test_a_city_written_without_accent_matches_both_ways` (`ProspectMatcherTest`).

## Critères d'acceptation

- [x] AC1 — prospect `["Guediawaye", "thies"]` ; biens à « Guédiawaye », « Thiès » et « Dakar » :
      `propertiesFor` rend les deux premiers ; `customersFor` de chacun rend le prospect.
- [x] AC2 — `test_city_is_compared_folded` (« DAKAR ») reste vert.

## Hors périmètre

- La recherche publique et les alertes (`city`, `cities`) gardent l'égalité stricte sur le texte
  indexé : la piste ne vise que le CRM.

## Notes d'implémentation

- Ablation : `ProspectMatcher.php` rendu à son état précédent → le test neuf rougit (`propertiesFor`
  rend `[]`) ; remis → 7/7, et 6/6 dans `SendProspectMatchDigestTest`.
- Les textes de ville des adresses se lisent une fois par instance (`villesParCle`), groupés par clé.
