---
id: TCK-2522
title: Fiche d'agence « La vitrine à onglets, couverture et recherche »
status: done
phase: P1
family: front
estimate: L
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2517, TCK-2518]
blocks: [TCK-2523]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, agence, mobile, audit-ux]
---

## Objectif utilisateur

L'agence a une vitrine qui la vend ; le chercheur y trouve sa sélection dès le premier écran, puis fouille ses biens avec la même aisance que la recherche du site.

## Contrat de données

`GET /api/public/agencies/{slug}` (accroche, « Pourquoi nous », `cover`, `showcase`, délai, baux du mois — TCK-2518) ; biens : liste publique avec `filter[agency]` et `facets` (TCK-2517). Équipe, avis, infos : inchangés.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=agence&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Biens, Filtres, Biens filtrés, Aucun bien ; Équipe, Avis et Infos sont ceux de l'approche A (`a=a`).
- Haut de page (de C) : couverture de trois biens, accroche, « Pourquoi nous » en trois lignes, la sélection, les avis avec leur contexte (« Locataire · bail »).
- Ensuite (de A) : onglets collants Biens · Équipe · Avis · Infos ; biens en lignes denses avec « Voir plus » ; barre WhatsApp · Appeler · Message ; colonne d'identité fixe en bureau.
- Recherche dans les biens : champ, Louer / Acheter, type, budget, chambres, quartier, tri ; feuille de filtres au téléphone, panneau par filtre en bureau avec le compte par option ; filtres actifs en pastilles retirables ; « 3 biens sur 67 » ; état « Aucun bien » : effacer, deux élargissements avec leur compte, lien vers les autres agences.
- **Les filtres sont ceux de la liste des biens, sur le même composant** — pas un second.
- ⚑ **Écart de charte, accepté (décision 2a du porteur, 2026-11-09)** : la couverture plein cadre s'étend à toutes les fiches d'agence. À écrire dans `docs/design-guidelines.md`.

## Contraintes strictes (métier)

- Rien de l'existant ne se perd : retour, logo (monogramme), badge vérifié, licence, description, chiffres, portefeuille Tous / À louer / À vendre avec les vrais totaux, avis avec note moyenne et auteur abrégé, données structurées, vrai 404, état « indisponible ».
- L'équipe ne montre que les agents (TCK-2506).
- Filtres dans l'URL : un lien partagé rouvre la même sélection ; rendu serveur de la première page.
- Sans accroche ni sélection, la fiche retombe sur la forme A sans trou.
- Sur la fiche, la barre d'actions remplace la barre d'onglets (ADR-0091 § 4).

## Delta à produire

- [x] Haut de page vitrine (couverture, accroche, « Pourquoi nous », sélection).
- [x] Onglets collants et lignes denses.
- [x] Recherche et filtres branchés sur la liste publique, état vide.
- [x] Barre d'actions.
- [x] Règle de couverture dans `docs/design-guidelines.md`.
- [x] Clés i18n `fr`/`en`/`wo`.
- [x] Tests (filtres dans l'URL, compte « N sur M », état vide, retombée sans contenu de vitrine, équipe sans propriétaires).

## Critères d'acceptation

- [x] AC1 — `/fr/agencies/<slug>?contract=rent&bedrooms=2&price_max=1000000` rend côté serveur les biens filtrés et « N biens sur M ».
- [x] AC2 — La sélection est visible sans défilement à 390 × 844 quand l'agence en a une.
- [x] AC3 — Une recherche sans résultat propose deux élargissements dont le compte est celui des facettes de l'API.
- [x] AC4 — Une agence sans accroche, sans « Pourquoi nous » et sans sélection affiche couverture, identité et biens, sans bloc vide.
- [x] AC5 — À 360 px, la page ne défile pas horizontalement.

## Hors périmètre

- La saisie de la vitrine dans la console (TCK-2524).

## Notes d'implémentation

Relevés du 2026-11-09 (agent « fiches », vague 3), pile `./dev.sh` :

- **AC1 écrit `?contract=rent`** : la clé de la liste (et de l'API) est `contract_type`. L'AC se lit
  `/fr/agencies/<slug>?contract_type=rent&bedrooms=2&price_max=1000000` — les filtres de l'URL sont
  ceux de `/properties`, même dialecte, pour qu'un lien se transpose d'une page à l'autre.
- `facets` n'accepte que `contract_type,type,bedrooms,neighborhood` (`SearchPublicPropertyRequest::FACETTES`) :
  `price` → 422 « The selected facets is invalid. ». Le budget n'a donc pas de compte par option.
- Dakar Immo : `portfolio_total` 67 = `GET …/search?agency=dakar-immo` `meta.total` 67 (45 à louer, 22 à vendre).
  Le « sur M » se prend quand même à la recherche (`agency` seul, `per_page=1`) : `portfolio_total` compte
  `publicPortfolio()` (statuts `published` et `pending` compris), la recherche `public()` — sur une autre
  agence, « 64 biens sur 67 » sans aucun filtre serait faux.
- Base de dev : `tagline` null, `highlights` [], `showcase` [] pour les trois agences de l'annuaire ; `cover`
  rend trois photos. `median_response_minutes` null partout. Aucune agence `standard` publique sans bien
  (l'état « sans bien » se vérifie par les tests).
- **Pas de WhatsApp d'agence dans l'API** (ni `has_whatsapp` ni numéro dédié) : la barre ne propose
  WhatsApp que là où un numéro est déclaré WhatsApp — jamais sur la fiche d'agence aujourd'hui.
  La donnée existe côté personnes (`users.phone_whatsapp`, TCK-633) mais aucun endpoint public de fiche
  ne la sert → [TCK-2576](../todo/TCK-2576-whatsapp-au-premier-rang-des-fiches-d-agence-et-d-agent.md).
- **Contexte d'un avis (« Locataire · bail ») : livré pour les avis qui le portent — aujourd'hui ceux
  d'AGENT, sur la fiche d'agent (TCK-2523) ; pas encore sur la fiche d'agence, qui attend
  [TCK-2577](../todo/TCK-2577-un-avis-d-agence-ecrit-son-contexte.md).**
  - Livré (contre-vérification du 2026-11-09) : `ReviewResource` sert `context_kind` — le TYPE seul
    (`lease`, `booking`, `visit`, `maintenance_request`), lu de `reviews.context_type` sans charger la
    preuve (`ReviewEligibility::contextKindOf`), `null` sans contexte ou pour un type inconnu ; jamais
    `context_id` ni `context_type`. `ReviewsSection` (rendue par les deux fiches) l'écrit après le mois,
    en `text-foreground` comme la maquette (« Moussa S. · octobre 2026 · Locataire · bail »), et rien
    sans contexte (ni libellé, ni séparateur orphelin, ni clé brute). Clés `publicProfile.reviews.contexte.*`.
  - **Qui porte un contexte en production** (seconde contre-vérification, 2026-11-09) : `storeForAgent`
    écrit `context_type`/`context_id` depuis la preuve ; `storeForAgency` ne les écrit pas. Mesuré par la
    route (test jetable, hors dépôt) : un avis d'agence déposé sur un bail `active` dont l'auteur est le
    locataire, puis approuvé par la plateforme, garde `context_type` et `context_id` nuls, et la fiche
    d'agence sert `context_kind` null. Sur la fiche d'agence, le contexte ne s'affiche donc pour AUCUN
    avis aujourd'hui → [TCK-2577](../todo/TCK-2577-un-avis-d-agence-ecrit-son-contexte.md) (écriture du contexte
    au dépôt ; décision de la session : pas de changement de données dans cette vague).
  - **Transfert (2026-11-09)** : aucun AC de ce ticket ne promettait le contexte sur la fiche d'agence ;
    seule la Direction UX le décrivait (« les avis avec leur contexte (« Locataire · bail ») »). Cette
    ligne de direction n'est pas tenue ici et passe à TCK-2577 (AC2).
  - Preuves : `tests/Feature/Public/ReviewContextKindParLaRouteTest.php` (2 tests, **chemin de
    production** : `POST /api/agents/{user}/reviews` → `POST /api/reviews/{id}/approve` →
    `GET /api/public/agents/{slug}` rend `visit` après une visite, `lease` après un bail ; ablations :
    `context_*` retirés de `storeForAgent` → 2 rouges, `context_kind` retiré de la ressource → 2
    rouges). `tests/Feature/Public/ReviewContextKindTest.php` (8 tests) prouve ce que la ressource SERT
    d'une colonne donnée — avis posés par la factory, y compris un avis d'agence à contexte de bail que
    l'application ne produit pas encore : il garde la lecture prête pour TCK-2577, il ne prouve pas
    l'écriture. `ReviewsSection.contexte.tck-2522.test.tsx` (7 tests). Ablations de la première
    contre-vérification, chacune rouge puis restaurée (md5) : clé retirée de la ressource → 7 rouges ;
    `lease`/`booking` retirés de la correspondance → 3 ; `context_id` ajouté → 2 ; garde des types
    connus retirée → 1 ; ligne retirée → 6 ; séparateur hors condition → 1.
  - Navigateur (390, 2026-11-09) : les 377 avis de dev ont un contexte nul et aucun ne vise une agence ou
    un agent. Le relevé fait avec deux lignes insérées par `DB::table` sur Dakar Immo (puis supprimées)
    montre le RENDU (« … · Locataire · bail », et rien sans contexte), pas un état que l'application
    produit pour une agence. Nouveau couple encre/fond à noter : `text-foreground` sur `--card`
    (#1f1812 sur #ffffff), dans `ReviewsSection`.

Haut de page au téléphone (TCK-2568, amendement d'ADR-0091 ; consigne du porteur : « barre du site
seulement si la maquette la montre ») :

- `agencies` et `agents` sont remis dans `PREMIERS_SEGMENTS_A_EN_TETE_DE_PAGE` (`barre-publique.ts`,
  tests `barre-publique.en-tete.test.ts` et `Navbar.en-tete-au-telephone.test.tsx`, tableau
  `docs/qa/audit-ux-2026-11/entetes-mobiles.md`), une fois la page, son 404 et sa panne pourvus de
  leur haut. La page garde sa surcharge explicite `auTelephone="en-tete-de-page"` (Navbar **et** cale) ;
  la panne de l'API et le 404 posent `"marque"` (relevé : nav 57, `h1` « Agence introuvable » à 153).
- `EnTeteDeFiche` (variante `couverture`) : retour et partager posés sur la photo, rien d'autre.
  **Décision de la session (revue du 2026-11-09)** : la maquette FicheDBiens fait coller les onglets
  à `top-0` ; la rangée « ← Dakar Immo · partager » qui se fixait au-dessus d'eux (56 px, 185 px de
  chrome permanent avec la barre d'actions) est retirée. Onglets `sticky top-0` (`lg:top-[calc(1.5rem+53px)]`
  sous la barre du site en bureau — la formule de `NavbarSpacer`, pas une valeur figée : la contre-vérification
  a relevé à 1440 une barre de 74,6 px et des onglets à 77, soit 2 px où passaient les cartes
  (`elementFromPoint(600, 76)` → le lien d'une carte). Re-mesuré le 2026-11-09 : barre et onglets à 74,59
  à 1440 comme à 1024, `elementFromPoint` à 74,8, 76 et 78 → les onglets ; au téléphone inchangé, onglets
  0–49, recherche 49–165), **recherche collée sous eux** (`top-[49px]`, champ + pastilles +
  puces, `z-20` au-dessus du favori des lignes), dans le flux en bureau (maquette FicheDBureau).
  Partager : feuille du système, sinon copie du lien (coche + annonce `aria-live`), sinon l'échec
  est dit (bulle « Partage impossible ici : copiez l'adresse de la page. », lue).
- Relevé Chrome 390 × 844 (2026-11-09, anonyme) : aucun `<nav>` dans les 70 premiers pixels.
  **AC2, mesure corrigée (revue)** — la barre d'actions fixée en bas occupe 767 → 844 px. Vitrine
  TEMPORAIRE posée sur Saint-Louis Habitat (accroche, trois « Pourquoi nous », trois biens ; remise à
  null ensuite — l'agence 1 est utilisée par TCK-2524) : titre « La sélection de l'agence » 531 → 559,
  première carte 571 → 890, donc **196 px visibles au-dessus de la barre** sur 319 — la photo entière,
  le prix et le titre de la carte sous la barre. Défilé de 1600 : onglets à 0 (49 px), recherche
  collée de 49 à 165, aucun en-tête fixé, aucun élément d'une ligne par-dessus le champ.
- Relevé Chrome 360 × 780, `?contract_type=rent&bedrooms=2&price_max=1000000` : `scrollWidth` 360 (AC5 ;
  le carrousel de la sélection défile dans son conteneur) ; le HTML servi porte « 6 biens sur 67 » et
  15 liens de biens (AC1, rendu serveur).
- Bureau 1440 × 900 : colonne d'identité collante à 96 px, logo remonté sur la couverture par la marge
  négative de la colonne (et non du logo, qui passait sous la barre du site une fois collé).
- Bogolan de la couverture à 5 % d'opacité, écart de charte écrit dans `docs/design-guidelines.md`
  (« Couverture d'une fiche d'agence »).
- Ablations (copie → mutation → rouge → restauration, md5 identique) : total « sur M » pris avec les
  filtres de l'URL ; élargissement à 0 proposé ; délai infini affiché ; propriétaires dans l'équipe ;
  « Pourquoi nous » vide non filtré ; état sans bien supprimé ; filtres de l'URL non transmis ; barre de
  marque retirée de la panne puis du 404 ; accroche vide rendue ; sens de sortie de la couverture
  ignoré ; un seul élargissement quand l'agence n'a rien non plus ; « sur M » sans filtre ; compte
  d'élargissement qui n'est pas celui des facettes. Chacune a rougi.

Corrections de la revue du 2026-11-09 (en plus de ce qui précède) :

- `?agency[]=x` (et `agent[]`) cassait le rendu serveur (422, HTML sans bien) : un paramètre fixe
  écrase désormais toute forme du même nom, tableau compris (`requeteAvecFixes`,
  `recherche-publique.fixes.test.ts`). Relevé : `/fr/agencies/dakar-immo?agency%5B%5D=saint-louis-habitat`
  → 200, 24 liens de biens dans le HTML servi (0 avant) ; `/fr/agents/sokhna-g?agent%5B%5D=x` → 16.
- Plus de `page=1` dans l'URL d'une fiche : option `sansPageUne` de `useSearch` (la liste garde
  son comportement). Relevé : clic « À louer » sur sokhna-g → `/fr/agents/sokhna-g?contract_type=rent`.
- « Voir N biens de plus » : un test rougit si la page 2 perd le périmètre (ablation de
  `parametresFixes` dans `suite.ts` → rouge).
