---
id: TCK-2643
title: "Créer un bail en quatre étapes, prérempli depuis le bien et les réglages de l'agence"
status: todo
phase: P2
family: full
estimate: L
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2679]
blocks: [TCK-2639]
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#30-setting-"
tags: [back, front, leases, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent qui a trouvé un locataire pour un bien crée le bail au téléphone en quatre écrans courts, sans retaper ce que l'annonce et l'agence savent déjà (loyer, caution, pénalité, commission). Il voit le total à l'entrée avant de l'envoyer à la signature.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- `StoreLeaseRequest` (`:47-70`) accepte :
  - `property_id`, `tenant_id`, `booking_id`, `guarantor_id`, `type` ;
  - les dates, `monthly_rent`, `sale_price`, `deposit_amount` ;
  - `commission_rate`, `commission_amount`, `agent_id` ;
  - `payment_frequency`, `payment_day`, `currency` ;
  - `terms`, `special_conditions`.
- Il **n'accepte pas** `late_fee_percent`, `late_fee_grace_days`, `early_termination_penalty_months` ni `rent_review_max_pct`. Ces colonnes du bail existent, mais ne s'écrivent qu'après coup, par `PATCH`.
- `CreateLeaseForm` n'envoie ni commission ni agent.
- Le bien porte `deposit_months`, `advance_months`, `agency_fee_months` et `monthly_charges` (§1.1, TCK-598). Rien ne s'en préremplit.
- Réglages d'agence à repli (`ScopedSetting`) : `lease.rent_review_max_pct` et `lease.early_termination_penalty_months` existent. **Aucun défaut de pénalité de retard** (taux, délai de grâce). `agency.commission_rate` existe.

**À produire** :

- **Back** :
  - `StoreLeaseRequest` accepte `late_fee_percent`, `late_fee_grace_days`, `early_termination_penalty_months` et `rent_review_max_pct`, avec les mêmes règles que `UpdateLeaseRequest` ;
  - nouvelle route **`GET /api/leases/defaults?property_id=`** → `LeaseDefaultsController`. Elle rend le préremplissage, et la **source** de chaque valeur (`property`, `agency` ou `platform`) :
    - `monthly_rent` : le prix du bien loué au mois ;
    - `deposit_months`, et `deposit_amount` = mois × loyer ;
    - `payment_day` ;
    - `late_fee_percent` et `late_fee_grace_days` ;
    - `commission_rate` ;
    - `early_termination_penalty_months` ;
    - `rent_review_max_pct` ;
    - `monthly_charges` : les charges mensuelles du bien (`properties.monthly_charges`), devenues un terme du bail (TCK-2679) ;
    - le total à l'entrée : loyer + charges + caution + avance + frais d'agence, d'après le coût d'entrée du bien (§1.1) ;
  - deux nouvelles clés `ScopedSetting` (catégorie `rentals`) : `lease.late_fee_percent` et `lease.late_fee_grace_days`, lues par la même chaîne agence → catalogue (cf. `spec-delta.md`).
- **Front** : création en quatre étapes sur `/app/leases/new`, entrée par `?property=`, `?customer=` et `?booking_id=`. `?booking_id=` existe déjà.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-baux&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Création — étape 3, les conditions » (téléphone et bureau) et « Création — étape 4, vérifier » (téléphone).
- **Repère d'étapes** : « 1 Bien · 2 Locataire · 3 Conditions · 4 Vérifier ».
- **Étape 1, Bien** : recherche, les biens vacants d'abord (TCK-2637). Le bien est préchoisi quand on vient de sa fiche.
- **Étape 2, Locataire** : recherche (nom, e-mail, téléphone), ou création rapide (nom et téléphone) par l'endpoint client existant.
- **Étape 3, Conditions** :
  - préremplies : loyer / mois, caution « N mois = montant » (modifiable), échéance « le N du mois », pénalité « x % après n j », commission, indemnité de départ anticipé ;
  - encadré « Réglages de l'agence appliqués — Modifier ».
- **Étape 4, Vérifier** : récapitulatif, « Total à l'entrée : … » détaillé, puis « Créer le brouillon » ou « Envoyer à la signature ».
- **Téléphone (360-390 px)** : un écran par étape, bouton « Continuer » collé en bas.
- **Bureau (≥ 1280 px)** : une page à sections numérotées à gauche, et dès `lg` une colonne droite collante avec le total à l'entrée, l'aperçu du contrat et les deux boutons.

## Contraintes strictes (métier)

- **Les charges sont un terme du bail** (décision du porteur du 2026-11-10, point 7 b ; [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 6, amendement du 2026-11-10 d'[ADR-0042](../../../adr/0042-preuve-de-consentement-a-la-signature-du-bail.md)) : l'étape « Conditions » préremplit « Charges mensuelles » depuis le bien, modifiable, et l'envoie (`monthly_charges`, TCK-2679) ; le récapitulatif et le total à l'entrée les comptent, et le contrat les imprime.
**Rien ne se perd** (audit famille 4, § 3, *Fonctions existantes* 14) :

- type de contrat (y compris la vente, avec un prix de vente et sans loyer), début, fin facultative ;
- loyer ou prix, caution, fréquence, jour du paiement ;
- conditions générales et particulières ;
- garant ;
- « Annuler » ;
- préremplissage depuis une réservation (`?booking_id=` : bien, locataire, dates, loyer — §1.4, P48.03) ;
- lien « Publier un bien » quand aucun bien n'est éligible ;
- état « sans agence » (`NoAgencyState`).

Autres contraintes :

- **Préremplir n'est pas imposer** :
  - toute valeur préremplie se modifie ;
  - le préremplissage ne réécrit jamais une valeur déjà saisie à la main ;
  - la source de chaque valeur se dit (« depuis l'annonce », « réglage de l'agence »).
- **« Envoyer à la signature »** = créer le brouillon, puis `POST /api/leases/{id}/signature-request`. Si la seconde étape échoue, le brouillon reste, et l'écran le dit.
- **Devise** : XOF seule. Pas de sélecteur à une option, mais la valeur part comme aujourd'hui.
- **Montants** : chiffres groupés selon la langue, aucune décimale en F CFA (TCK-564).
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement.

## Delta à produire

- [ ] Back : `StoreLeaseRequest` élargi. `GET /api/leases/defaults` (`LeaseDefaultsController`, policy `create` sur `Lease`). Clés `ScopedSetting` `lease.late_fee_percent` et `lease.late_fee_grace_days` au catalogue.
- [ ] Back, tests :
  - `LeaseDefaultsTest` : bien à 2 mois de caution donne caution = 2 × loyer ; défaut d'agence puis repli au catalogue ; source rendue ; appelant hors agence 403 ;
  - `StoreLeaseWithLateFeeTest`.
- [ ] Front : parcours en quatre étapes (téléphone) et en une page (bureau). Entrées `?property=`, `?customer=` et `?booking_id=`.
- [ ] Front, tests :
  - préremplissage depuis le bien ;
  - une valeur saisie n'est pas écrasée ;
  - « Envoyer à la signature » enchaîne les deux appels ;
  - réservation préremplie, comme aujourd'hui ;
  - bail de vente.

## Critères d'acceptation

- [ ] AC1 — Depuis la fiche d'un bien à 670 000 F / mois avec 2 mois de caution, l'étape 3 affiche « Caution 2 mois = 1 340 000 F » sans saisie. Le POST envoie `deposit_amount: 1340000`.
- [ ] AC2 — Une agence dont le réglage `lease.late_fee_percent` vaut 5 préremplit « 5 % ». Une agence sans réglage prend la valeur du catalogue, et l'écran dit « réglage de la plateforme ».
- [ ] AC3 — Le bail créé porte `late_fee_percent` et `late_fee_grace_days` dès le POST, sans PATCH ultérieur (vérifié au réseau et en base).
- [ ] AC4 — « Envoyer à la signature » produit, dans l'ordre, `POST /api/leases` puis `POST /api/leases/{id}/signature-request`. Le bail est `pending_signature`.
- [ ] AC5 — À 390 px, chaque étape tient son bouton « Continuer » visible sans défiler. À 1280 px, le total à l'entrée reste visible pendant la saisie.
- [ ] AC6 — `/app/leases/new?booking_id=…` préremplit encore le bien, le locataire, les dates et le loyer.

## Hors périmètre

- La création depuis la visite ou depuis la fiche client (famille 5 : l'entrée `?customer=` est prête).
- La signature elle-même, qui ne change pas.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
