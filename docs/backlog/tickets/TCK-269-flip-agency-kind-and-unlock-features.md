---
id: TCK-269
title: "Flip Agency.kind à l'approbation + débloquage features + welcome agence"
status: todo
phase: P1
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-248, TCK-267, TCK-268]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
    - "docs/models-spec.md#49-agencyupgraderequest-"
tags: [back, front, agency, upgrade, p1]
---

## Objectif utilisateur

À l'approbation d'un `AgencyUpgradeRequest`, l'agence cible bascule en `kind = standard` automatiquement, ses champs légaux sont enrichis, les capacités précédemment restreintes deviennent accessibles, et le `agency_admin` voit une **welcome modale "Bienvenue dans votre agence"** qui l'invite à inviter sa première équipe.

## Contrat de données

Listener qui consomme `AgencyUpgradeApproved` (event émis par TCK-268) :

1. Charge la `Agency` cible.
2. `Agency.kind = standard`.
3. Copie les champs légaux depuis la demande approuvée vers l'agence si vides côté agence : `rc`, `ninea` (et autres champs juridiques si pas déjà sur Agency — sinon stockage dans `Agency.metadata.legal_info`).
4. Notification au `submitter` (déjà couverte par TCK-268 — pas redoublée).
5. Marque une key dédiée pour déclencher la welcome modale "Agence" au prochain login : `agency-standard-welcome-{agency_id}`.

Frontend :
- Au login, si key `agency-standard-welcome-{agency_id}` non vue ET le profil actif est `agency_admin` de cette agence → affichage `<WelcomeModal>` "Bienvenue dans votre agence" (slides : "Invitez votre équipe", "Configurez les rôles", "Accédez aux rapports").

## Contraintes strictes (métier)

- Le flip est **transactionnel** avec l'approbation : si le flip échoue, l'approbation est rollback (statut `pending`, commentaire technique loggé).
- Le débloquage de capacités est implicite : les policies existantes (TCK-256, 258, etc.) lisent `Agency.kind` et autorisent automatiquement.
- Pas de rétrogradation possible (déjà documenté en TCK-248/252).
- Activity log : `agency_kind_flipped` avec from/to + agency_id.

## Delta à produire

- [ ] Listener : `App\Listeners\FlipAgencyKindOnUpgradeApproved`
- [ ] Service : `App\Services\Agency\AgencyKindFlipService` (réutilisable + testable isolément)
- [ ] Tests backend :
  - Approve → flip kind + copie champs légaux
  - Échec flip → rollback approbation
  - Activity log
  - Welcome key posée
- [ ] Frontend : déclencher `<WelcomeModal>` "Agence" au login si key non vue
- [ ] Slides "Bienvenue dans votre agence" en i18n FR/EN/WO
- [ ] Tests frontend : modale déclenchée 1 fois, ne réapparaît pas

## Critères d'acceptation

- [ ] AC1 — Approbation d'une demande → `Agency.kind` passe à `standard` immédiatement.
- [ ] AC2 — Champs légaux copiés (`rc`, `ninea`) sur l'agence si vides.
- [ ] AC3 — Au prochain login du `agency_admin`, welcome modale "Agence" affichée 1 fois.
- [ ] AC4 — Les pages auparavant bloquées (équipe TCK-258) deviennent accessibles côté UI et backend.
- [ ] AC5 — Activity log entry `agency_kind_flipped`.

## Hors périmètre

- Form de soumission utilisateur — TCK-267.
- Console super-admin de review — TCK-268.
- Configuration UI des nouvelles capacités (rôles personnalisés…) — déjà existante / autre ticket.

## Notes d'implémentation

_(à remplir par implementing-specs)_
