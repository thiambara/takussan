---
id: TCK-2834
title: "Carnet des prestataires : l'invitation d'un prestataire déjà inscrit ailleurs paraît en attente, sans rien montrer de son profil"
status: todo
phase: P2
family: full
estimate: M
wave: null
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
    - "docs/models-spec.md#48-invitation-"
  tickets:
    - docs/backlog/tickets/done/TCK-2829-invitation-en-attente-visible-dans-le-carnet.md
    - docs/backlog/tickets/done/TCK-262-service-provider-multi-rattachement.md
tags: [back, front, maintenance, prestataires, carnet, invitation, cloisonnement, suite-de-tck-2829, audit-ux, app]
---

## Objectif utilisateur

L'agent qui invite un prestataire déjà inscrit dans une autre agence le retrouve dans son carnet,
marqué « Invitation envoyée », avec Renvoyer et Révoquer. Il ne voit de lui que ce qu'il a saisi en
l'invitant, jamais ce que le prestataire a construit avec l'autre agence.

## Contexte (relevé au HEAD 196e7908f, 2026-11-14)

- `ServiceProviderInvitationService::invite()` : quand le destinataire a déjà un profil
  (`lookupExistingServiceProvider`, TCK-262), l'invitation **réutilise ce profil** et ne crée **aucune
  collaboration** avec l'agence qui invite. La collaboration naît à l'acceptation. L'invitation porte
  `invitable_id` = le profil existant, `agency_id` = l'agence qui invite et
  `metadata.existing_sp_other_agency = true`.
- `ServiceProviderProfileController::scopeForAgency()` (TCK-2829) : le carnet par défaut rend les
  collaborations `active`, ou un profil **`draft`** avec une collaboration `paused` de l'agence et une
  invitation `sent` de l'agence. Le profil existant est `active` et n'a pas de collaboration avec
  l'agence. **L'invitation est donc absente du carnet**, et la recherche ne la trouve pas.
- Le front (`ServiceProvidersList.tsx`) reconnaît une invitation à `status === 'draft'` (libellé,
  « Invité le », métiers et zones lus dans `metadata`). Un profil existant rendu tel quel passerait
  pour un prestataire actif de l'agence.
- Écart consigné en hors périmètre de TCK-2829.

## Contrat de données

- `GET /api/agencies/{agency}/service-providers` (carnet par défaut, sans `filter[collaboration_status]`) :
  rend aussi ces invitations. Une telle ligne se reconnaît sans ambiguïté comme une invitation en
  attente, porte `pending_invitation_id`, et ne porte **que** ce que l'agence a saisi à l'invitation
  (prénom, nom, téléphone ou e-mail saisis, métiers, zones) et la date d'invitation.
- `POST /api/invitations/{invitation}/resend` et `…/revoke` : inchangés, ils suffisent.

## Contraintes strictes (métier)

- **Aucune collaboration n'est créée avant l'acceptation** (contrat de TCK-262 : la collaboration naît
  à l'acceptation, une `paused` vaut suspension depuis TCK-592).
- **Cloisonnement.** Avant l'acceptation, rien du profil maître ne sort vers l'agence qui invite :
  ni `specialties`, ni `service_areas`, ni `metadata` du profil, ni note moyenne, ni nombre d'avis, ni
  badge « Assuré », ni téléphone ou e-mail du compte, ni `user`, ni délai de réponse, ni aucune
  collaboration avec une autre agence.
- La recherche (`filter[search]`), la zone (`filter[zone]`) et `meta.zones` ne lisent, pour cette
  ligne, que les données saisies par l'agence. Une recherche sur le vrai nom du compte, s'il diffère du
  nom saisi, ne la trouve pas.
- Le carnet est aujourd'hui la seule lecture d'un profil prestataire par une agence (aucune route de
  fiche au HEAD). Ce ticket n'en ajoute pas, et aucun `include=` du carnet (`user`,
  `agencyCollaborations`, `invitations`) ne rend sur cette ligne une donnée du profil maître.
- Un `filter[collaboration_status]` explicite garde son sens (TCK-2829).
- Après l'acceptation, une seule ligne : la collaboration `active`, sans doublon d'invitation.
  Une invitation révoquée ou expirée sort du carnet par défaut.

## Delta à produire

- [ ] API : `ServiceProviderProfileController` (carnet par défaut et `meta.zones`) ajoute les
      invitations `sent` de l'agence dont le profil invité est un profil existant (sans collaboration
      avec l'agence). La ligne est construite depuis l'invitation, pas depuis le profil. La forme
      (ligne distincte, marqueur dédié, etc.) s'écrit dans les notes.
- [ ] Front : `ServiceProvidersList` affiche cette ligne comme une invitation (« Invitation envoyée »,
      « Invité le », Renvoyer, Révoquer), et le sous-titre la compte.
- [ ] Tests : `CarnetInvitationProfilExistantTest` (fonctionnalité, par l'API réelle
      `POST /api/agencies/{agency}/service-providers/invite`), et test du composant pour la ligne.

## Critères d'acceptation

- [ ] AC1 — Un prestataire actif dans l'agence A est invité par l'agence B. `GET` du carnet de B sans
      filtre rend la ligne, marquée comme invitation, avec `pending_invitation_id` = l'invitation.
      `filter[search]=<nom saisi par B>` la trouve. Test qui échoue au HEAD (ablation).
- [ ] AC2 — Cloisonnement : sur cette ligne, la réponse ne contient **aucune** valeur propre au profil
      maître. Le test donne au profil des valeurs distinctes de celles saisies par B (métiers, zones,
      nom du compte, téléphone du compte, un avis approuvé, une pièce d'assurance) et vérifie qu'aucune
      n'apparaît dans le JSON de la ligne ni dans `meta.zones`. `filter[search]=<nom du compte>` ne la
      trouve pas. Ablation : construire la ligne depuis le profil rend le test rouge.
- [ ] AC3 — Le carnet de l'agence A, et celui d'une agence C, ne montrent jamais l'invitation de B.
      Test de fuite.
- [ ] AC4 — Aucune ligne `service_provider_agency_collaborations` n'existe entre le profil et B avant
      l'acceptation. Après l'acceptation, le carnet de B rend exactement une ligne pour ce prestataire,
      collaboration `active`. Test.
- [ ] AC5 — Après révocation, la ligne sort du carnet par défaut de B. Test.
- [ ] AC6 — Au navigateur (390 et 1280), `/app/maintenance/providers` de l'agence B : la ligne paraît
      « Invitation envoyée » avec Renvoyer et Révoquer, et ne montre ni note, ni badge « Assuré », ni
      métier ou zone que B n'a pas saisi. Relevé consigné.

## Hors périmètre

- Le drapeau `existing_sp_other_agency` rendu à l'invitant à l'envoi (TCK-260, TCK-262).
- Le parcours d'acceptation du multi-rattachement (TCK-262).
- Les invitations de bailleurs et d'agents.

## Notes d'implémentation

_(à remplir par implementing-specs)_
