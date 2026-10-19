---
id: TCK-953
title: "Le numéro de pièce du client est chiffré en base et ne sort plus que masqué : migration réversible, `id_number_masked`, hors des sparse fieldsets, et le contrat minimal du front"
status: todo
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: [TCK-954]
spec_refs:
  features:
    - docs/features.md#16-crm--relation-client
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#7-customer
  adr:
    - docs/adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md
    - docs/adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads
tags: [full, api, front, crm, rgpd, chiffrement, migration, impersonation, adr-0070, pistes]
---

## Contexte

Piste **P23.03**, première étape de l'application d'[ADR-0070](../../adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)
(§ 1 à 4, § 6, § 8 et § 9 pour `customers.id_number`).

**Décision du porteur** (recopiée mot pour mot de la ligne Statut de la piste) :

> traité hors agents, en session : un ADR qui étend ADR-0044 § 1 aux pièces du locataire et de la caution (chiffrement, forme masquée par défaut, lecture sous step-up journalisée), puis ses tickets

Relevé du 2026-10-18 (`ab982dbcc`) :

- `customers.id_number` est un `varchar(255)` en clair, sans cast
  (`2026_04_17_160006_create_customers_table.php:21`).
- `CustomerResource` le rend en clair au lecteur de la fiche (l. 31-32), donc aussi par
  `LeaseResource` (`tenant`) et `BookingResource` (`customer`).
- `fields[customers]=id,id_number` le demande, parce qu'il est dans `Customer::$queryFields`
  (l. 108).
- `ImpersonationReadSweepTest::FUITES_TOLEREES` le déclare fuir sous impersonation par six routes.

Ce ticket livre l'API et le front **dans la même PR**. Sinon, la fiche client du front, qui demande
`fields[customers]=…,id_number` (`DASHBOARD_CUSTOMER_DETAIL_FIELDS`), rendrait 400 (ADR-0070 § 8).

## Objectif utilisateur

Le numéro de pièce d'un client n'est plus lisible dans la base, dans une sauvegarde ni dans une
réponse de l'API. L'équipe voit qu'un numéro est saisi (`•••• 8877`) et peut toujours modifier la
fiche.

## Delta à produire

- Migration `encrypt_id_number_on_customers`, sur la forme de
  `2026_10_08_601100_encrypt_sensitive_columns_on_owner_profiles.php` :
  - `up()` : passage en `text`, puis chiffrement par lots de 500, idempotent ;
  - `down()` : déchiffrement, puis retour en `varchar(255)`.
- `Customer` :
  - `SENSITIVE = ['id_number']`, avec `$hidden = self::SENSITIVE` ;
  - cast `'id_number' => 'encrypted'` (le cast simple, jamais une classe maison : ADR-0070 § 3) ;
  - `id_number` sort de `$queryFields`.
- `CustomerResource` : `id_number_masked` (`Masking::tail()`) remplace `id_number`, sous la même
  condition `readsCustomer` (TCK-808). `RESERVES` est mis à jour.
- `CustomerController` : `show`, `store` et `update` chargent `id_number` pour calculer le masque,
  même sous `fields[customers]`.
- `Store`/`UpdateCustomerRequest` : `id_number` reçoit `max:100`.
- `PropertyRedactor::IDENTIFIER_SEGMENTS` reconnaît `id_number`.
- `ImpersonationReadSweepTest` : les six entrées P23.03 sortent de `FUITES_TOLEREES`.
- `CustomerScopeTest` : les assertions qui lisent `id_number` en clair pour l'agent lisent désormais
  `id_number_masked`.
- `BackupVerifyEncryptionTest` : un cas avec une fiche client qui porte une pièce.
- Front :
  - `DASHBOARD_CUSTOMER_DETAIL_FIELDS` retire `id_number` ;
  - `CustomerDetail` lit `id_number_masked: string | null` ;
  - `CustomerForm` : le champ est vide par défaut, avec le masque en indication, et une valeur vide
    veut dire « inchangé » ;
  - `customerFormSchema` : la règle `id_type ⇒ id_number` ne s'applique que si la fiche n'a pas
    encore de numéro ;
  - les textes neufs en `fr`, `en`, et en `wo` le texte français tel quel.

## Critères d'acceptation

- [ ] **AC1** — L'aller-retour de la migration est testé :
  - sur une ligne en clair `SN-998877`, `up()` écrit une valeur différente, que `Crypt::decryptString` rend `SN-998877` ;
  - un second `up()` ne change pas la ligne ;
  - `down()` rend `SN-998877` et une colonne `character varying(255)` (lu dans `information_schema.columns`).
- [ ] **AC2** — Aucune réponse par défaut ne porte la clé `id_number` : `GET /api/customers`,
  `GET /api/customers/{id}`, `GET /api/leases/{id}`, `GET /api/leases?include=tenant` et
  `GET /api/bookings/{id}`. La fiche lue par l'agent auteur porte `id_number_masked = "•••• 8877"`.
- [ ] **AC3** — `GET /api/customers?fields[customers]=id,id_number` et
  `GET /api/leases?include=tenant&fields[customers]=id,id_number` rendent 400.
- [ ] **AC4** — Le bailleur ne reçoit ni `id_number` ni `id_number_masked`, par le bail ni par la
  réservation (la garantie de TCK-808 tient).
- [ ] **AC5** — `PUT /api/customers/{id}` sans `id_number` laisse le numéro chiffré inchangé. Avec
  `id_number` de 101 caractères, il rend 422.
- [ ] **AC6** — `ImpersonationReadSweepTest` est vert avec les six entrées P23.03 retirées de
  `FUITES_TOLEREES`.
- [ ] **AC7** — `php artisan backup:verify-encryption` imprime `customers.id_number : 1 lue(s), 0 illisible(s)`.
- [ ] **AC8** — Front : `npx vitest run` sur les tests du formulaire client montre qu'une fiche qui
  porte `id_type` et `id_number_masked`, sans `id_number`, s'enregistre sans erreur de validation et
  n'envoie pas `id_number`. Une fiche avec un type et sans numéro du tout est encore refusée.
  `npx tsc --noEmit` et `npm run lint` sont propres.
- [ ] **AC9 — ablation** : sans le cast `encrypted` (copie gardée, restaurée par `cp`, `md5`
  vérifié), AC1 rougit (la valeur relue n'est pas déchiffrable) et AC7 aussi (la ligne
  `customers.id_number` disparaît). Sans `$hidden`, AC2 rougit. Correctif remis : tout est vert.

## Hors périmètre

- La caution (TCK-954) et le revenu du bailleur (TCK-956).
- La lecture claire `GET /api/customers/{id}/sensitive` et le bouton « Afficher » (TCK-955). Entre
  ce ticket et TCK-955, personne ne relit la valeur claire d'un client par l'API. C'est attendu.
- Une recherche par numéro de pièce, ou une empreinte HMAC (ADR-0070 § 4).

## Notes d'implémentation

- Les listes et les formes imbriquées ne rendent le masque que si elles lisent toutes les colonnes
  (ADR-0070 § 3). La liste du CRM du front ne doit déchiffrer aucune ligne : `CustomerIndexQueryBudgetTest`
  doit rester vert.
- `readsCustomer()` juge les champs réservés par `getAttributes()`. Un attribut chiffré y figure
  toujours sous sa clé `id_number` : la logique de TCK-808 ne change pas.
- Une écriture brute sur la colonne doit poser une valeur chiffrée ou `null`. Relire les tests qui
  remplissent `customers` par `DB::table()` (`grep -rn "table('customers')" tests`).
