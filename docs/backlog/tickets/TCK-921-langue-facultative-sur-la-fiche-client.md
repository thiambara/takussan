---
id: TCK-921
title: "Une langue facultative sur la fiche client, relue pour le client sans compte"
status: done
phase: P2
family: full
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-client-sans-compte-ne-peut-rien-recevoir-dans-une-autre-langue-que-le-français--la-fiche-client-ne-porte-pas-de-langue"
tags: [back, front, crm, i18n, notifications, pistes]
---

## Contexte

Réf : **P29.03** du fichier de pistes, `validé` par le porteur (critères accordés : V4 et V7).

`customers` ne porte aucune langue. `ContactSansCompte::fromCustomer()` rend la langue du compte
lié, sinon `fr` (ADR-0032 § 3) : un locataire saisi par l'agence sans compte reçoit avis de
retard, quittances et relances en français, sans que l'agence puisse rien y changer.

## Décision du porteur

langue facultative sur la fiche client, migration et champ de formulaire

## Objectif utilisateur

L'agent indique sur la fiche d'un client la langue dans laquelle il veut recevoir ses messages,
et le client sans compte les reçoit dans cette langue.

## Contrat de données

- Colonne neuve `customers.locale` (`string(5)`, nullable), `fr` · `en` · `wo`.
- `POST /api/customers` et `PATCH /api/customers/{customer}` (existantes) acceptent `locale`
  (`nullable`, `in:fr,en,wo`) ; `null` efface la langue.
- `CustomerResource` rend `locale` ; `fields[customers]=locale` est permis.
- `ContactSansCompte::fromCustomer()` : langue du compte lié, sinon `customers.locale`, sinon
  `ContactSansCompte::DEFAULT_LOCALE`.

## Delta à produire

- [x] Migration neuve `add_locale_to_customers` (avec son `down()`).
- [x] `Customer` : `locale` dans `$fillable` et `$queryFields`.
- [x] `ValidatesCustomerContactAndCriteria` : la règle `locale`, partagée par création et mise à jour.
- [x] `CustomerResource` : `locale`.
- [x] `ContactSansCompte::fromCustomer()` : relit `locale` avant le repli `fr`.
- [x] Front : `locale` dans le schéma, le corps envoyé, les types, `DASHBOARD_CUSTOMER_DETAIL_FIELDS`
  et un champ « Langue des messages » sur `CustomerForm`, avec l'option « Par défaut (français) »
  qui l'efface.
- [x] Tests : `ContactSansCompteTest`, `CustomerTest`, `customer.test.ts`.

## Critères d'acceptation

- [x] AC1 — Fiche sans compte de langue `en` → `fromCustomer()` rend `en` ; sans langue → `fr`.
- [x] AC2 — Fiche liée à un compte `wo` et de langue `en` → `wo` : le choix du titulaire du compte
  prime sur celui de l'agence.
- [x] AC3 — `POST /api/customers` avec `locale: en` l'enregistre et la rend ; `locale: de` → 422 ;
  `PATCH` avec `locale: null` l'efface.
- [x] AC4 — Le formulaire envoie `locale` choisi, et `null` pour « Par défaut ».

## Hors périmètre

- La langue des visites planifiées par l'agent (`PropertyVisitController::planForCustomer`,
  `ContactSansCompte::fromVisit()`) : c'est le reste de P29.02, que le porteur garde.
- La spec : `docs/models-spec.md#7-customer` ne cite pas encore `locale`, à faire converger par
  `/sync-specs` (fermée à l'implémenteur).
- Aucun texte wolof neuf : les deux clés ajoutées portent en `wo` le texte français (wolof en
  pause depuis le 2026-10-16).

Hypothèses (mode sans humain) :
- la langue du compte lié prime sur celle de la fiche, comme le dit la `Piste` (« relue par
  `fromCustomer()` avant le repli `fr` ») : le titulaire a choisi la sienne ;
- le champ s'appelle `locale`, comme sur `property_visits` et `property_contact_leads`.

## Notes d'implémentation

- Avant correctif : `CustomerTest::test_la_fiche_porte_une_langue_facultative` rouge
  (`data.locale` nul après `POST` avec `locale: en`), `ContactSansCompteTest::test_la_langue_de_la_fiche_sert_le_client_sans_compte`
  rouge (colonne `customers.locale` absente) ; côté front, 4 rouges (`customer.test.ts`, 2 ;
  `CustomerForm.langue.test.tsx`, 2).
- Ablations : relecture de `locale` retirée de `fromCustomer()` → 1 rouge (`fr` au lieu de `en`) ;
  règle `locale` retirée de la validation → 1 rouge (non enregistrée) ; `locale` retiré du corps
  normalisé → 3 rouges ; champ retiré du formulaire → 1 rouge. Tout remis → verts.
- Le SMS de retard part bien en anglais pour la fiche `en` (« is 1 day overdue ») : le rendu
  suit la langue du destinataire sans autre changement.
- `default` est une option du formulaire, pas une valeur de l'API : sans elle, une langue choisie
  ne s'effaçait plus (même raison que « Indifférent » pour les critères).
