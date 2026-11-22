---
id: TCK-2497
title: Écran de recherche « Riche et complet » : la barre actuelle, enfin visible au téléphone
status: done
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, search, mobile, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur trouve sa recherche en un toucher (récente, populaire, quartier, type, autour de lui), voit ce que la barre a compris de sa saisie et l'ouvre d'un pouce, et n'arrive jamais devant zéro résultat sans issue.

## Contrat de données

`GET /api/search/suggest` tel qu'aujourd'hui, plus les ajouts optionnels de TCK-2496 (`relaxations`, interprétation tolérante, `published_after` — paramètre plat de `/api/public/properties/search`) : l'écran les montre quand l'API les rend, et s'en passe sinon. Recherches récentes : stockage de l'appareil (`recherches-recentes`), inchangé.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=recherche&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Avant la frappe », « Pendant la frappe », « Aucun bien », « Depuis la liste », téléphone et bureau.
- Avant la frappe : Louer/Acheter, Autour de moi, recherches récentes (rejouables, « Effacer »), recherches populaires avec leur compte, quartiers populaires, types de bien.
- Pendant la frappe : la saisie comprise en tête, en puces, avec son bouton « Voir les N biens » ; puis recherches fréquentes, lieux, types, trois biens.
- Aucun bien : « M'alerter » (alerte de TCK-599 pré-remplie), « Voir des biens proches » quand la liste s'élargira, critères à retirer avec leur compte.
- Depuis la liste : une ligne « Tes filtres restent : … » avec « Retirer ».
- En bureau, le même contenu dans le panneau sous le champ de l'en-tête, avec les aides clavier.

## Contraintes strictes (métier)

- **Aucune régression** de `SearchAutocomplete` (relevé du 2026-11-08) : saisie comprise et compte sous la base de la page, Entrée qui la valide, alerte à compte nul, « biens proches » seulement si la liste s'élargit, recherches fréquentes et populaires, lieux et types plafonnés, trois aperçus, texte libre sans compréhension, récentes effaçables, Louer/Acheter à trois états imposés à toute URL produite, motif combobox ARIA et annonce du nombre de suggestions, clavier ouvert au premier appui sur Safari iOS, champ en 16 px, fermer sans valider ne touche pas à l'URL.
- Louer/Acheter et le bouton principal ne sont **jamais recouverts** par la liste des suggestions (défaut relevé le 2026-11-08).
- « Autour de moi » ne demande la position qu'au toucher.

## Delta à produire

- [ ] Écran de recherche plein écran du téléphone selon la maquette D.
- [ ] Panneau de bureau enrichi (même contenu, aides clavier).
- [ ] Lecture des ajouts de TCK-2496 quand ils sont présents.
- [ ] Tests : chaque comportement de la liste « aucune régression » ci-dessus garde son test (existants conservés, nouveaux pour les ajouts) ; Louer/Acheter visible pendant la frappe.

## Critères d'acceptation

- [ ] AC1 — À 390 px, pendant la frappe, Louer/Acheter et le bouton « Voir les N biens » sont visibles au-dessus du clavier.
- [ ] AC2 — Tous les tests existants de `SearchAutocomplete` passent sans être réécrits dans leur intention.
- [ ] AC3 — Depuis `/fr/properties?…` avec deux filtres posés, l'écran les nomme, et le compte annoncé est celui de la liste ouverte.
- [ ] AC4 — Sans réponse de TCK-2496 (clé absente), l'écran « Aucun bien » montre l'alerte et les biens proches, sans bloc vide.

## Hors périmètre

- Les calculs côté API (TCK-2496).
- La recherche en langage naturel (approche C, non retenue).

## Notes d'implémentation

Re-mesuré le 2026-11-09 (vague 2, agent « accueil-recherche ») :

- **Les ajouts de TCK-2496 sont servis** (`curl /api/search/suggest?q=appart%203ch%20mermos`) : la part de lieu garde
  `from`/`to` du mot TAPÉ (11–17 = « mermos ») et `value` = l'orthographe de l'index (« Mermoz ») ; sous un compte nul,
  `interpretation.relaxations = [{key, count}]` (`q=terrain mermoz 5ch` → `bedrooms` 3, `type` 1). Retirer `tags` retire
  TOUS les tags de la saisie (une clé, plusieurs parts) ; retirer `location` garde la ville déduite.
- **`published_after` est plat sur `/api/public/properties/search`**, strictement postérieur, et **422 dans le futur**
  (« must be a date before or equal to now ») : une horloge de l'appareil en avance fait échouer le compte, qui se tait.
- **Une saisie vide ne rend aucun lieu** (`q=` → `places: []`, `popular: []` sur la base de dev) : les « quartiers
  populaires » de l'écran ne peuvent pas venir de la suggestion. Ils viennent du domaine des facettes
  (`/public/properties/neighborhoods?city=<ville>`), la ville étant celle de la base, sinon la plus fournie du catalogue
  (`/public/properties/cities`, trié par compte) — aucune ville écrite en dur. Les types : `/public/property-types`, sous une
  clé de cache À PART : le menu « Plus » de la `Navbar` range sous `referentielPublicQueryKeys.typesDeBien()` une table
  `{type: compte}`, pas la liste — partager la clé ferait lire à l'un la forme de l'autre.
- **Les recherches récentes ne portaient aucune date** (`{texte, qs}`) : « N nouveaux depuis votre dernière visite » ne
  peut se compter que pour une recherche retenue APRÈS ce ticket (`vue`, ISO 8601, posée par `retenirRecherche`). Une
  récente plus ancienne s'affiche sans compte.


Ce qui a été fait, et pourquoi (2026-11-09) :

- **Un composant, trois surfaces** (`SearchAutocomplete`, prop `surface`) : `menu` (défaut, inchangé — la barre de la
  console et la liste des biens), `ecran` (la saisie plein écran du téléphone, `Navbar`) et `panneau` (la barre de
  bureau). Les quatre fichiers de tests existants passent sans une ligne changée (AC2 : 47/47).
- **AC1 — la liste ne recouvre plus rien.** Avant, dans la saisie mobile, la liste était `absolute top-full` sous le champ
  et se posait PAR-DESSUS Louer · Acheter et « Rechercher » (rangés après le champ). En `ecran`, le champ, puis
  `sousLeChamp` (Louer · Acheter + « Rechercher », sur une ligne), sont un en-tête fixe ; la liste prend le reste de la
  hauteur (`flex-1 overflow-y-auto`) et défile seule. La saisie comprise y devient une carte dont le geste est
  « Voir les N biens ».
- **AC3 — les filtres gardés.** Une ligne « Vos filtres restent : Villa · 3+ ch. — Retirer » nomme les filtres de la liste
  en vigueur que la recherche gardera, hors transaction (Louer · Acheter la montre) et hors terme (la saisie le
  remplace). La suggestion part déjà avec la base (revue du 2026-11-04, défaut n° 5) : le compte annoncé est celui de la
  liste. « Retirer » est une OPTION de la liste (clavier compris), pas un bouton dans une option ; il vaut pour la
  suggestion, pour la navigation par la liste ET pour le bouton « Rechercher » de la `Navbar`, qui construit son URL
  lui-même (`onRetraitDesFiltres`). Le retrait vaut pour l'URL où il a été demandé : refermer la saisie le défait.
  ⚠ Le test de la `Navbar` a trouvé un défaut du premier jet : la catégorie allumée (`activeCategory`) relisait `type` dans
  l'URL et le remettait après le retrait.
- **AC4 — clé `relaxations` absente ou vide** : aucun groupe « Retirer un critère » (jamais de titre sans option) ;
  restent « Aucun bien ne correspond aujourd'hui », « Voir des biens proches » (si la liste s'élargira, ADR-0024) et
  l'alerte. Présente : une pastille par critère, « Sans 5+ ch. · 4 », qui ouvre la liste SANS ce critère ; retirer le
  quartier garde la ville qu'il impliquait (même règle que l'API).
- **La correction se dit** : « « mermos » lu Mermoz », tirée des `from`/`to` de la part et de sa `value` ; une différence
  de casse ou d'accent n'est pas une correction, et seuls les lieux sont concernés (« appart » → `apartment` n'est pas
  une faute).
- **« Autour de moi »** : la position n'est demandée qu'au geste ; un point remplace le lieu et le terme (`lat`, `lng`,
  `radius_km=2`, contrat de `SearchPublicPropertyRequest`) ; un refus se dit à l'écran.
- **Le panneau de bureau** : champ vide, deux colonnes (récentes, autour de moi | populaires, quartiers, types) ; l'ordre
  du clavier suit l'ordre visuel ; les aides clavier sont sous la liste, hors du `listbox`.
- **Écarts à la maquette** : pas de raccourcis « Louer / Acheter » dans la liste de l'écran (le sélecteur est déjà sous
  le champ) ; « Recherches populaires » ne s'affiche que si l'API en rend (base de dev : aucune).
- **Contraste** : les options étant rendues par une fonction, la garde `surface-publique.contraste` ne voit plus le
  `bg-card` de la liste et juge `bg-primary/8` / `bg-muted/50` sur un fond inconnu. En clair, la ligne active passe à
  `bg-secondary text-primary-deep` (`text-primary` n'y tient que 4,45:1) et le survol à `bg-muted` ; en sombre, les
  teintes d'avant restent (`dark:`), car `--secondary`/`--muted` y font tomber le `<mark>` à 4,44:1.
- **Hydratation** (signalée en cours de vague sur `/fr/compare`) : non reproduite sur l'arbre stable, à 1440 et 390
  (`/fr`, `/fr/compare`, liste filtrée) — aucune erreur console. La pilule ne lit rien du navigateur au rendu (récentes et
  dates ne sont lues qu'en surface `ecran`, montée au clic). Probablement servie pendant une fenêtre d'édition.

### Revue adverse — corrections (2026-11-09)

- **Le compte d'une pastille est celui de la liste qu'elle ouvre** (majeur). « Quartiers populaires » et « Type de
  bien » lisaient des comptes globaux (`/neighborhoods`, `/property-types`). Ils sont lus désormais par
  `requeteDeFacette` : la requête de la liste **que la pastille ouvre** (`urlDeSuggestion` sur la base — filtres gardés
  et transaction), moins son propre paramètre (`type`, `location`) et `page`, avec `facets=<f>`, `per_page=1`,
  `fields[properties]=id`, `placements=false`. Une facette que l'API ne compte pas (`meta.facets[f]` absent) n'affiche
  **aucun** groupe — jamais un compte global. La ville des quartiers est celle de la base, sinon la plus fournie.
  Mesuré à 390 sur `/fr/properties?contract_type=rent&bedrooms=3` : Appartement 16, Maison 15, Villa 13, Sicap Baobab
  6, Dieuppeul-Derklé 5, Dakar-Plateau 3, HLM 2 — chacun égal au `meta.total` de la liste ouverte (Appartement
  global : 33).
- **« N nouveaux »** envoie `fields[properties]=id`.
- **`estRecente`** refuse un texte vide ou blanc (il se rendait en option sans nom).
