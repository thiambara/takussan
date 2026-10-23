---
id: TCK-1763
title: "Le verdict KYC et les alertes de gouvernance ne partent qu'à qui ouvre leur page, et une garde confronte les cibles d'administration à `PAGES_ADMIN`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-161--cibles-de-notification-qui-ouvrent-un-écran-fermé-au-destinataire"
tags: [back, notifications, kyc, gouvernance, garde, pistes]
---

## Contexte

Réf : **P161.05** du fichier de pistes, `validé` (validation en bloc du porteur).

Deux avis partaient à des destinataires que leur page renvoie ailleurs : le verdict KYC au seul
admin principal (`/app/agency/kyc` exige `agency.update_kyc`, TCK-1274), et les alertes de
gouvernance aux admins de toute agence (`/app/agency/audit` exige une agence `standard`). Et rien ne
confrontait l'exigence de la page d'une cible à ceux qui la reçoivent.

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué que la validation reprend : (1) les alertes de gouvernance réservées aux
agences `standard`, comme `ReviewNotifier::toModerate` ; (2) le verdict KYC aux admins actifs qui
tiennent `agency.update_kyc`, l'admin principal en repli s'il n'y en a aucun ; (3) la garde en
dernier, comme une table « code → exigence de la page de sa cible » confrontée à `PAGES_ADMIN`,
sans prétendre lire les destinataires.

## Choix de l'implémenteur

- **La garde s'indexe par genre de cible, non par code** : le genre d'un code n'est pas statique
  (`payouts:remind-due` le choisit selon le destinataire, TCK-1467), le genre l'est dans `PATHS`.
- **La garde vit dans `check-notification-target-paths.mjs`**, déjà jouée par Repo CI : une garde
  neuve n'y tournerait qu'en touchant `.github/`, chemin fermé à l'implémenteur.
- Le verdict KYC ne va qu'aux **admins** qui tiennent la capacité, pas aux agents qui la tiendraient
  par un rôle personnalisé : la recommandation dit « admins actifs ».

## Delta produit

- [x] `GovernanceAlertService::handle` : aucune alerte pour une agence qui n'est pas `standard`.
- [x] `KycWorkflowService::notifyReviewed` : `AdminsDeLAgence::destinataires` filtrés par
  `canActAt(agency.update_kyc)`, l'admin principal en repli.
- [x] `check-notification-target-paths.mjs` : la table `EXIGENCES` (genre → exigence de page),
  confrontée aux entrées de `PAGES_ADMIN` dans les deux sens.

## Critères d'acceptation

- [x] AC1 — une agence `individual` dont un second admin est actif ne reçoit aucune alerte de gouvernance.
- [x] AC2 — admin principal sans `agency.update_kyc`, collègue admin qui la tient : le verdict part
  au collègue seul ; sans collègue, il part à l'admin principal.
- [x] AC3 — la garde rougit sur une exigence de page changée, et sur une cible d'administration non déclarée.

## Notes d'implémentation

- Tests : `GovernanceAlertTest::test_une_agence_individuelle_n_avertit_personne` et
  `KycVerdictRecipientsTest` (2), écrits avant le correctif → 1 et 1 rouges (le repli était déjà vrai).
- Ablation : les deux services rendus à `HEAD` → 1 rouge chacun ; garde : `capacite` ajoutée à
  l'audit dans `pages-admin.ts` → rouge, entrée `finances` retirée d'`EXIGENCES` → rouge.
- Piège : `Builder::value('kind')` d'Eloquent applique le cast — il rend l'enum `AgencyKind`, pas la chaîne.
- Les relances d'échéance KYC (`KycExpiryService`) partent encore à tous les admins actifs : hors
  de la piste, relevé dans le rapport.
