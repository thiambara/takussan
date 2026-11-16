---
id: TCK-2905
title: "API — liste des biens : le filtre par bailleur jusqu'au bailleur invité, et les chiffres d'une annonce sur 30 jours (vues, contacts, visites)"
status: done
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2908, TCK-2923]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#3-property"
tags: [back, biens, annonces, filtres, statistiques, audit-ux, app]
---

## Objectif utilisateur

L'agence retrouve d'un filtre les biens d'un bailleur, et juge une annonce sur ce qu'elle a rapporté le mois passé : « 312 vues · 9 contacts · 3 visites (30 j) ».

## Contrat de données

Constat (vérifié à l'écriture) :

- Le bailleur d'un bien est le compte `user_id` (`Property::owner()`, `Property.php:1245`), et `filter[user_id]` existe déjà (`$requestFilterable`, `Property.php:152-156`) : « Tous les bailleurs » se branche dessus **sans endpoint neuf** pour un bailleur qui a un compte. Seul manque le bailleur **invité, sans compte** (`pending_owner_profile_id`, TCK-1000), qu'aucun filtre n'atteint. Fiche `TCK-2638.json` a-0-bureau (« suivi en ticket à part si le porteur le veut » — aucun ticket).
- `PropertyResource` sert `views_count` et `favorites_count`, **totaux cumulés** sur la ligne du bien (`PropertyResource.php:163-164`). `visits` est comptable (`$requestCountable`) mais jamais rendu ; aucun compte de contacts ; **aucune fenêtre de 30 jours** et aucune statistique quotidienne des vues d'un bien (seul `PropertyBoostDailyStat` existe, pour les boosts).

Audit (`audit-f4-patrimoine.md`, app-biens **e0** bureau : filtre par bailleur ; **e1** : « vues · favoris » au lieu de « vues · contacts · visites (30 j) »).

À servir :

1. `filter[owner_profile_id]` sur la liste des biens : les biens dont le bailleur est ce profil, qu'il ait un compte (`user_id`) ou qu'il soit invité (`pending_owner_profile_id`) — un seul filtre pour la liste déroulante, alimentée par `/api/owners`.
2. Sur la liste en mode Annonces : `stats_30d { views, contacts, visits }` par bien — vues des 30 derniers jours, demandes de contact reçues (`PropertyContactLead` et contacts équivalents), visites planifiées ou faites.

## Contraintes strictes (métier)

- `owner_profile_id` borné à l'agence du profil actif : un bailleur d'une autre agence ne filtre rien (liste vide, jamais d'erreur qui dirait qu'il existe).
- Les vues sur 30 jours demandent une **source quotidienne** : table `property_daily_views` (bien, jour, compte), écrite là où `views_count` s'incrémente aujourd'hui, sans requête de plus au rendu public. Pas d'adresse IP ni d'identifiant de visiteur stocké.
- Chiffres sur 30 jours calculés en un nombre constant de requêtes pour une page de liste (pas une requête par bien).
- Sparse fieldsets : `stats_30d` ne se calcule que s'il est demandé (`fields[properties]` ou `append`), jamais sur la liste publique.

## Delta à produire

- [ ] **Écrire l'ADR** (numéro suivant libre) : la table quotidienne des vues d'un bien — modèle de données neuf (règle 5 du lot).
- [ ] Filtre `owner_profile_id` sur `Property` (custom filter : `user_id` du profil OU `pending_owner_profile_id`) ; test d'isolation.
- [ ] Migration `create_property_daily_views_table` ; écriture au même point que `views_count` ; purge au-delà de 400 jours (commande planifiée).
- [ ] `stats_30d` dans `PropertyResource` (liste agence), agrégé pour la page.
- [ ] `docs/models-spec.md` : la table neuve (ou laisser à /sync-specs).
- [ ] Tests : `PropertyOwnerFilterTest`, `PropertyStats30dTest` (vue du jour 31 exclue, contact et visite comptés, compte de requêtes constant), `PropertyDailyViewsWriteTest`.

## Critères d'acceptation

- [ ] AC1 — `GET /api/properties?filter[owner_profile_id]={id}` rend les biens de ce bailleur, y compris un bien saisi pour lui alors qu'il était invité sans compte ; avec le profil d'un bailleur d'une autre agence, la liste est vide (200).
- [ ] AC2 — Un bien vu 5 fois aujourd'hui et 7 fois il y a 31 jours rend `stats_30d.views = 5`.
- [ ] AC3 — Un bien avec 2 demandes de contact et 1 visite dans les 30 jours, et 1 contact plus ancien, rend `contacts = 2`, `visits = 1`.
- [ ] AC4 — La liste de 20 biens avec `stats_30d` s'obtient en un nombre de requêtes indépendant du nombre de biens.
- [ ] AC5 — La liste publique des biens ne rend pas `stats_30d`.

## Hors périmètre

- La visibilité « Réseau » (TCK-2907).
- L'écran (TCK-2908).

## Notes d'implémentation

2026-11-15 — implémenté (agent délégué, worktree `feat/audit-manques-2026-11-15`).

- **ADR-0117** (`docs/adr/0117-les-vues-d-un-bien-se-comptent-par-jour.md`) : la table `property_daily_views`.
- **Écart au contrat : `include=stats30d`, et non `fields[properties]` ni `append`.** ADR-0021 écarte le champ
  calculé derrière les sparse fieldsets ; la voie établie est l'inclusion calculée lue par le contrôleur
  (`include=online`, `occupancy`, `offlineReasons`, ADR-0097 § 1). TCK-2908 demande donc
  `GET /api/properties?include=stats30d` et lit `stats_30d { views, contacts, visits }`.
- **Définitions retenues** (une seule fenêtre : depuis le début du jour J-29, aujourd'hui compris) :
  `views` = somme de `property_daily_views` ; `contacts` = pistes `property_contact_leads` du bien (formulaire,
  WhatsApp, appel — la définition de `RadarActivationReminders`) + fils `conversations` de type `direct` ouverts
  sur le bien par un autre que son titulaire (le « contact équivalent » : `contact-message` ne crée pas de piste),
  supprimés compris ; `visits` = visites créées OU terminées dans la fenêtre, hors `cancelled` (`no_show` compte :
  elle était planifiée).
- **`filter[owner_profile_id]`** : `pending_owner_profile_id = profil` OU (`user_id` du profil ET `agency_id` du
  profil) — la borne d'agence empêche un bailleur à deux agences de fuir d'une liste à l'autre ; un profil invité
  (`user_id` nul) n'ajoute pas de branche `user_id IS NULL`. Lisible : super-admin, personnel de l'agence du
  profil (`staffAgencyId`), ou le bailleur lui-même ; sinon liste vide (200).
- Écriture : `PropertyViewCounter::record()`, après le limiteur, upsert atomique `ON CONFLICT (property_id, day)`.
  Purge : `properties:purge-daily-views`, chaque nuit à 04:20 (Dakar), > 400 jours.
- Tests : `PropertyOwnerFilterTest` (4), `PropertyStats30dTest` (7), `PropertyDailyViewsWriteTest` (4) — 15 verts ;
  9 ablations une à une, toutes rouges, restaurées au md5. Gardes : 3 classes d'architecture,
  `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`, `DateInventoryByValueTest`,
  `PublicPropertyViewCounterTest`, `PropertyOnlineFlagTest`, `PropertyIndexQueryBudgetTest` verts ;
  `scripts/check-*.mjs` tous verts.
- Docs : `docs/models-spec.md` (§ 129 PropertyDailyView), `docs/spatie-query-builder.md` (filtre et inclusion).
- Fils directs portant un bien : seul `PropertyConversationResolver` (le `contact-message` du prospect) en crée ;
  `POST /api/conversations` en direct n'en porte jamais (TCK-888). L'exclusion du titulaire est un filet.
- Docblock périmé corrigé : `RadarActivationReminders` (« aucune vue n'est datée »).
- Écart non corrigé (fichier tenu par TCK-2910) : `OwnerDirectory::addListColumns` compte `properties_count` par
  `user_id` + `agency_id` seulement — un bailleur invité y vaut 0 bien alors que `filter[owner_profile_id]` lui rend
  ses biens saisis (`pending_owner_profile_id`). À aligner dans `OwnerDirectory`.
