---
id: TCK-1318
title: "Une seule liste des admins destinataires d'une agence : profil actif et compte joignable"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-126--destinataires-déquipe-choisis-sans-juger-le-profil-actif"
tags: [api, notifications, profils, pistes]
---

## Contexte

Réf : **P126.05** du fichier de pistes, `validé (délégué)`.

Les admins actifs d'une agence, destinataires d'un avis, se listaient six fois ; seule
`ContactLeadService::agencyAdmins` écartait le compte bloqué ou supprimé.

## Décision du porteur (déléguée)

« validé (délégué) — une seule méthode, sortie de `ContactLeadService::agencyAdmins` vers un lieu neutre au choix de l'implémenteur, qui rend les admins actifs (`->active()`) et joignables (`PrimaryPropertyContact::joignable`) d'une agence ; les six listes l'appellent, chacune gardant son filtre propre (l'auteur écarté par `GovernanceAlertService::recipients`) ; `NotifyStatementImported` reste inchangé ; test : admin `blocked` absent de chaque liste, admin actif présent »

Critère accordé : V7.

## Objectif

Une méthode unique rend les admins actifs et joignables d'une agence, et les six listes l'appellent.

## Delta à produire

- [x] `App\Services\Membership\AdminsDeLAgence::destinataires(?int)` : profil d'admin `active` dans
      l'agence, compte `PrimaryPropertyContact::joignable`.
- [x] Appelants : `ContactLeadService::agencyAdmins` (délègue), `KycExpiryService::activeAdmins`,
      `GovernanceAlertService::recipients` (auteur écarté), `ReviewNotifier::agencyAdmins`,
      `PropertyModerationNotifier::submitted` (auteur écarté),
      `PropertyController::notifyAgencyAdminsOfProposal`.
- [x] Tests : `AdminsDeLAgenceDestinatairesTest` (neuf), un cas « admin bloqué » dans
      `KycDossierExpiryTest`, `GovernanceAlertTest` et `PropertyAuthorizationTest`.

## Critères d'acceptation

- [x] AC1 — Pour chacune des six listes, un admin au profil actif et au compte `blocked` ne reçoit
      rien, l'admin actif joignable reçoit son avis.
- [x] AC2 — L'auteur du geste reste écarté par la gouvernance et la modération de bien.
- [x] AC3 — `NotifyStatementImported` inchangé.

## Hors périmètre

- `NotifyStatementImported` (décision).
- Les délégués du rôle `agency_admin` dans ces listes : aucune ne les comptait, aucune ne les compte.

## Notes d'implémentation

- `ContactLeadService::agencyAdmins` est gardée comme délégation d'une ligne : quatre autres
  appelants (modération d'agence, boosts, comptes effacés, crédits) la lisent, et elle rendait déjà
  la même liste. La définition, elle, n'existe plus qu'une fois.
- La liste de `ContactLeadService` filtrait déjà le compte bloqué : son test passe avant et après
  correctif, il garde la délégation.
- Ablation : les six fichiers de `app/` remis à `HEAD` → 5 rouges (avis sur l'agence, bien à
  modérer, gouvernance, proposition de bien, relance KYC) ; correctif remis → tout vert.
