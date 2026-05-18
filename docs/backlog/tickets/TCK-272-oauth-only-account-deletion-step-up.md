---
id: TCK-272
title: Suppression de compte — step-up alternative pour comptes OAuth-only
status: todo
phase: P2
family: applicatif
estimate: M
created: 2026-05-12
updated: 2026-05-12
depends_on: [TCK-080]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, front, auth, rgpd, oauth]
---

## Objectif utilisateur

Un utilisateur qui s'est uniquement connecté via OAuth (Google / Facebook / Apple) peut
supprimer son compte (droit RGPD) sans devoir d'abord passer par "Mot de passe oublié"
pour se créer un mot de passe artificiel.

## Contrat de données

**Modèles** : `User` (cf. `spec_refs.models`). Colonnes `google_id`, `facebook_id`,
`apple_id` déjà présentes ; un mot de passe `bcrypt(Str::random(32))` est assigné à
l'inscription OAuth — il n'est jamais connu de l'utilisateur. Aucune colonne ne
permet aujourd'hui de distinguer un mot de passe "défini par l'utilisateur" d'un
mot de passe "généré au signup OAuth".

**Endpoints concernés** :
- `POST /api/auth/me/deletion-request` (TCK-080) — accepte aujourd'hui uniquement
  `password` + éventuel `two_factor_code` ; le payload doit accueillir une preuve
  alternative pour les comptes sans mot de passe utilisateur.
- `GET /api/auth/me` (ou `UserResource`) — doit exposer un flag permettant au
  frontend de choisir le mode de step-up à présenter.

**Décision attendue dans `Notes d'implémentation`** : quelle preuve alternative
adopter parmi (a) code OTP email, (b) re-redirect OAuth provider, (c) gating UI
"définissez d'abord un mot de passe". Cf. Contraintes strictes pour les exigences.

## Contraintes strictes (métier)

- **Aucun bypass de la preuve de possession** — la suppression reste un acte
  destructif soumis à step-up auth ; la preuve alternative doit être au moins
  équivalente en force au password classique (TCK-080 §"Ré-authentification obligatoire").
- **Le 2FA reste obligatoire** s'il est activé, quelle que soit la voie de step-up
  retenue (cohérence avec TCK-080).
- **Le flag exposé au frontend doit être véridique** — un user qui s'est inscrit
  par email/password puis a aussi lié un compte Google reste en mode "password"
  (il en a un, qu'il connaît).
- **Le frontend ne doit jamais deviner** : seul le backend décide quel(s) mode(s)
  de step-up sont acceptés pour un user donné.
- **Anti-rejeu** sur le canal alternatif retenu (TTL court sur OTP email, nonce
  consommé une fois sur re-redirect OAuth).
- **Locale FR** — messages, libellés et emails reprennent le ton déjà établi
  pour les flux auth (cf. `lang/fr/account.php`, `lang/fr/auth.php`).

## Delta à produire

- [ ] Migration : exposer / dériver le flag "a-t-il défini son propre mot de passe"
      (ex. `users.password_set_at` nullable timestamp), backfill cohérent pour les
      comptes existants (NULL pour OAuth provisionnés, `created_at` pour les autres
      par défaut).
- [ ] `User` model : accessor `hasUsablePassword(): bool` + maintenance du
      `password_set_at` sur set/reset password (register, reset, change-password).
- [ ] `UserResource` : ajouter `has_usable_password` (ou équivalent) à la
      sérialisation `/api/auth/me`.
- [ ] `RequestAccountDeletionRequest` : assouplir la règle `password` —
      conditionnellement requise quand `has_usable_password`, sinon le user doit
      fournir la preuve alternative définie en Notes d'implémentation.
- [ ] `AccountDeletionService` (et/ou nouveau service dédié) : valider la preuve
      alternative côté serveur, avec scellement anti-rejeu.
- [ ] Routes / endpoints nécessaires à la preuve alternative (ex. issuance d'un
      code email, callback re-redirect OAuth) — à décider en Notes d'implémentation.
- [ ] Frontend `AccountDeletionDialog` : brancher sur `has_usable_password` pour
      router vers la bonne UI (password vs preuve alternative) ; conserver le
      gating `pending`, l'affichage des `obligations`, le step 1 raison inchangé.
- [ ] Server actions `app/actions/account-deletion.ts` mises à jour pour porter
      la preuve alternative.
- [ ] Tests backend :
  - [ ] `RequestDeletionTest` — user OAuth-only sans password ne peut pas
        envoyer un password (422) ; doit fournir la preuve alternative.
  - [ ] `RequestDeletionTest` — user OAuth-only fournissant la preuve
        alternative valide + 2FA si actif → 202 + `scheduled_for`.
  - [ ] `RequestDeletionTest` — preuve alternative expirée / rejouée → 422.
  - [ ] `RequestDeletionTest` — user mixte (OAuth + password défini) doit
        encore pouvoir utiliser son password.
- [ ] Tests frontend (vitest) : `AccountDeletionDialog` rend le mode adéquat
      selon `has_usable_password` ; soumission OK / KO sur chaque branche.

## Critères d'acceptation

- [ ] AC1 — Un user créé exclusivement via OAuth (`google_id` set, jamais de
      reset password) voit dans `/app/profile/security` un parcours de
      suppression qui ne lui demande pas de mot de passe.
- [ ] AC2 — Le même user peut compléter la suppression avec la preuve alternative
      retenue (raison + step-up alternatif + 2FA si actif) → 202 + email +
      `scheduled_for` à J+30 (mêmes garanties que TCK-080 AC1).
- [ ] AC3 — Un user qui a défini son mot de passe (signup email/password ou
      reset après OAuth) reste sur le flux password historique de TCK-080, sans
      régression.
- [ ] AC4 — Tenter d'envoyer `password` sur un compte OAuth-only renvoie 422
      avec un message clair pointant la voie alternative.
- [ ] AC5 — Rejouer la même preuve alternative deux fois → 422 sur le second
      essai.
- [ ] AC6 — Le flag `has_usable_password` exposé à `/api/auth/me` reflète
      fidèlement l'état réel du compte (backfill couvert par un test).
- [ ] AC7 — L'audit log conserve la trace du mode de step-up utilisé
      (`password` vs `<alternative>`) sur l'événement `account.deletion.requested`.

## Hors périmètre

- Refonte de la session step-up générique (réutilisable pour d'autres flux
  sensibles type "disable 2FA", "change email") — sortira d'un ticket dédié si
  un troisième besoin émerge.
- Suppression initiée par un admin / super-admin (chemin séparé déjà mentionné
  dans TCK-080).
- Export RGPD (TCK-225) — orthogonal.
- Magic link de connexion (P3 cf. `features.md §2.1`).
- Changement du contrat d'anonymisation post-exécution (TCK-080 §"Anonymisation"
  reste la référence).

## Notes d'implémentation

_(à remplir par implementing-specs)_
