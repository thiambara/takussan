---
id: TCK-256
title: "Form invitation Owner depuis espace agence"
status: todo
phase: P0
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-249]
blocks: [TCK-257]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#34-ownerprofile-"
tags: [back, front, onboarding, owner, invitation, p0]
---

## Objectif utilisateur

Un `agency_admin` ou un `agent` (s'il en a la permission déléguée) doit pouvoir **inviter un nouveau propriétaire** depuis l'espace agence (formulaire dédié, ou ouvert depuis "Ajouter un propriétaire" lors de la création d'un bien).

## Contrat de données

Repose sur le pattern Invitation unifié (TCK-249) :

- `POST /api/invitations` avec body :

  ```json
  {
    "email": "owner@example.com",
    "role": "owner",
    "agency_id": 42,
    "invitable_type": "OwnerProfile",
    "invitable_data": { "first_name": "...", "last_name": "...", "phone": "...", "owner_type": "individual|company" }
  }
  ```

  Le service crée un `OwnerProfile` en `draft` rattaché à l'agence et l'invitation associée.

## Direction UX / Artistique

Form accessible depuis :
- Page `/app/owners` → bouton "Ajouter un propriétaire" → modal/sheet
- Form de création de bien → champ "Propriétaire" → option "Inviter un nouveau propriétaire" → même modal/sheet

Champs : email, prénom, nom, téléphone, type (Particulier / Société + raison sociale si société). Bouton "Envoyer l'invitation".

Toast de succès + redirection vers la liste des propriétaires (l'owner apparaît en statut "Invité").

## Contraintes strictes (métier)

- Restriction `Agency.kind` : seules les agences `standard` peuvent inviter des Owners. Les agences `individual` n'ont pas accès à cet écran (gate frontend + policy backend).
- Permission requise : `invite_owner` dans le profil actif de l'inviteur (par défaut : `agency_admin` toujours, `agent` si délégué).
- Conflit email : si l'email correspond déjà à un user avec un OwnerProfile dans cette agence → 409 (déjà membre). Si l'user existe sans profil dans cette agence → l'invitation est créée, l'acceptation rattachera le nouveau profil.
- Activity log : événement `owner_invited` avec inviter, agency, email cible.

## Delta à produire

- [ ] Service : `App\Services\Invitation\OwnerInvitationService` (wraps `InvitationService` + crée `OwnerProfile` draft)
- [ ] Endpoint dédié si besoin de simplifier le payload : `POST /api/agencies/{agency}/owners/invite`
- [ ] Policy : `OwnerProfilePolicy@invite` (kind=standard + permission `invite_owner`)
- [ ] Tests backend : invitation, conflit, refus si agency.kind=individual, refus si pas la permission
- [ ] Page `/app/owners` : bouton "Ajouter un propriétaire" + modal
- [ ] Composant `<InviteOwnerSheet>` réutilisable depuis le form de création de bien
- [ ] Liste owners : affichage statut "Invité" avec actions (renvoyer / révoquer)
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Un agency_admin de standard envoie une invitation, l'owner apparaît en "Invité", l'email est envoyé.
- [ ] AC2 — Un agency_admin de individual ne voit pas le bouton (UI) et reçoit 403 sur l'endpoint (backend).
- [ ] AC3 — Un agent sans permission délégée ne voit pas le bouton et reçoit 403.
- [ ] AC4 — Renvoi et révocation fonctionnent depuis la liste owners.
- [ ] AC5 — Acceptation par l'owner via le pattern TCK-249 fait passer le `OwnerProfile` à `active`.

## Hors périmètre

- Wizard d'onboarding post-acceptation Owner (KYC, tour, vue biens) — TCK-257.
- Pré-rattachement de biens à un Owner avant son acceptation — fonctionnalité existante / autre ticket.

## Notes d'implémentation

_(à remplir par implementing-specs)_
