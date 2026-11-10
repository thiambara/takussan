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

_(à remplir par implementing-specs)_
