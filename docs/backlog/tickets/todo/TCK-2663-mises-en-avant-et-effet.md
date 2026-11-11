---
id: TCK-2663
title: "Crédits, côté API : les mises en avant de l'espace, ce qu'elles ont rapporté, et les biens à pousser"
status: todo
phase: P1
family: back
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2664]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#93-propertyboost-"
    - "docs/models-spec.md#94-propertyboostdailystat-"
tags: [back, credits, boost, adr-0061, audit-ux, app]
---

## Objectif utilisateur

L'agence voit quelles annonces sont mises en avant en ce moment, ce que chacune lui a rapporté (vues, contacts, visites), et quels biens mériteraient de l'être.

## Contrat de données

Re-mesuré sur `dev` le 2026-11-10 :

- `GET /api/credits` : solde, lots, mouvements (dont `boost {id, kind, variant, property {id, title}}`). `GET /api/properties/{property}/boosts` : les boosts **d'un** bien. **Aucune liste des boosts de l'espace**.
- `property_boost_daily_stats` compte impressions et clics par jour et par boost, mais n'est servi qu'au super-admin, en total plateforme (`AdminBoostStatsController`).
- Contacts : `PropertyContactLead` (demandes de contact sur un bien, datées) ; visites : `PropertyVisit`. Vues : `properties.views_count`, **cumul sans série par jour**.
- Aucun calcul de « biens sans contact depuis 30 jours ».
- `features.md` § 1.12 annonce une page Crédits « (solde, lots, historique, **boosts**) ».

## Contraintes strictes (métier)

- Autorisation : celle de `GET /api/credits` (`CreditLotPolicy::viewAny`, capacité `boost.spend` sur l'agence active). Jamais un boost, un contact ou une visite d'une autre agence.
- Les mesures d'un boost sont prises **dans sa fenêtre** : de `starts_at` à `ended_at` (ou maintenant s'il court).
- Aucune comparaison « × la semaine d'avant » : aucune série de vues par jour n'existe hors des boosts ; l'API ne l'invente pas.
- Les contacts et visites sont des **comptes** : aucune donnée personnelle du demandeur ne sort.

## Delta à produire

- [ ] `GET /api/credits/boosts` → `CreditBoostController::index` : `filter[status]=active|ended` (défaut : en cours, et terminés depuis 30 jours), pagination ; par boost : `id`, `kind`, `variant`, `price_credits`, `starts_at`, `ends_at`, `ended_at`, `property {id, title, main_photo_url, quarter}`, `measures {impressions, clicks, contacts, visits}`.
- [ ] `GET /api/credits/suggestions` → biens publiés de l'agence sans demande de contact depuis 30 jours et sans boost en cours, du moins vu au plus vu (`views_count`), `limit` ≤ 10, et `meta.total`.
- [ ] Ressource `CreditBoostResource` ; mesures calculées en une requête agrégée par mesure (pas de N+1 : vérifié par le compte de requêtes du test).
- [ ] Tests : `CreditsBoostsListTest`, `CreditsSuggestionsTest`.

## Critères d'acceptation

- [ ] AC1 — Pour un boost du 5 au 12 novembre, deux demandes de contact (le 6 et le 14) donnent `contacts = 1` ; les impressions égalent la somme des `property_boost_daily_stats` du boost.
- [ ] AC2 — Un boost d'une autre agence n'apparaît jamais, même filtré par son id.
- [ ] AC3 — Un membre sans `boost.spend` reçoit 403.
- [ ] AC4 — Un bien contacté il y a dix jours et un bien en Vedette en cours sont exclus des suggestions ; un bien publié jamais contacté y figure.
- [ ] AC5 — La liste de 20 boosts se sert en un nombre de requêtes SQL qui ne dépend pas du nombre de boosts.

## Hors périmètre

- L'achat de crédits (phase 2 d'ADR-0061).
- Le « rapport de mise en avant » détaillé par boost (vues avant / pendant) : il demande une série de vues par jour qui n'existe pas.
- L'écran (TCK-2664).

## Notes d'implémentation

**Prémisse re-mesurée (2026-11-11)** — conforme au « Contrat de données » : ni liste des boosts de
l'espace, ni mesure par boost hors de `AdminBoostStatsController`, ni calcul des biens sans contact.
Deux précisions que le contrat ne disait pas : `property_contact_leads` porte aussi les **clics**
WhatsApp et Appeler (`channel` `whatsapp`/`call`, sans identité, TCK-590) ; une **Remontée** naît close
(`starts_at = ended_at`, `BoostPurchaseService::bump`).

**Choix faits ici :**

- **Contacts = tous les canaux** (formulaire, WhatsApp, appel), pour la mesure **et** pour « sans
  contact depuis 30 jours » — une seule définition. Le contrat dit « demandes de contact » en
  nommant `PropertyContactLead` ; la boîte « à traiter » (`aTraiter()`) ne retient, elle, que le
  formulaire. Si l'écran veut les seules demandes écrites, c'est un `channel = form` à poser aux deux
  endroits (`BoostMeasures`, `BoostSuggestions`).
- **Visites = demandées dans la fenêtre** (`property_visits.created_at`), tous statuts, annulées
  comprises : ce que la mise en avant a suscité, daté comme les contacts. Pas `scheduled_at`.
- **Fenêtre** : `starts_at` ≤ `created_at` ≤ `COALESCE(ended_at, maintenant)`, bornes incluses. Une
  pause n'est pas retranchée. Une Remontée a une fenêtre d'un instant : ses contacts et visites valent
  0, et l'API n'invente pas de fenêtre. Impressions et clics : la somme de **tous** les
  `property_boost_daily_stats` du boost (déjà comptés par boost).
- **Isolation** : les boosts sont bornés à `agency_id` de l'espace actif ; `filter[id]` ne fait que
  restreindre. Les contacts exigent en plus `lead.agency_id = boost.agency_id` (un bien qui a changé
  d'agence ne compte pas les demandes reçues par l'autre). `property_visits` n'a pas d'`agency_id` :
  les visites sont celles du bien.
- **`filter[status]`** : `active` = `BoostStatus::live()` (en cours **et en pause**) ; `ended` =
  terminé, annulé ou remboursé, sans limite d'âge ; absent = en cours + terminés depuis 30 jours
  (`ended_at`). Toute autre valeur → 422. Tri fixe : en cours d'abord (le plus récent en tête), puis le
  plus récemment terminé. `per_page` ≤ 50. La ligne porte aussi `status` (pour distinguer la pause).
- **Suggestions** : `Property::public()` — le prédicat même que l'achat exige
  (`boost.property_not_public`) — de l'espace, sans contact depuis 30 jours, sans boost `live()` (Badge
  compris), tri `views_count` puis `id` ; `meta.total` compté avant la borne ; `limit` 1 à 10, défaut
  10. Chaque bien porte aussi `views_count` et `last_contact_at` (`null` : jamais contacté).
- **Photo** : `PublicPhotoUrl::upTo(…, 'preview', filigrane)`, jamais l'original. `quarter` =
  `address.neighborhood`.
- **Autorisation** : `IndexCreditBoostsRequest` et `CreditSuggestionsRequest` délèguent à
  `CreditLotPolicy::viewAny` (trait `AuthorizesWalletReading`) : 403 avant 422. L'espace actif est lu
  par `App\Services\Credits\WalletSpace`, et le contrôle « espace + autorisation » de
  `CreditController` est passé dans le trait `ReadsWallet`, partagé par les deux contrôleurs (aucun
  changement de comportement de `GET /api/credits` : `CreditsApiTest`, `CreditBalanceEndpointTest`
  verts).
- **Mesures** : `BoostMeasures`, une requête par mesure (stats, contacts, visites), posées sur le boost
  comme un `withCount` (`measures`) — le registre `Tests\Support\ResourceInventory` instancie chaque
  ressource avec un seul argument. Les deux ressources y sont inscrites (`MODELES_EXPLICITES`).

**Vérification par ablation** (23) : chaque règle retirée rougit son test — bornes basse et haute de
la fenêtre, jointure par bien, agence des contacts, somme des stats, agence des boosts, `filter[id]`,
les trois branches de `filter[status]` et la liste blanche de la requête, le tri « en cours d'abord »,
la pose des mesures sur le boost, le préchargement (AC5 : 2 boosts et 20 boosts, chacun avec photo, adresse, stats, contact et visite,
même nombre de requêtes), l'autorisation des deux requêtes ; côté suggestions : contact récent
(retiré, et rendu toujours vrai), boost en cours, `public()`, agence, tri, total avant la borne,
`limit` ≤ 10. Le tri « en cours d'abord » ne rougissait pas d'abord (le jeu de test le satisfaisait par
`starts_at`) : une pause commencée avant les terminés le départage désormais.

`docs/models-spec.md` et `docs/features.md` ne sont pas touchés (compétence) : les deux routes sont
pour `/sync-specs` (§ 1.12, § 9.3-9.4).
