---
id: TCK-2508
title: Page Favoris « Le suivi » : ce qui a changé, recherches suivies au même endroit, sélection partagée
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: [TCK-2507, TCK-2496]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, favoris, mobile, audit-ux]
---

## Objectif utilisateur

Revenir sur ses favoris et voir tout de suite ce qui a bougé (prix en baisse, bien loué), agir (Visiter, WhatsApp), retrouver ses recherches suivies avec leurs nouveautés, et envoyer sa sélection à un proche sur WhatsApp. Anonyme, comprendre qu'un numéro suffit pour ne pas la perdre.

## Contrat de données

- Connecté : `GET /api/favorites` (avec `price_change`, TCK-2507) et `GET /api/saved-searches` (avec `last_viewed_at`) ; nouveautés par recherche : liste publique `published_after` (paramètre plat de `/api/public/properties/search`, TCK-2496) + `per_page=1`, `meta.total` (TCK-2496) ; ouvrir une recherche appelle `POST /api/saved-searches/{id}/viewed`.
- Anonyme : le magasin local des favoris garde, en plus de l'id, **le prix vu à l'ajout** ; l'écart se calcule contre le prix relu par `GET /api/public/properties/by-ids`.
- **Sélection partagée sans objet neuf côté API** : un lien `/[locale]/favorites/partage?ids=1,2,3` (au plus la borne de `by-ids`), lu par `by-ids` ; un id devenu non public disparaît en silence de la vue partagée. Page en lecture seule, `noindex`. Décision de ce ticket : le lien est un instantané des biens, pas une liste vivante — écart assumé par rapport à la note de la maquette, qui évoquait un objet API.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=favoris&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — tous ses écrans, téléphone et bureau.
- Deux onglets en tête, « Biens » et « Recherches » ; chaque carte de bien : prix d'abord, puis la pastille de changement (« −50 000 F depuis l'ajout », « Loué ») et les gestes Visiter et WhatsApp (décisions 3a, 4a de l'audit).
- Un favori loué ou retiré reste visible, éteint, avec sa raison, « Biens proches » et « Retirer ».
- Anonyme : une carte (pas une barrière) propose de garder ses favoris partout avec son numéro.
- « Partager la sélection » : feuille de partage du téléphone (`navigator.share`), WhatsApp en tête ; copie du lien à défaut.
- Cœur plein terracotta (`--primary`), plus de rouge vif ; tutoiement (découverte).

## Contraintes strictes (métier)

- Rien de ce que la page fait aujourd'hui ne se perd : pagination, note personnelle, état « plus disponible », versement des favoris de l'appareil au compte à la connexion, alerte sans compte (`PublicSearchAlertForm`).
- Un favori ne s'ajoute que sur un bien public (règle TCK-599 inchangée).
- La vue partagée n'expose rien du propriétaire de la sélection (ni nom, ni note).
- Le popover de favoris de bureau ne s'ouvre plus au téléphone (l'onglet Favoris de TCK-2493 le remplace).

## Delta à produire

- [ ] Page Favoris en deux onglets, cartes « suivi » (écart de prix, état, gestes).
- [ ] Onglet Recherches : chaque recherche sauvegardée avec ses biens nouveaux, ouverture qui marque « vue ».
- [ ] Magasin local : prix à l'ajout pour l'anonyme.
- [ ] Carte de compte pour l'anonyme.
- [ ] Partage de la sélection + page partagée en lecture seule.
- [ ] Clés i18n `fr`/`en`/`wo` (wolof en pause : texte français en `wo`).
- [ ] Tests (rendu des états, calcul de l'écart, lien partagé, absence de note dans la vue partagée).

## Critères d'acceptation

- [ ] AC1 — Un favori dont `price_change = -50000` affiche « −50 000 F » ; `price_change: null` n'affiche aucune pastille (pas « 0 F »).
- [ ] AC2 — Une recherche dont trois biens ont été publiés après `last_viewed_at` affiche « 3 nouveaux » ; après l'avoir ouverte puis être revenu, le compte repart de zéro.
- [ ] AC3 — Le lien partagé ouvert dans une session privée montre les mêmes biens publics, sans note ni nom ; un bien devenu loué n'y figure plus.
- [ ] AC4 — Anonyme, un favori ajouté à 300 000 dont le prix relu est 250 000 affiche l'écart.
- [ ] AC5 — À 360 px, aucune carte ne fait défiler la page horizontalement.

## Hors périmètre

- La barre d'onglets et l'onglet Favoris (TCK-2493).
- Une sélection partagée modifiable à plusieurs.

## Notes d'implémentation

- **(Revue de TCK-2507, 2026-11-09) Les favoris de l'appareil versés au compte à la connexion prennent le prix de la
  connexion.** `favoritesStore.ts` POSTe les identifiants locaux sur `/api/favorites` au login : `FavoriteObserver`
  leur pose `price_at_favorite` au prix de CET instant. Pour eux, « −X F depuis l'ajout » veut donc dire « depuis
  l'enregistrement dans le compte ». Le libellé (ou le suivi gardé côté navigateur) doit en tenir compte.
- `price_change` est `null` pour un favori posé sur un bien qui n'était PAS public à l'ajout (brouillon, bien privé) :
  aucun écart ne s'affiche, même une fois le bien publié (décision de la session, TCK-2507).

**Prémisses re-mesurées le 2026-11-09 (agent favoris, vague 2) :**

- ✗ Route `/[locale]/favorites/partage` : les routes publiques sont en anglais (consigne de la vague) → **`/[locale]/favorites/shared?ids=…`**.
- ✗ « tutoiement (découverte) » : le site vouvoie (consigne de la vague, décision 17 de la vague 1) → textes au vouvoiement.
- ✗ Geste WhatsApp par carte : ni `GET /api/favorites` ni `GET /api/public/properties/by-ids` n'émettent
  `primary_contact` (`PropertyResource` ne le rend que sur la fiche ou `properties.index` — `$contactRendu`) : la page ne
  sait donc pas si le contact a WhatsApp. Le geste révèle les numéros au clic (`GET /public/properties/{slug}/contact`,
  comme `WhatsAppButton`) et, sans numéro WhatsApp, le dit par un toast et propose la fiche.
- ✓ Le popover de favoris est déjà rendu dans `hidden lg:flex` de la `Navbar` (TCK-2494) : il ne s'ouvre plus au téléphone,
  rien à faire.
- Anonyme : `by-ids` écarte en silence tout bien non public (loué, vendu, retiré…) sans dire pourquoi. La carte éteinte
  « Loué » ne peut donc exister que pour le connecté (`availability` de `/api/favorites`) ; l'anonyme garde la purge
  d'aujourd'hui. « Loué le 2 nov. » de la maquette : aucune date de sortie n'est émise → « Loué » seul.
- `by-ids` est borné à 20 identifiants (`BY_IDS_MAX_IDS`) : le lien partagé porte au plus 20 biens.

**Décisions d'implémentation (2026-11-09) :**

- Le prix de référence de l'anonyme vit dans une clé locale neuve, `takussan.favorites.prix` (`{id: prix}`), posée au
  geste du cœur (le prix de la carte, ou relu par `by-ids` — donc seulement pour un bien public), jamais réécrite tant
  que le favori existe, effacée avec lui. **Il ne sert qu'à l'anonyme** (décision de la revue) : pour le connecté,
  `price_change` de l'API (`price_at_favorite`) fait foi, y compris pour un favori versé depuis l'appareil à la
  connexion — un même favori montre ainsi le même écart sur tous les appareils du compte.
- Pas de rattrapage du prix de référence : un favori posé avant ce ticket, une entrée locale illisible ou un ajout fait
  sans prix connu n'affichent jamais d'écart. Assumé : le prix de la première visite de la page n'est pas le prix de
  l'ajout, et l'écart qu'il produirait mentirait.
- Les vignettes des biens nouveaux se trient par `created_desc` alors que le compte filtre sur `published_at`
  (`published_after`) : l'API n'offre aucun tri par publication (`relevance`, `price_*`, `created_desc`, `distance`).
  Un bien republié récemment mais créé il y a longtemps compte bien parmi les nouveaux, mais ses vignettes peuvent passer
  après d'autres. Laissé tel quel (décision de la revue).
- « Biens proches » de la carte éteinte : l'API ne décrit plus un bien sorti du public (TCK-599, `{id, slug, title}`),
  et ne doit pas le faire. Les filtres viennent donc de ce que l'appareil a VU du bien quand il était public — clé
  locale `takussan.favorites.facettes` (paires `[id, {city, quarter, type, contract_type}]`, 200 au plus, effacée à la
  déconnexion). Sans facettes connues (autre appareil, bien jamais vu public ici), la liste sans filtre.
- Ouvrir une recherche navigue tout de suite ; `POST …/viewed` part en arrière-plan (`fetch` `keepalive`), y compris
  pour un nouvel onglet (Ctrl, Cmd, Maj, clic du milieu ; pas le clic droit).
- Un jeton présent sans utilisateur résolu (`/me` lent au rendu de la mise en page racine) : attente neutre et une
  relecture de `/me`, puis une erreur avec « Réessayer » si le compte ne répond toujours pas — jamais la page de
  l'anonyme.
- « Prévenez-moi quand un bien comme ceux-ci arrive à {quartier} » (anonyme) : `PublicSearchAlertForm` tel quel, dans une
  feuille ; le quartier le plus représenté de la sélection (à égalité, celui du plus récent), la ville à défaut, et la
  transaction quand elle est commune.
- Comparer : la bascule reste sur chaque carte. Un bouton « Comparer » d'en-tête écraserait la sélection du comparateur.
- Les vignettes des biens nouveaux d'une recherche lisent `per_page=3` (et non 1) : la même requête donne le compte
  (`meta.total`) et les trois vignettes.
- Pagination maison sur la page publique : `Pagination` de la console lit `console.pagination`, un espace que la coque
  publique ne sert pas. Pour la même raison, `FavoriteNote` (et la normalisation d'un favori) et le résumé des critères
  (`resume-de-criteres.ts`) sont sortis de `FavoritesList` et `SavedSearchesList` : les importer aurait fait entrer la
  console dans la frontière i18n et le périmètre de contraste publics.
- La page `/app/favorites` de la console garde `FavoritesList`.
