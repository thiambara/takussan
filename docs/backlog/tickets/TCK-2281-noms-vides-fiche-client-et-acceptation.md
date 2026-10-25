---
id: TCK-2281
title: "Noms vides : la fiche client se nomme par l'assembleur commun, et un compte sans nom confirme à l'acceptation le nom de l'invitation"
status: doing
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2138, TCK-2142]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [api, web, identite, crm, invitations, pistes]
---

## Contexte

Pistes : P220.03, P220.07

Réfs : **P220.03** et **P220.07** du fichier de pistes, angle 220, `validé`. Un compte créé par
téléphone naît à noms `''`.

- **P220.03** — une fiche client créée depuis un tel compte (candidature, offre, réservation)
  garde prénom et nom vides : le repli `?? 'Client'` / `?? '#id'` de
  `CustomerService::findOrCreateFromUser` ne joue jamais, puisque les colonnes de `users` sont
  `NOT NULL`. Huit écrans du front composent le nom de la fiche sans repli ; la garde
  `scripts/check-nom-affichable.mjs` les excusait un par un, « P220.03 à valider ».
- **P220.07** — un compte existant qui accepte une invitation ne reçoit pas le nom que l'agence a
  saisi : `acceptForUser` n'écrit aucun nom, et l'écran d'acceptation connecté n'en demande pas.

## Décision du porteur

- **P220.03** — validation du porteur (2026-10-25) : `nomAffichable` sur les huit sites du front, exceptions retirées de `check-nom-affichable` ; le repli mort `?? 'Client'` retiré de l'API, rien n'est écrit en base
- **P220.07** — validation du porteur (2026-10-25) : un compte connecté sans nom voit à l'acceptation le prénom et le nom de l'invitation préremplis, qu'il confirme ou corrige ; l'API ne les écrit que si les noms du compte sont vides

## Hypothèses

- **P220.07** — « sans nom » : prénom et nom du compte tous deux vides. L'API n'écrit alors que ce
  que la personne envoie à l'acceptation, et jamais sur un compte qui porte déjà un nom.
- **P220.07** — l'écran connecté ne connaît pas l'invitation. Une lecture neuve,
  `GET /api/invitations/{token}/prefill` (authentifiée), rend le prénom et le nom saisis par
  l'agence, seulement au compte destinataire et seulement s'il est sans nom. Sinon elle rend
  `data: null`, et l'écran garde son seul bouton.
- **P220.07** — un prénom effacé n'empêche pas d'accepter : l'acceptation part alors sans nom,
  comme aujourd'hui.
- **P220.03** — chaque site passe les seuls champs qu'il charge déjà (aucun champ de contact neuf
  demandé à l'API), comme TCK-2138.

## Delta à produire

- [ ] P220.03 — `CustomerService::findOrCreateFromUser` : le repli `?? 'Client'` / `?? '#id'`
      retiré, rien d'autre ne change.
- [ ] P220.03 — `nomAffichable()` sur les huit sites (fiche, carte et sélecteur du tableau, tiroir,
      liste, sélecteur de visite, client du bail, recherche CRM) ; leurs exceptions retirées de
      `check-nom-affichable`.
- [ ] P220.07 — `acceptForUser` reçoit le prénom et le nom envoyés, et ne les écrit que sur un
      compte sans nom.
- [ ] P220.07 — `GET /api/invitations/{token}/prefill`, et l'écran connecté qui préremplit les deux
      champs quand elle rend des noms.

## Critères d'acceptation

- [ ] Une fiche client née d'un compte sans nom garde des noms vides en base, et chaque écran la
      nomme par son e-mail, son numéro ou `#<id>`. La garde ne connaît plus d'exception P220.03.
- [ ] Un compte sans nom qui accepte avec un prénom et un nom les porte ensuite. Un compte nommé
      garde le sien, quoi qu'on envoie.
- [ ] Connecté et sans nom, l'écran d'acceptation montre le prénom et le nom de l'invitation, et
      les envoie à l'acceptation. Connecté et nommé, il montre le seul bouton.

## Hors périmètre

- Le nom vide d'une fiche client sur une facture (`InvoiceNumberAllocator`, V1), piste à part.
