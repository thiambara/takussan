---
id: TCK-2813
title: "Les cibles de section déduites à la lecture (paiements, KYC, finances, équipe) portent l'agence de leur objet, ou ne sont plus un lien"
status: todo
phase: P3
family: back
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#12-appnotification-"
tags: [back, notifications, multi-espaces, donnees-anciennes, suite-de-tck-2806, suite-de-tck-2751]
---

## Objectif utilisateur

Le membre de deux agences qui rouvre une ancienne notification de KYC, de finances ou d'équipe arrive dans l'agence
dont elle parle. S'il n'est plus membre de cette agence, la notification se lit mais n'ouvre rien.

## Contrat de données

**Origine.** Relevé d'avis-2806 (2026-11-14) : TCK-2806 a posé l'agence sur toutes les ÉMISSIONS de section de
`app/` (garde `AvisDeSectionPortentLeurAgenceTest`, AC5). La garde lit les émissions, pas la déduction à la lecture.

**Constat, relu sur HEAD (`765093279`) le 2026-11-14.**

- `NotificationTarget::forRow()` prend la cible stockée, sinon `derive()`. `derive()` et `fromReferenceable()`
  construisent quatre genres de SECTION sans agence :
  - `payments`, quand `data.lease_payment_id` (ou `referenceable` `LeasePayment`) désigne une échéance introuvable ;
  - `agency_kyc` (`referenceable` `KycDossier`) ;
  - `finances` (`referenceable` `BankStatement`) ;
  - `team` (`referenceable` `RoleDelegation`).
- `AgenceDeLaCible::porte()` laisse sortir une cible de section sans agence comme un lien simple : le lecteur ouvre
  la section de l'agence de son PROFIL ACTIF, pas celle de l'objet. C'est le défaut que TCK-1761 a fermé pour les
  émissions.
- **Surface : les lignes déjà stockées, pas les émissions.** Aucune classe de `app/` n'écrit aujourd'hui un
  `referenceable` `KycDossier`, `BankStatement` ou `RoleDelegation` (`grep -rn referenceable_type app/Notifications` :
  seul `SavedSearch`). `lease_payments.lease_id` est non nul et en cascade : la branche `payments` ne vise qu'une
  échéance supprimée.
- **Nombre de lignes concernées : non mesuré.** Il demande une lecture de la base de préproduction
  (`app_notifications` sans `target`, par `referenceable_type`), que ce ticket ne prend pas.
- `bank_statements.agency_id` et `role_delegations.agency_id` existent ; `kyc_dossiers` porte un sujet polymorphe
  (`subject_type`, `subject_id`).

## Contraintes strictes (métier)

- **Aucune cible de SECTION ne sort de `derive()` sans agence.** Quand l'objet référencé existe et porte une agence
  (directement, ou par son sujet pour le KYC d'une agence), la cible la porte, et la porte d'`AgenceDeLaCible` juge le
  lecteur comme pour une émission. Quand l'agence est introuvable (objet supprimé, échéance disparue), la ligne n'a
  pas de cible : elle se lit, elle n'ouvre rien.
- La lecture reste en un nombre borné de requêtes par page de notifications (pas une requête par ligne :
  `AgenceDeLaCible::precharger` est le modèle).
- Les lignes stockées ne sont pas reprises en base (même choix que TCK-2751 et TCK-2806).
- Les cibles d'OBJET (`lease`, `booking`…) ne changent pas.

## Delta à produire

- [ ] `NotificationTarget::derive()` / `fromReferenceable()` : la branche de chaque genre de section rend la cible
  avec l'agence de l'objet, ou `null`.
- [ ] Préchargement des agences de ces objets pour une page, à côté de celui des objets d'agence.
- [ ] Une garde : tout genre de `AgenceDeLaCible::SECTIONS` que `derive()` peut produire porte une agence ou rien.
- [ ] Tests `CiblesDeduitesDeSectionPortentLeurAgenceTest`.

## Critères d'acceptation

- [ ] AC1 — Pour chacun des quatre genres, une ligne SANS `target` (construite comme les lignes anciennes), lue par
  un membre actif de l'agence de l'objet dont le profil actif est une AUTRE agence : `GET /api/notifications` rend
  `target` = `{kind, id: null, path, agency_id: <agence de l'objet>}`, à la valeur exacte.
- [ ] AC2 — La même ligne lue par un lecteur qui n'a pas de profil actif dans cette agence : `target` est `null`.
- [ ] AC3 — Une ligne `lease_payment_id` dont l'échéance n'existe plus : `target` est `null` pour tout lecteur.
- [ ] AC4 — Une page de 20 lignes mêlant les quatre genres : le nombre de requêtes est le même qu'avec 4 lignes.
- [ ] AC5 — La garde rougit quand une branche de section de `derive()` renvoie une cible sans agence (ablation : la
  branche `finances` remise à `new self('finances', null)`).
- [ ] AC6 — Ablation : la cible de section rendue telle quelle rend AC1 et AC2 rouges.

## Hors périmètre

- La reprise des lignes stockées en base.
- Les cibles déjà stockées avec `target` (TCK-2751, TCK-2806).

## Notes d'implémentation

_(à remplir par implementing-specs)_
