---
id: TCK-2727
title: "Le 401 « connectez-vous » d'une invitation ne rend que l'e-mail masqué, comme l'aperçu"
status: todo
phase: P1
family: full
estimate: S
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2610, TCK-2609]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [full, invitations, auth, confidentialite, masquage, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'invité à qui l'on demande de se connecter avant d'accepter sait vers quel compte aller (« m•••@gmail.com ») sans que
la page lui montre en clair une adresse que l'aperçu public de la même invitation masque.

## Contexte

Suivi de TCK-2610. L'aperçu public de l'invitation (TCK-2609, `PublicInvitationPreviewResource`) masque le contact
(`Masking::email`, `Masking::phone`). Mais l'acceptation, quand le contact porte déjà un compte, rend **l'e-mail complet**
de l'invitation par trois émetteurs :

1. `InvitationService` (~l. 313) : `abort_code(401, 'invitation.requires_login', [], ['X-Invitation-Email' =>
   $invitation->email, …])` — un en-tête ;
2. `InvitationAcceptController` (~l. 53) : le 401 traduit en JSON, `'email' => $headers['X-Invitation-Email']` — le
   corps ;
3. `InvitationCodeAcceptance` (~l. 72) : `$e->with(['requires_login' => true, 'email' => $invitation->email])` — le 401
   de l'acceptation par code (là, après un code juste seulement).

**Relevé du front (2026-11-11)** : l'action `accepterInvitationAction` (`takussan-web/src/app/actions/invitations.ts`)
recopie `corps.email` dans son résultat (`{ok: false, seConnecter: true, email}`) ; **aucun composant ne lit ce champ** —
`AccepterInvitation.tsx` ne lit que `seConnecter` et mène à `/auth/login` sans préremplir. Le ticket d'écran TCK-2611
liste `email` au contrat du 401 (« se connecter à ce compte ») : masqué, il ne sert plus qu'à le **dire**, pas à
préremplir.

## Décision

**Recommandation de session, à confirmer par le porteur ; si refusée → `obsolete`.**

- **a) (recommandé)** les trois émetteurs rendent l'e-mail **masqué** par la même fonction que l'aperçu ; le front ne
  préremplit la connexion qu'avec ce que l'invité a tapé lui-même.
- b) statu quo : l'e-mail en clair au porteur du jeton (ou du code juste).

## Contrat de données

- 401 `invitation.requires_login` (lien et code) : corps `{requires_login: true, email: <masqué>}` ; en-tête
  `X-Invitation-Email: <masqué>`. La valeur masquée est **égale** à `recipient.masked` de l'aperçu de la même invitation.
- Le reste du 401 (`X-Invitation-Requires-Login`, code d'erreur, statut) est inchangé.

## Direction UX / Artistique

L'écran « connectez-vous pour accepter » peut écrire l'adresse masquée (« Connectez-vous au compte m•••@gmail.com ») ;
il ne préremplit jamais le champ e-mail avec elle.

## Contraintes strictes (métier)

- Une seule fonction de masquage (`Masking::email`), appelée par les trois émetteurs : pas de masque recopié.
- Aucune autre réponse de ces routes ne rend l'e-mail en clair à un porteur de jeton non connecté.

## Delta à produire

- [ ] `InvitationService`, `InvitationAcceptController`, `InvitationCodeAcceptance` : l'e-mail masqué.
- [ ] Front : `accepterInvitationAction` cesse de recopier l'e-mail brut (le champ disparaît du résultat, ou porte la
      valeur masquée sous un nom qui le dit) ; aucun préremplissage depuis lui.
- [ ] Tests : `InvitationRequiresLoginMaskedTest` (lien et code) ; test de l'action côté front.
- [ ] Mettre à jour le contrat cité par TCK-2611 (`email` masqué) si TCK-2611 n'est pas encore livré.

## Critères d'acceptation

- [ ] AC1 — Invitation par e-mail vers une adresse qui porte déjà un compte, acceptée sans session par le lien : 401, le
      corps `email` et l'en-tête `X-Invitation-Email` valent tous deux `recipient.masked` de `GET` l'aperçu de la même
      invitation, et ne contiennent pas l'adresse en clair.
- [ ] AC2 — Même cas par l'acceptation par code (code juste, numéro d'un autre compte) : le corps `email` vaut la même
      valeur masquée.
- [ ] AC3 — Front : le résultat de l'action, sur ce 401, ne contient pas l'adresse en clair ; le formulaire de connexion
      atteint ensuite n'a pas de champ e-mail prérempli.

## Hors périmètre

- Le SMS de `…/code` envoyé à tout numéro saisi (borné par `auth-phone-send`, comme `auth/phone/*`) : préexistant.
- La demande de nouveau lien (TCK-2726).

## Notes d'implémentation

_(à remplir par implementing-specs)_
