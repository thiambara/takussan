---
id: TCK-2940
title: "Recevoir le code d'une invitation par appel vocal"
status: todo
phase: P3
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2948]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [back, entree, invitation, code, appel, fournisseur, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité qui ne reçoit pas le SMS se fait dicter le code par un appel.

## Contrat de données

Écart de TCK-2611 (`#6`, « `/code` n'envoie qu'un SMS »), sans ticket. La maquette : « Rien reçu ? Renvoyer le code dans 0:38, ou le recevoir par appel. »

- `POST /api/public/invitations/{token}/code` accepte `channel: "voice"` : même code, même durée de validité, dicté par un appel automatique au numéro.

## Contraintes strictes (métier)

- **Nouveau fournisseur** (appel vocal sortant) : l'ADR s'écrit AVANT (numéro suivant libre) — choix du fournisseur, coût, données transmises (numéro et code seulement), drapeau d'activation ; voir [ADR-0033](../../../adr/0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) § 5-6 et [ADR-0060](../../../adr/0060-code-sms-affiche-hors-production.md) (code affiché hors production, valable aussi pour la voix).
- Sans clé du fournisseur : implémenter derrière un pilote (`log` en local / test) et vérifier sur la documentation du fournisseur ; la voie est désactivée tant que la clé manque (`404` ou `channel` refusé en 422, au choix de l'ADR).
- Même limiteur et même verrou que le SMS ; l'appel ne double pas le nombre d'essais.

## Delta à produire

- [ ] ADR « le code se dicte aussi par appel ».
- [ ] Contrat `VoiceCodeSender` + pilote `log` + pilote du fournisseur ; drapeau de configuration ; clé dans `.env.example` (garde `check-env-parity`).
- [ ] `channel: voice` sur `…/code`.
- [ ] Tests : `InvitationVoiceCodeTest` (pilote `log` reçoit numéro et code ; limiteur partagé ; drapeau éteint).

## Critères d'acceptation

- [ ] AC1 — Drapeau allumé, `POST …/code` avec `channel: "voice"` appelle le pilote avec le numéro et le code, et `…/verify` accepte ce code.
- [ ] AC2 — Un SMS puis un appel dans la même fenêtre consomment le même limiteur ; le code reste le même.
- [ ] AC3 — Drapeau éteint, `channel: "voice"` est refusé comme l'ADR le fixe, et le SMS fonctionne inchangé.

## Hors périmètre

- La connexion par numéro hors invitation (même mécanisme possible, ticket à part si voulu).
- L'écran (TCK-2948).

## Notes d'implémentation

_(à remplir par implementing-specs)_
