---
id: TCK-955
title: "La pièce du client et de la caution se lisent en clair par une route dédiée : admin de l'agence seul, sous step-up, refusée sous impersonation, journalisée ; bouton « Afficher » sur la fiche client"
status: todo
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: [TCK-954]
blocks: [TCK-956]
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#27-guarantor-
  adr:
    - docs/adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md
    - docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [full, api, front, crm, rgpd, step-up, impersonation, journal, adr-0070, pistes]
---

## Contexte

Piste **P23.03**, troisième étape d'[ADR-0070](../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)
(§ 5, § 6 et § 8). Après TCK-953 et TCK-954, la pièce du client et de la caution ne sort que
masquée, et personne ne la relit en clair. Pour le bailleur, cette lecture existe déjà :
`GET /api/owners/{id}/sensitive` (`OwnerProfilePolicy::viewSensitive`, `ProtectedActions::STEP_UP`,
`PersonalDataAccessLogger`, surface `owner_sensitive`).

**Décision du porteur** (recopiée mot pour mot de la ligne Statut de la piste) :

> traité hors agents, en session : un ADR qui étend ADR-0044 § 1 aux pièces du locataire et de la caution (chiffrement, forme masquée par défaut, lecture sous step-up journalisée), puis ses tickets

## Objectif utilisateur

L'admin de l'agence peut lire en clair le numéro de pièce d'un client, au moment où il en a besoin.
Il passe par un second facteur récent, et chaque consultation laisse une trace. Un agent, le
bailleur et une session d'impersonation ne le peuvent pas.

## Delta à produire

- Routes :
  - `GET /api/customers/{customer}/sensitive` (`routes/api/customers.php`), qui rend `id`,
    `id_type` et `id_number` ;
  - `GET /api/guarantors/{guarantor}/sensitive` (`routes/api/guarantors.php`), qui rend `id`,
    `id_type`, `id_number` et `monthly_income` (en `float`) ;
  - toutes deux avec `whereNumber` et un nom, comme `owners.sensitive`.
- Policies :
  - `CustomerPolicy::viewSensitive` : un profil d'admin actif dans `customers.agency_id`. Un client
    sans agence n'a aucun lecteur ;
  - `GuarantorPolicy::viewSensitive` : un profil d'admin actif dans l'agence que lit `view`
    (`addedBy->agency_id`). Si cette agence est `null`, la caution n'a aucun lecteur ;
  - ni le super-admin, ni l'agent, ni le bailleur (ADR-0070 § 5).
- `ProtectedActions::STEP_UP` reçoit `CustomerController@sensitive` et `GuarantorController@sensitive`.
- `PersonalDataAccessLogger` :
  - les surfaces `SURFACE_CUSTOMER_SENSITIVE = 'customer_sensitive'` et
    `SURFACE_GUARANTOR_SENSITIVE = 'guarantor_sensitive'` ;
  - `record()` reçoit un argument `?int $agencyId = null` facultatif, transmis au résolveur (étape 1
    d'ADR-0044 § 3) ;
  - la lecture d'une caution passe l'agence que la policy a validée.
- Front, sur la fiche client :
  - un bouton « Afficher » à côté de `id_number_masked`, visible de l'admin seulement ;
  - `fetchCustomerSensitive()` dans `src/lib/queries/customers.ts`, hors de React Query, sur le
    modèle de `fetchOwnerSensitive()` ;
  - le refus `two_factor_step_up_required` passe par la garde de step-up de TCK-589 ;
  - la valeur vit le temps de l'affichage, et le bouton « Masquer » l'oublie ;
  - les textes en `fr`, `en`, et en `wo` le texte français tel quel.

## Critères d'acceptation

- [ ] **AC1** — L'admin de l'agence du client, avec un step-up récent, reçoit 200 et `id_number`
  en clair par `GET /api/customers/{id}/sensitive`. Une ligne `PersonalDataAccess` est écrite, avec
  la surface `customer_sensitive` et l'`agency_id` du client. Une seconde lecture dans les 15
  minutes n'en écrit pas de seconde.
- [ ] **AC2** — Sans step-up récent, la même requête rend 403 `two_factor_step_up_required` et
  n'écrit aucune ligne.
- [ ] **AC3** — Rendent 403, sans écrire de ligne : l'agent auteur de la fiche, le bailleur du bail
  du client, le super-admin, l'admin d'une autre agence, et toute lecture d'un client sans agence.
- [ ] **AC4** — Les mêmes cas pour `GET /api/guarantors/{id}/sensitive`. Pour l'admin, la réponse
  porte `monthly_income` en nombre. La ligne de journal porte la surface `guarantor_sensitive` et
  l'agence validée : elle n'est pas nulle, et elle est visible dans `GET /api/audit-log` de cette
  agence.
- [ ] **AC5** — Sous impersonation d'un admin d'agence, les deux routes rendent 403
  `impersonation.read_only`. `ImpersonationReadSweepTest` les balaie sans fuite tolérée.
- [ ] **AC6** — `ProtectedActionsCoverageTest` est vert avec les deux actions dans `STEP_UP`.
- [ ] **AC7** — Front : un test vitest de la fiche client montre que :
  - l'admin voit « Afficher », et un clic appelle `/api/customers/{id}/sensitive` puis affiche la
    valeur ;
  - un agent ne voit pas le bouton ;
  - un 403 de step-up ouvre la garde de TCK-589.

  `npx tsc --noEmit` et `npm run lint` sont propres.
- [ ] **AC8 — ablation** : sans l'entrée `CustomerController@sensitive` de `STEP_UP` (copie gardée,
  restaurée par `cp`, `md5` vérifié), AC2 et AC5 rougissent. Sans l'appel à `record()`, AC1
  rougit. Correctif remis : tout est vert.

## Hors périmètre

- Le revenu du bailleur dans `owners/{id}/sensitive` (TCK-956).
- Une interface de révélation pour la caution, qu'aucun écran ne lit.
- La lecture claire par la console de la plateforme (ADR-0070 § 5 l'écarte).

## Notes d'implémentation

- Mesurer, et écrire dans ce ticket, combien de clients ont `agency_id` nul et combien de cautions
  ont un auteur sans agence résolue, sur la base de dev seedée. Ces lignes n'auront aucun lecteur
  en clair (ADR-0070, Conséquences).
- `isAgencyAdminAt()` (`HasProfiles`) est ce que lit déjà `OwnerProfilePolicy::viewSensitive`.
