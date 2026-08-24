---
id: TCK-338
title: "Une recherche à plusieurs mots doit les exiger tous"
status: done
phase: P1
family: applicatif
estimate: M
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [back, front, search, meilisearch, adr]
---

## Objectif utilisateur

Un visiteur qui cherche « villa Saly » ne reçoit pas des villas de Dakar.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md) parce que c'est une **décision
structurelle** : passer le moteur public en conjonction change le contrat de la recherche pour tout
le site. Le dépôt exige un ADR **avant** l'implémentation → **[ADR-0024](../../adr/0024-recherche-publique-conjonctive-avec-repli-nomme.md)**.

Mesure fondatrice ([audit](../../qa/audit-recherche-navigation-2026-08-21.md) §1.1) : `q=villa Saly`
rend **exactement les mêmes 63 résultats, dans le même ordre**, que `q=villa`. Meilisearch applique
sa règle `words` — il retire les termes qui ne matchent pas plutôt que d'exclure les documents.
**Re-mesuré le 2026-08-21, TCK-335 fusionné : le défaut est intact** (63 = 63, et `q=Saly` seul
rend 0).

## Contraintes strictes (métier)

> ⚠️ **CETTE SECTION ÉTAIT FAUSSE SUR DEUX CHIFFRES, ET ILS ÉTAIENT LOAD-BEARING.** Elle affirmait :
> *« `matchingStrategy: 'all'` seul est un piège, et c'est mesuré : `villa a louer a Dakar` → 0,
> `a vendre` → 0 »*. Ces deux mesures dataient d'**avant** les mots vides et le vocabulaire
> d'intention — c'est-à-dire d'avant la dépendance que ce même ticket déclarait satisfaite
> (`depends_on: [TCK-335]`). Re-mesurées le 2026-08-21 sur la base locale (258 biens publics,
> filtre public complet), TCK-335 en place :
>
> | requête | mesure du ticket | re-mesure 2026-08-21 |
> |---|---|---|
> | `villa a louer a Dakar` sous `all` | 0 | **35** |
> | `a vendre` sous `all` | 0 | **54** |
>
> *Une mesure sans sa date devient une croyance* — et celle-ci servait à justifier que `all` était
> inutilisable seul. Ce qui reste vrai de l'intuition : les trois leviers se valident bien
> **ensemble**, et c'est désormais un TEST qui le dit
> (`RechercheConjonctiveTest::test_les_mots_vides_ne_deviennent_pas_des_termes_exiges`) plutôt
> qu'un chiffre recopié.

- Les mots vides et le vocabulaire d'intention (TCK-335) sont une **précondition** de `all` : sans
  `stopWords`, « à » et « une » deviennent des termes exigés qu'aucun bien ne porte, et la requête
  la plus naturelle du français rend 0.
- **`all` est brutal sur un catalogue mince, et c'est mesuré** : sur les 60 couples
  *(6 types × 10 villes les plus représentées)*, **30 tombent à 0**. Une faute sur un mot court
  (`villa dakr`) fait **63 → 0** sans dégradation intermédiaire — `dakr` fait 4 caractères, sous
  `typoTolerance.minWordSizeForTypos.oneTypo = 5`.
- Il faut donc un **repli produit**, et il est **constitutif de la décision**, pas un ornement :
  sans lui on remplace un mensonge par un cul-de-sac.

## Delta à produire

- [x] **ADR** frère d'ADR-0008 → [ADR-0024](../../adr/0024-recherche-publique-conjonctive-avec-repli-nomme.md)
      ⚠ soumis **dans la même PR** que l'implémentation : la règle du dépôt porte sur l'ordre de la
      *décision*, pas sur l'ordre des merges, et un agent délégué ne pousse pas.
- [x] `matchingStrategy: 'all'` sur la recherche publique
- [x] Repli en **un seul `/multi-search`** : requête rejouée en `last` + une sonde `all` par terme
      utile (`hitsPerPage: 0`), sous le **même filtre structuré** que la requête
- [x] La réponse porte `search: { strategy: 'all'|'widened', terms_unmatched: [], widened_total: null|N }`

> ⚠️ **LA PRESCRIPTION D'ORIGINE ÉTAIT IRRÉALISABLE, et il faut le dire.** Elle demandait que
> « la réponse nomme les **termes relâchés** ». **Meilisearch ne les rend pas** — aucun champ de
> réponse ne les porte — et sous `last` il n'existe même pas d'ensemble global à nommer : seul le
> PREMIER terme est obligatoire, et le sous-ensemble retenu varie **document par document**.
>
> Ce qui EST calculable, et qui est livré : les termes dont une **sonde solo rend 0**.
> C'est une affirmation prouvable — « aucun bien ne correspond à *Saly* » — et le service
> s'interdit de nommer un terme qu'il n'a pas sondé. Quand tous les termes existent mais que leur
> intersection est vide (`studio piscine` : 44 et 3, intersection 0), **aucun terme n'est nommé** :
> chacun est vrai séparément, en désigner un serait inventer un coupable.

## Critères d'acceptation

> ⚠️ **LES DEUX AC D'ORIGINE ÉTAIENT COCHABLES PAR UNE RÉGRESSION**, et par la même :
> un **post-filtrage de la PAGE** côté PHP (ne garder que les hits portant tous les termes) coche
> AC1 (« `villa Saly` rend 0 ») **et** AC2 (« non nul, strictement inférieur »), tout en rendant un
> `meta.total` plafonné à `per_page`, une `last_page` à 1 et une page 2 vide. Les deux AC se
> gardaient mutuellement contre le mauvais risque. Ils sont remplacés par des critères qu'un
> filtrage de page **ne peut pas** produire.

- [x] **AC1 — la conjonction RESTREINT, et le total vient du moteur.** `q=villa Dakar` rend
      exactement le même **ensemble d'ids** que `q=villa&city=Dakar` — pas seulement le même
      compte. Et sur `per_page=2` avec 3 biens conjonctifs : `meta.total = 3`, `last_page = 2`, et
      la page 2 rend réellement le troisième bien.
      *(`RechercheConjonctiveTest::test_le_compte_conjonctif_coincide_avec_le_filtre_structure`,
      `::test_le_total_conjonctif_est_celui_du_moteur_pas_dune_page`)*
- [x] **AC2 — le repli est EXERCÉ, et ce qu'il nomme est PROUVÉ.** Sur une requête dont un terme ne
      correspond à rien : `strategy = 'widened'`, `terms_unmatched` contient ce terme **et lui
      seul**, `widened_total` égale `meta.total`, et les biens élargis sont **servis**. Le test
      rejoue lui-même la sonde solo au lieu de croire le service sur parole.
      *(`::test_le_repli_nomme_le_terme_qui_ne_correspond_a_rien`)*
- [x] **AC3 — le terme nommé est SONDÉ, pas deviné.** `q=Mbour villa` et `q=villa Mbour` nomment
      tous deux `["Mbour"]` : une implémentation qui désignerait le dernier mot cocherait AC2 et
      rougirait ici. *(`::test_le_terme_nomme_ne_depend_pas_de_sa_position`)*
- [x] **AC4 — quand chaque terme existe mais pas leur intersection, on ne nomme RIEN.**
      `terms_unmatched = []`, `strategy = 'widened'`, `widened_total > 0`.
      *(`::test_le_repli_ne_nomme_aucun_terme_quand_lintersection_seule_est_vide`)*
- [x] **AC5 — la sonde est vraie DANS LE CONTEXTE AFFICHÉ.** Sous `city=Dakar`, une villa qui
      existe à Saly ne rend pas `Saly` « correspondant » : les sondes portent le filtre structuré.
      *(`::test_le_repli_sonde_sous_le_filtre_structure_de_la_requete`)*
- [x] **AC6 — le repli ne se déclenche jamais à tort.** Un seul terme utile (`Mbour`, `à Mbour`)
      reste en `strategy = 'all'` avec `widened_total = null` ; une requête qui aboutit aussi.
      *(`::test_un_seul_terme_utile_ne_declenche_pas_le_repli`,
      `::test_une_requete_qui_aboutit_reste_en_regime_nominal`)*
- [x] **AC7 — les comptes MONO-TERME de TCK-335 ne bougent pas.** `matchingStrategy` n'a aucun
      effet à un seul terme utile ; les sept tests de `PropertySearchVocabularyTest` (« louer »,
      « vente », « meublé », « piscine »…) restent verts, et six d'entre eux sont **insensibles**
      à l'ablation de `all` — ce qui est la preuve, pas une coïncidence.

- [x] **AC8 — l'écran DIT le repli, et il propose un geste.** Sur `q=villa Saly`, la page rend
      « Aucun bien ne correspond à « Saly ». » **et** « Voici les 63 biens qui correspondent à une
      partie de vos mots. » ; le bouton « Retirer « Saly » » écrit `/properties?q=villa&page=1` —
      c'est-à-dire qu'il garde la moitié de la demande qui marchait. Sur `q=studio piscine`,
      **aucun mot n'est nommé** et aucun bouton « Retirer » n'existe. Sous `strategy: 'all'`,
      **aucune étiquette n'est rendue**. Les libellés sont dans les trois locales.
      *(`WidenedSearchNotice.test.tsx`, `PropertiesDiscoveryPage.repli.test.tsx`,
      `repli-de-recherche.test.ts`)*
      ⚠ Le test « rien d'affiché » serait vert sur un composant qui n'affiche JAMAIS rien : il ne
      vaut qu'attelé aux deux positifs, dans le même fichier.

**Ablations jouées** (chacune restaurée) :

| ablation | attendu | mesuré |
|---|---|---|
| retirer `'matchingStrategy' => 'all'` | les tests de conjonction rougissent, les mono-termes non | **11 rouges / 19**, les 6 mono-termes verts |
| retirer le bloc de repli | seuls les tests de repli rougissent | **7 rouges / 12** |
| sonder sans le filtre structuré | AC5 rougit | **1 rouge**, ciblé |
| nommer TOUS les termes au lieu des sondés à 0 | AC4 rougit | **6 rouges**, dont AC4 |
| deviner le DERNIER terme au lieu de sonder | AC3 et AC4 rougissent | **2 rouges**, exactement ceux-là |

## Hors périmètre

- L'analyse d'intention (transformer un terme en valeur de filtre) : encore un cran plus loin.
- La vue CARTE (`/map`) ne reçoit même pas `q` (cf. `mapFilters`) : l'étiquette y parlerait de
  résultats que la carte n'affiche pas. Elle n'est donc montée que sur la vue liste.
- ~~L'affichage du repli côté front~~ — **LIVRÉ dans la même PR, il n'est plus hors périmètre.**
  Cette section décrivait, à raison, la moitié qui manquait : `takussan-web/src/types/search.ts`
  ne déclarait pas le bloc `search`, si bien que `strategy` et `terms_unmatched` **arrivaient dans
  le JSON et mouraient là**, et qu'une requête élargie s'affichait *exactement comme avant*.
  Ce qui a été ajouté :

  | quoi | où |
  |---|---|
  | `BlocDeRecherche`, `SearchResult.search`, `repliDeRecherche()`, `retirerTermeDeLaRequete()` | `takussan-web/src/types/search.ts` |
  | `repli` et `retirerTerme` exposés par le hook | `takussan-web/src/hooks/useSearch.ts` |
  | l'étiquette elle-même, ses deux phrases et ses gestes | `takussan-web/src/components/search/WidenedSearchNotice.tsx` |
  | le montage, sous les trois gardes (`repli`, `!error`, vue liste) | `takussan-web/src/components/property/PropertiesDiscoveryPage.tsx` |
  | 5 clés × 3 locales sous `search.widened` | `takussan-web/src/messages/{fr,en,wo}.json` |

  **Le champ est OPTIONNEL dans `SearchResult`, délibérément** : la production appelle
  `api.takussan.com`, qui rend 404 (TCK-332), et un front peut recevoir la réponse d'un
  déploiement antérieur. `repliDeRecherche()` lit alors « rien à dire », qui est le bon défaut.

  **Ce que l'écran dit, et ce qu'il refuse de dire :**
  - `terms_unmatched` non vide → « Aucun bien ne correspond à « Saly ». » + le compte élargi +
    **un bouton par terme** qui retire ce mot-là et garde le reste de la requête
    (`q=villa Saly` → `?q=villa&page=1`, et non `?page=1`).
  - `terms_unmatched` vide → « Aucun bien ne réunit tous vos mots. » + le compte élargi +
    « Effacer les mots-clés ». **Aucun mot n'est nommé** : chacun est vrai séparément.
  - `strategy: 'all'` → **rien**, même si le bloc portait des termes. C'est `strategy` qui
    commande, jamais le tableau : afficher un avertissement au-dessus d'un résultat exact
    ajouterait un mensonge au lieu d'en retirer un.

  **Vérifié par ablation** (chacune restaurée) : retirer `search` de `SearchResult` → `tsc`
  sort en 1 ; ignorer `strategy` → 2 rouges dont le cas nominal ; un gabarit de libellé UNIQUE au
  lieu de deux → 3 rouges, tous dans le cas « intersection vide » ; « retirer le terme » réduit à
  effacer `q` → 1 rouge, `'/properties?page=1'` au lieu de `'/properties?q=villa&page=1'` ;
  retrait du garde `!error` → 1 rouge ; démontage du composant → 3 rouges sur 4 ; suppression des
  5 clés `en` → la garde i18n **et** le test anglais rougissent (le deep-merge `fr` ne produit,
  lui, aucune erreur d'exécution).


## Notes d'implémentation

- `app/Services/Search/PropertySearchService.php` — les deux régimes, `usefulTerms()` (mots vides
  **lus** dans `config/scout.php`, jamais recopiés), `widen()` (un seul `/multi-search`, mesuré
  6-30 ms pour 2 à 4 termes), plafond de `MAX_PROBES = 8` sondes.
- `meta` reste construite par `PaginationMeta::of()` : aucune seconde forme d'enveloppe.
  Sous `widened`, `data`, `facets` et `meta` décrivent **tous** le résultat élargi, et
  `widened_total` en est l'écho — il ne peut donc pas contredire la pagination.
- Si le moteur ne rend pas le compte de réponses attendu, `widen()` rend `null` et la réponse
  **reste conjonctive** : on ne fabrique pas un repli qu'on n'a pas mesuré.
- `PropertySearchVocabularyTest::test_une_phrase_en_francais_courant_classe_le_bon_bien_en_tete` a
  été **réécrit** en `…_restreint_au_bon_contrat` : ses deux totaux passent de 2 à 1, et c'est le
  comportement voulu. Sa version TCK-335 portait l'avertissement *« ce que ce test ne prouve pas :
  le TOTAL reste invariant »* — cet avertissement n'a plus lieu d'être, c'est précisément ce qui a
  changé.
