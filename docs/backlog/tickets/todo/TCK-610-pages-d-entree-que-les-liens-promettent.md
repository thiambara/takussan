---
id: TCK-610
title: "Les pages d'entrée que les liens promettent : renouveler l'appareil de second facteur, et l'entrée de console des opérateurs `viewer` / `support` (suites de TCK-589 §3 et TCK-600)"
status: todo
phase: P1
family: front
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
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

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé.** Seul commit citant le ticket : 8606618cc (docs, audit UX).

- Fermé entre-temps : l'invitation (point 1, AC1-AC4) par TCK-626, TCK-2609, TCK-2610, TCK-2611
  (encart du 2026-11-10) ; le point 4 (opérateur sans 2FA renvoyé vers `/app`) par **TCK-1203**
  (d7d518c1e) : le layout de la console rend `EntreeConsoleDoubleFacteur`, qui conduit à
  `EnrolementDoubleFacteurExige` sur `two_factor_required`.
- Toujours vrai : point 2 — `TwoFactorSection.tsx:255-289` n'offre, 2FA active, que « régénérer les
  codes » et « désactiver » (l'API `enable` sous step-up est prête) ; point 3 — l'entrée de console
  de `/app` existe depuis TCK-2478 (`AppSidebar.tsx:1244`) mais suit `isSuperAdmin(user.roles)`,
  pas `platform.console.access` : un `viewer`/`support` n'en a toujours aucune.
- Reste à faire (front seul, aucun delta back) :
  - geste « Remplacer l'appareil » dans `TwoFactorSection` : step-up → `enable` → nouveau QR →
    `confirm`, texte qui dit que l'ancien appareil cesse de marcher (AC5) ;
  - ligne console d'`AppSidebar` sur la capacité `platform.console.access` (AC6, première moitié) ;
  - tests front, libellés fr/en (wo = texte fr, wolof en pause).
- Aucune décision du porteur attendue.

> **Mise à jour du 2026-11-10 (audit UX, famille 2) — la partie invitation sort de ce ticket.**
> La page `/invitations/accept` existe désormais (TCK-626). L'aperçu public d'une invitation et son
> acceptation par code SMS passent à **TCK-2609** (aperçu par le jeton, API), **TCK-2610**
> (acceptation par code, un seul compte) et **TCK-2611** (la page), qui **discriminent** les états du
> jeton (expiré, annulé, accepté, inconnu) : la règle « 404 unique, sans oracle » prescrite plus bas
> est remplacée, décision du porteur 3b du 2026-11-10 (README de l'audit UX) et ADR de l'aperçu
> d'invitation. Ce qui reste valable ici et que ces tickets citent : `Referrer-Policy`, et le jeton
> hors de toute mesure d'audience. **Ce ticket ne garde que** le renouvellement de l'appareil de
> second facteur (point 2) et l'entrée des opérateurs `viewer` / `support` dans la console
> (points 3 et 4) ; ses critères sur l'invitation ne sont plus à cocher ici.

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
   (`src/components/layout/SuperAdminSidebar.tsx:99` ; `:106` au 2026-11-16), mais ils n'y entrent qu'en
   tapant l'adresse. *Relevé 2026-11-16 : l'entrée de `/app` existe depuis TCK-2478
   (`AppSidebar.tsx:1244`), mais sur `isSuperAdmin(user.roles)`.*
4. ~~**Un `viewer` / `support` sans 2FA est renvoyé vers `/app`.**~~ *Fermé par TCK-1203 : la
   console rend `EntreeConsoleDoubleFacteur` (`super-admin/layout.tsx` l.69-78).* L'API répond 403
   `two_factor_required` sur `me/abilities` ; `configurationDoubleFacteurExigee`
   (`src/lib/double-facteur.ts:46-51`) ne juge que `isSuperAdmin(user.roles)`.

## Contrat de données

- Existant : `POST /api/invitations/{token}/accept` (corps selon la branche : nouveau compte ou compte
  connecté), `POST /api/auth/two-factor/enable|confirm|step-up`, `GET /api/auth/two-factor/qr`,
  `GET /api/me/abilities` (`platform.console.access`).
- ~~**À créer (back)**~~ — caduc depuis TCK-2609 (aperçu discriminant les états, décision 3b) : `GET /api/invitations/{token}` public, qui ne rend que ce que l'invité doit voir
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

- [x] ~~Back : `GET /api/invitations/{token}`~~ — caduc depuis TCK-2609 : (`PublicInvitationController@show`, ressource minimale),
      `throttle` nommé ; test `PublicInvitationPreviewTest` (404 unique, aucun champ de contact).
- [x] ~~Front : page `/invitations/accept`~~ — tenu par TCK-626 / TCK-2611 : (aperçu, branches compte connecté / nouveau compte /
      connexion, expiré) ; mesure d'audience sans jeton.
- [x] Front : renouvellement de l'appareil de second facteur dans les réglages de sécurité.
- [x] Front : entrée de console dans la navigation de `/app` sur `platform.console.access` ;
      ~~`configurationDoubleFacteurExigee` juge la capacité plateforme~~ — caduc depuis TCK-1203
      (ce n'est plus elle qui renvoie l'opérateur hors de la console).
- [x] Tests front : ~~page d'invitation (rendu sans requête mutante, branches, expiré)~~ (caduc
      depuis TCK-2611), entrée de console pour `viewer` ~~, redirection vers l'enrôlement d'un
      `support` sans 2FA~~ (tenu par TCK-1203).

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** *(caduc depuis TCK-2609/TCK-2610/TCK-2611, encart du 2026-11-10)* Le lien d'un e-mail d'invitation ouvre une page servie (200),
      qui affiche l'agence et le rôle ; l'acceptation par un nouveau compte crée le profil et connecte.
- [x] **AC2.** *(caduc depuis TCK-2609/TCK-2610/TCK-2611, encart du 2026-11-10)* Le même lien par un compte existant connecté : un geste accepte, le profil apparaît
      dans le sélecteur de profils.
- [x] **AC3.** *(caduc depuis TCK-2609/TCK-2610/TCK-2611, encart du 2026-11-10)* Jeton inconnu, expiré, révoqué : `GET /api/invitations/{token}` rend le même 404 ; la
      page affiche « demandez une nouvelle invitation ».
- [x] **AC4.** *(caduc depuis TCK-2609/TCK-2610/TCK-2611, encart du 2026-11-10)* Le rendu de la page n'émet aucune requête `POST` ; la mesure d'audience ne reçoit pas le
      jeton.
- [x] **AC5.** Un compte à 2FA renouvelle son appareil : step-up, nouveau QR, confirmation ; l'ancien
      code ne passe plus.
- [x] **AC6 (rouge sur `839be671`).** Un `viewer` voit l'entrée de la console dans `/app` ; un
      `support` sans 2FA est conduit à l'enrôlement au lieu de `/app` *(seconde moitié tenue par
      TCK-1203, relevé 2026-11-16 ; reste la première)*.

## Hors périmètre

- La 2FA exigée des pouvoirs plateforme hors console (TCK-609).
- Les dialogues d'invitation qui avalent l'erreur de saisie (TCK-448).
- La refonte du parcours d'onboarding.

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Remplacer l'appareil** (`TwoFactorSection`) : un bouton à côté de « Régénérer les codes », qui
  s'explique d'abord (l'ancien appareil cesse de marcher à la confirmation, les codes de secours sont
  remplacés, jusque-là rien ne change), puis `enable` sous la garde du step-up, QR du nouvel appareil,
  `confirm` « Confirmer le nouvel appareil ». Abandonner est sans effet : l'API garde l'ancien secret
  jusqu'à `confirm` (`TwoFactorController::confirmRenewal`).
- **AC5** — `TwoFactorSection.remplacer.tck-610.test.tsx` (4 tests : explication sans appel, step-up →
  QR → confirmation, step-up refusé, abandon). Ablation : `enable` sans `avecGardeDoubleFacteurAction`
  → rouge. « L'ancien code ne passe plus » se DÉDUIT du secret remplacé à la confirmation, que prouve
  `TwoFactorRenewalTest` côté API (aucune assertion n'y rejoue un code de l'ancien appareil après
  renouvellement ; aucun changement back dans ce ticket).
- **Entrée de console** : `accesALaConsole` (`lib/navigation/acces-console.ts`) lit
  `GET /api/admin/me/abilities` dans le layout de `/app`, avec le jeton de la COQUE (`getToken`, la
  cible pendant une impersonation), en parallèle des lectures d'accès ; le `super_admin` n'en paie
  aucune. Le refus `two_factor_required` compte comme une entrée (`EnsureSuperAdmin` teste le profil
  plateforme avant la 2FA) : la console conduit ensuite à l'enrôlement (TCK-1203). Toute autre panne
  ferme l'entrée sans faire tomber `/app`.
- **AC6** — `acces-console.tck-610.test.ts` (8 tests) et `AppSidebar.test.tsx` (`viewer`, `support` au
  profil d'agence, client sans le geste), `AppShell.console.tck-610.test.tsx` (colonne et tiroir).
  Ablations : condition ramenée au rôle → 2 rouges ; forcée à vrai → 2 rouges ; branche `doubleFacteur`
  retirée → 2 rouges ; `catch` retiré → 1 rouge ; prop retirée d'un montage d'`AppShell` → 1 rouge
  (chacun des deux). Sous impersonation, le layout ne lit rien (l'API refuse `/api/admin/*` à ce jeton).

