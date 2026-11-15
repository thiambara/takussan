---
id: TCK-2813
title: "Les cibles de section déduites à la lecture (paiements, KYC, finances, équipe) portent l'agence de leur objet, ou ne sont plus un lien"
status: done
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

- [x] `NotificationTarget::derive()` / `fromReferenceable()` *(décision (b) : `null`)* : la branche de chaque genre de section rend la cible
  avec l'agence de l'objet, ou `null`.
- [ ] ~~Préchargement des agences~~ *(sans objet après la décision (b))* Préchargement des agences de ces objets pour une page, à côté de celui des objets d'agence.
- [x] Une garde : tout genre de `AgenceDeLaCible::SECTIONS` que `derive()` peut produire porte une agence ou rien.
- [x] Tests `CiblesDeduitesDeSectionPortentLeurAgenceTest`, et côté front `NotificationRow.section-sans-agence.tck-2813.test.tsx` (ligne ancienne sans cible : lue, ni lien, ni verbe, ni chevron).

## Critères d'acceptation

- [x] AC1 — *(relu par la décision (b) : `target` = `null`, membre sous le profil de B comme sous celui de A ; `CiblesDeduitesDeSectionPortentLeurAgenceTest`::test_les_quatre_lignes_anciennes…)* — Pour chacun des quatre genres, une ligne SANS `target` (construite comme les lignes anciennes), lue par
  un membre actif de l'agence de l'objet dont le profil actif est une AUTRE agence : `GET /api/notifications` rend
  `target` = `{kind, id: null, path, agency_id: <agence de l'objet>}`, à la valeur exacte.
- [x] AC2 — *(même test, lecteur sans profil dans l'agence)* — La même ligne lue par un lecteur qui n'a pas de profil actif dans cette agence : `target` est `null`.
- [x] AC3 — *(`test_une_echeance_disparue…` ; et `data.lease_payment_id` disparu dans AC1)* — Une ligne `lease_payment_id` dont l'échéance n'existe plus : `target` est `null` pour tout lecteur.
- [x] AC4 — *(réduit : 20 lignes `referenceable` KYC/relevé/délégation = 4 lignes, en requêtes ; la branche `lease_payment_id` reste à une requête par ligne, voir les notes)* — Une page de 20 lignes mêlant les quatre genres : le nombre de requêtes est le même qu'avec 4 lignes.
- [x] AC5 — *(ablation jouée le 2026-11-14 : `BankStatement::class => new self('finances', null)` → la garde rougit, et AC1 et AC4 avec elle ; fichier restauré, md5 vérifié)* — La garde rougit quand une branche de section de `derive()` renvoie une cible sans agence (ablation : la
  branche `finances` remise à `new self('finances', null)`).
- [x] AC6 — *(relu : la même ablation rend AC1/AC2 rouges)* — Ablation : la cible de section rendue telle quelle rend AC1 et AC2 rouges.

## Hors périmètre

- La reprise des lignes stockées en base.
- Les cibles déjà stockées avec `target` (TCK-2751, TCK-2806).

## Notes d'implémentation

**Mesure (2026-11-14, cibles-2813), base de démo locale, lecture seule.** 3661 lignes `app_notifications`,
dont 71 sans `target` : `referenceable_type` NULL pour les 71 (65 `booking`, 3 `maintenance`, 3 `system`), et aucune
ne porte `data.lease_payment_id`. Les seuls `referenceable` de la base désignent `SavedSearch` (2). Les quatre branches
de section produisent donc **0 ligne en démo**. Aucun émetteur actuel de `app/` n'écrit ces `referenceable`. Ils
venaient de l'ancien `NotificationService::notify()` (`RoleDelegation` ×6 appels, `BankStatement` ×3, `'kyc_dossier'`
×2), d'avril-mai jusqu'au 2026-10-07, où **9151876ed (TCK-588)** les a retirés.

**Décision (b) du 2026-11-14 (team-lead) : le ticket se réduit à une garde.** Un lien vers la section d'une agence qui
n'est peut-être pas la bonne est pire que pas de lien. `derive()` / `fromReferenceable()` rendent `null` pour les quatre
cas : la ligne se lit, elle n'ouvre rien, quel que soit le lecteur. On ne précharge aucune agence : il n'y a plus rien
à résoudre. Les AC1, AC2, AC4 et AC6 sont relus dans ce sens ; les cases ci-dessous disent ce qui est prouvé.

**Inconnu.** Les lignes de préproduction de septembre-octobre (préproduction servie depuis le 2026-09-13, émetteurs
retirés le 2026-10-07) ne sont **pas mesurées**. Celles qui existent perdent leur lien, alors qu'elles ouvraient
jusqu'ici la section de l'agence du profil actif.

**Ce qui reste hors garde.** La branche `lease_payment_id` de `derive()` relit toujours l'échéance ligne par ligne
(une requête par ligne qui porte cette clé, antérieure au ticket). Aucune ligne n'en porte en démo.
