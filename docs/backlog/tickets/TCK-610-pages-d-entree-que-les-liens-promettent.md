---
id: TCK-610
title: "Les pages d'entrée que les liens promettent : accepter une invitation, renouveler l'appareil de second facteur, et l'entrée des opérateurs `viewer` / `support` dans la console (suites de TCK-589 §3 et TCK-600)"
status: todo
phase: P1
family: full
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#48-invitation-
    - docs/models-spec.md#1-user
tags: [front, back, invitation, 2fa, onboarding, console, operateurs, parcours]
---

# TCK-610 — Les pages d'entrée que les liens promettent

## Objectif utilisateur

Un agent, un bailleur ou un prestataire invité qui ouvre le lien reçu par e-mail ou par SMS arrive
sur une page qui lui permet d'accepter ; un utilisateur qui change de téléphone renouvelle son second
facteur sans passer par le support ; un opérateur `viewer` ou `support` trouve la console et, s'il lui
manque la 2FA, est conduit à l'enrôlement.

## Contexte

Suites de **TCK-589** (Notes §3, « la page manquante est au rapport, hors périmètre » ;
`FILE-D-ATTENTE.md`, points hors périmètre) et de **TCK-600** (`TCK-600-rapport.md`, « Deux trous de
bout de chaîne, hors critères, à trancher » ; `FILE-D-ATTENTE.md` 15:35).

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Le lien d'invitation mène à une page qui n'existe pas.** `InvitationMailable`
   (`takussan-api/app/Mail/InvitationMailable.php:48`) et le SMS d'`InvitationService`
   (`takussan-api/app/Services/Invitation/InvitationService.php:959`) pointent vers
   `/invitations/accept?token=…`. Aucune route de `takussan-web/src/app` ne la sert
   (`find takussan-web/src -iname "*invit*"` : dialogues d'envoi seulement). L'API d'acceptation existe,
   publique : `POST /api/invitations/{token}/accept` (`routes/api/invitations.php:13`, TCK-249), avec une
   branche « compte existant » pour un appelant connecté. **Toute invitation envoyée aujourd'hui aboutit
   à la page 404.**
2. **Aucun écran ne renouvelle l'appareil de second facteur.** L'API le permet (TCK-589,
   contrainte 10 : `POST /api/auth/two-factor/enable` sur une 2FA active, sous step-up) ; le front
   n'offre que l'enrôlement initial (`src/app/onboarding/securite/page.tsx`).
3. **Un `viewer` ou un `support` n'a aucun lien vers la console depuis `/app`.** Ces opérateurs n'ont
   pas le rôle `super_admin` ; le layout de la console les admet sur `platform.console.access`
   (`src/components/layout/SuperAdminSidebar.tsx:99`), mais ils n'y entrent qu'en tapant l'adresse.
4. **Un `viewer` / `support` sans 2FA est renvoyé vers `/app`.** L'API répond 403
   `two_factor_required` sur `me/abilities` ; `configurationDoubleFacteurExigee`
   (`src/lib/double-facteur.ts:46-51`) ne juge que `isSuperAdmin(user.roles)`.

## Contrat de données

- Existant : `POST /api/invitations/{token}/accept` (corps selon la branche : nouveau compte ou compte
  connecté), `POST /api/auth/two-factor/enable|confirm|step-up`, `GET /api/auth/two-factor/qr`,
  `GET /api/me/abilities` (`platform.console.access`).
- **À créer (back)** : `GET /api/invitations/{token}` public, qui ne rend que ce que l'invité doit voir
  avant d'accepter — agence (nom, logo), rôle, expiration, et si le contact correspond à un compte
  existant (booléen) — **jamais** l'e-mail ni le téléphone de l'invitation, ni l'invitant au-delà de
  son prénom. Jeton inconnu, expiré ou révoqué : 404 unique (pas d'oracle). Débit par IP.

## Direction UX / Artistique

- Page d'invitation sobre, dans la charte (`docs/design-guidelines.md`, palette Lin) : qui invite, à
  quel rôle, puis l'action. Un invité déjà connecté avec le bon compte accepte en un geste ; sinon,
  création du compte ou connexion, puis retour sur l'acceptation.
- Invitation expirée ou révoquée : un message clair qui dit de demander une nouvelle invitation, pas
  un écran d'erreur générique.
- Renouvellement de l'appareil : dans les réglages de sécurité, rangé à côté des codes de secours ;
  le flux dit qu'il remplace l'ancien appareil.
- Console : l'entrée apparaît dans la navigation de `/app` pour tout compte qui détient
  `platform.console.access`, pas seulement pour le rôle `super_admin`.

## Contraintes strictes (métier)

1. Le jeton d'invitation ne quitte jamais l'URL vers un tiers : la page porte `Referrer-Policy:
   no-referrer` et le jeton est exclu de la mesure d'audience (même règle que les pages à jeton de
   TCK-599, `beforeSend`).
2. La page ne fait **aucune** requête qui accepte au simple rendu : l'acceptation est un geste.
3. L'enrôlement exigé se décide sur **les capacités plateforme** du compte (`platform.console.access`)
   et non sur le rôle : un opérateur sans 2FA est conduit à l'enrôlement, jamais renvoyé ailleurs.
4. Libellés fr/en/wo (principe n°5) ; préfixe `/api` selon le client choisi (piège de `CLAUDE.md`).

## Delta à produire

- [ ] Back : `GET /api/invitations/{token}` (`PublicInvitationController@show`, ressource minimale),
      `throttle` nommé ; test `PublicInvitationPreviewTest` (404 unique, aucun champ de contact).
- [ ] Front : page `/invitations/accept` (aperçu, branches compte connecté / nouveau compte /
      connexion, expiré) ; mesure d'audience sans jeton.
- [ ] Front : renouvellement de l'appareil de second facteur dans les réglages de sécurité.
- [ ] Front : entrée de console dans la navigation de `/app` sur `platform.console.access` ;
      `configurationDoubleFacteurExigee` juge la capacité plateforme.
- [ ] Tests front : page d'invitation (rendu sans requête mutante, branches, expiré), entrée de
      console pour `viewer`, redirection vers l'enrôlement d'un `support` sans 2FA.

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** Le lien d'un e-mail d'invitation ouvre une page servie (200),
      qui affiche l'agence et le rôle ; l'acceptation par un nouveau compte crée le profil et connecte.
- [ ] **AC2.** Le même lien par un compte existant connecté : un geste accepte, le profil apparaît
      dans le sélecteur de profils.
- [ ] **AC3.** Jeton inconnu, expiré, révoqué : `GET /api/invitations/{token}` rend le même 404 ; la
      page affiche « demandez une nouvelle invitation ».
- [ ] **AC4.** Le rendu de la page n'émet aucune requête `POST` ; la mesure d'audience ne reçoit pas le
      jeton.
- [ ] **AC5.** Un compte à 2FA renouvelle son appareil : step-up, nouveau QR, confirmation ; l'ancien
      code ne passe plus.
- [ ] **AC6 (rouge sur `839be671`).** Un `viewer` voit l'entrée de la console dans `/app` ; un
      `support` sans 2FA est conduit à l'enrôlement au lieu de `/app`.

## Hors périmètre

- La 2FA exigée des pouvoirs plateforme hors console (TCK-609).
- Les dialogues d'invitation qui avalent l'erreur de saisie (TCK-448).
- La refonte du parcours d'onboarding.

## Notes d'implémentation

_(à remplir par implementing-specs)_
