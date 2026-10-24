---
id: TCK-2192
title: "L'acceptation d'une invitation n'active qu'un profil en brouillon, et refuse un profil suspendu ou inactif"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-208--lendpoint-générique-post-apiinvitations-face-aux-services-dinvitation-par-rôle"
tags: [api, invitations, autorisation, pistes]
---

## Objectif

`InvitationService::finalizeAccept()` ne fait passer `active` qu'un profil `draft`, laisse un profil
`active` tel quel, et refuse l'acceptation devant un profil suspendu ou inactif, sans rien écrire.

## Contexte

Réf : **P208.02** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : `finalizeAccept` ne fait passer `active` qu'un profil `draft` ; un profil déjà `active` reste tel quel ; un profil `suspended` ou `inactive` fait refuser l'acceptation par un refus nommé, l'invitation intacte ; garde sur le chemin générique et sur le prestataire réutilisé

- `finalizeAccept()` posait `status = active` sur tout profil visé : une invitation qui visait le
  profil suspendu d'un autre compte levait la suspension, sans journal de réactivation.

## Hypothèses (mode sans humain)

- **Le refus est `409 invitation.profile_unavailable`**, porté par `lang/{fr,en,wo}/errors.php`
  (wolof : le français tel quel, wolof en pause). 409 comme les autres conflits de l'acceptation
  (collaboration de prestataire déjà active).
- **`blocked` (bailleur) se traite comme `suspended`** : tout statut autre que `draft` ou `active`
  refuse. Les quatre enums de profil n'ont pas d'autre valeur.
- **Le refus tombe avant toute écriture** : dans la transaction de l'acceptation, si bien que le
  compte neuf (branche « nouvel utilisateur ») n'est pas créé et que l'invitation reste `sent`.

## Delta à produire

- [x] `finalizeAccept()` : statut du profil lu avant toute écriture, refus nommé hors de
  `draft` / `active`, bascule seulement depuis `draft`.
- [x] Clé `errors.invitation.profile_unavailable` en `fr`, `en`, `wo`.
- [x] `AcceptationNActiveQueLeBrouillonTest`.

## Critères d'acceptation

- [x] AC1 — Profil d'agent `suspended` d'un autre compte : acceptation par un compte neuf → 409
  `invitation.profile_unavailable` ; profil suspendu, titulaire inchangé, invitation `sent`,
  aucun compte créé.
- [x] AC2 — Profil d'agent `inactive`, bailleur `blocked` → 409, rien d'écrit.
- [x] AC3 — Prestataire réutilisé `suspended` → 409, aucune collaboration créée.
- [x] AC4 — Témoins : prestataire `active` → 200, reste `active` ; brouillon → 200, passe `active`.

## Hors périmètre

- Le libellé côté front : la page d'acceptation affiche le message de l'API (`messageErreurApi`),
  sans clé propre au code.

## Notes d'implémentation

- Avant correctif : les quatre refus rendaient 200, et le profil suspendu repassait `active`.
- Ablation (condition du refus à `false`) → 4 rouges sur 6 ; remise → 6 verts.
