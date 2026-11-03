---
id: TCK-272
title: Suppression de compte — step-up alternatif pour les comptes sans mot de passe utilisable
status: done
phase: P2
family: applicatif
estimate: M
wave: 25
created: 2026-05-12
updated: 2026-08-16
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

- [x] Migration : exposer / dériver le flag "a-t-il défini son propre mot de passe"
      (ex. `users.password_set_at` nullable timestamp), backfill cohérent pour les
      comptes existants (NULL pour OAuth provisionnés, `created_at` pour les autres
      par défaut).
- [x] `User` model : accessor `hasUsablePassword(): bool` + maintenance du
      `password_set_at` sur set/reset password (register, reset, change-password).
- [x] `UserResource` : ajouter `has_usable_password` (ou équivalent) à la
      sérialisation `/api/auth/me`.
- [x] `RequestAccountDeletionRequest` : assouplir la règle `password` —
      conditionnellement requise quand `has_usable_password`, sinon le user doit
      fournir la preuve alternative définie en Notes d'implémentation.
- [x] `AccountDeletionService` (et/ou nouveau service dédié) : valider la preuve
      alternative côté serveur, avec scellement anti-rejeu.
- [x] Routes / endpoints nécessaires à la preuve alternative (ex. issuance d'un
      code email, callback re-redirect OAuth) — à décider en Notes d'implémentation.
- [x] Frontend `AccountDeletionDialog` : brancher sur `has_usable_password` pour
      router vers la bonne UI (password vs preuve alternative) ; conserver le
      gating `pending`, l'affichage des `obligations`, le step 1 raison inchangé.
- [x] Server actions `app/actions/account-deletion.ts` mises à jour pour porter
      la preuve alternative.
- [x] Tests backend :
  - [ ] `RequestDeletionTest` — user OAuth-only sans password ne peut pas
        envoyer un password (422) ; doit fournir la preuve alternative.
  - [ ] `RequestDeletionTest` — user OAuth-only fournissant la preuve
        alternative valide + 2FA si actif → 202 + `scheduled_for`.
  - [ ] `RequestDeletionTest` — preuve alternative expirée / rejouée → 422.
  - [ ] `RequestDeletionTest` — user mixte (OAuth + password défini) doit
        encore pouvoir utiliser son password.
- [x] Tests frontend (vitest) : `AccountDeletionDialog` rend le mode adéquat
      selon `has_usable_password` ; soumission OK / KO sur chaque branche.

## Critères d'acceptation

- [x] AC1 — Un user créé exclusivement via OAuth (`google_id` set, jamais de
      reset password) voit dans `/app/profile` un parcours de suppression qui
      ne lui demande pas de mot de passe.
      *(Correction : le ticket citait `/app/profile/security`, route qui
      n'existe pas — `ProfileSecuritySection` est rendu dans `/app/profile`.)*
- [x] AC2 — Le même user peut compléter la suppression avec la preuve alternative
      retenue (raison + step-up alternatif + 2FA si actif) → 202 + email +
      `scheduled_for` à J+30 (mêmes garanties que TCK-080 AC1).
- [x] AC3 — Un user qui a défini son mot de passe (signup email/password ou
      reset après OAuth) reste sur le flux password historique de TCK-080, sans
      régression.
- [x] AC4 — Tenter d'envoyer `password` sur un compte OAuth-only renvoie 422
      avec un message clair pointant la voie alternative.
- [x] AC5 — Rejouer la même preuve alternative deux fois → 422 sur le second
      essai.
- [x] AC6 — Le flag `has_usable_password` exposé à `/api/auth/me` reflète
      fidèlement l'état réel du compte (backfill couvert par un test).
- [x] AC7 — L'audit log conserve la trace du mode de step-up utilisé
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

### Les deux décisions produit, tranchées le 2026-08-15

**1. La preuve alternative est un CODE À 6 CHIFFRES ENVOYÉ PAR E-MAIL**, valable
5 minutes, à usage unique. Motif : le produit sait déjà faire exactement cela
(`PhoneVerificationService`), et `users.email` est NOT NULL pour tout le monde
alors que le provisioning OAuth ne renseigne jamais `phone`.

Les deux autres options du ticket ont été écartées :
- **re-redirect OAuth** — fait dépendre un acte destructif d'un service
  extérieur au moment précis de la suppression ;
- **gating « définissez d'abord un mot de passe »** — c'est demander à
  quelqu'un qui s'en va de se créer un identifiant, soit le reproche de départ
  du ticket, simplement affiché poliment.

**2. La porte s'ouvre aux TROIS populations bloquées**, pas aux seuls comptes
sociaux. Le critère implémenté est donc **« ce compte a-t-il un mot de passe
UTILISABLE »** (`users.password_set_at`), et non « ce compte est-il social » :
les invités qui n'ont jamais choisi de mot de passe et les admins d'agence
provisionnés étaient piégés à l'identique.

### Ce que le backfill classe bien, et ce qu'il classe mal

Le même texte figure en tête de la migration
`2026_08_15_100000_add_password_set_at_to_users_table.php`, parce que c'est là
qu'on le cherchera le jour où un compte se retrouvera sur le mauvais parcours.

Règle appliquée : `password_set_at = created_at` pour tout compte SANS
identifiant social ; NULL pour les porteurs de `google_id` / `facebook_id` /
`apple_id`.

| Population | Classement | Conséquence |
|---|---|---|
| Inscription e-mail/mot de passe | ✅ juste | parcours mot de passe, inchangé |
| Inscription OAuth pure | ✅ juste | parcours code e-mail — **déblocage** |
| Invitation acceptée SANS mot de passe | ❌ « a un mot de passe » | **reste bloqué** jusqu'à un « mot de passe oublié » |
| Admin d'agence provisionné | ❌ « a un mot de passe » | **reste bloqué**, idem |
| Compte OAuth ayant DEPUIS fait un reset | ❌ « pas de mot de passe » | bénin : code e-mail au lieu du mot de passe, non bloquant |

**Pourquoi on ne fait pas mieux.** Les deux populations mal classées n'ont
aucun marqueur en base qui les distingue d'une inscription ordinaire — ni
colonne, ni ligne conservée (`password_reset_tokens` est purgée à l'usage).
Les basculer à NULL par prudence ouvrirait la voie e-mail — la plus faible —
à **tous** les comptes ordinaires, ce que la décision produit interdit
explicitement. L'erreur retenue est donc celle qui ne dégrade la sécurité de
personne. **Le code neuf, lui, est exact** : les sites d'écriture sont
instrumentés à partir de ce ticket, et un simple « mot de passe oublié »
rattrape n'importe quel compte mal classé.

### Où `password_set_at` est écrit — et où il ne l'est délibérément pas

`password_set_at` est **hors `$fillable`** : il n'est jamais écrit depuis un
payload, seulement par `User::markPasswordAsSet()`.

| Chemin | Écrit ? |
|---|---|
| `AuthController::register` | ✅ `now()` |
| `PasswordResetController::resetPassword` | ✅ `now()` |
| `InvitationService::acceptAsNewUser` **avec** mot de passe | ✅ `now()` |
| `InvitationService::acceptAsNewUser` **sans** mot de passe (`Str::random(40)`) | ❌ reste NULL |
| `OAuthProvisioningService` (`Str::random(32)`) | ❌ reste NULL |
| `AgencyProvisioningService` (`Str::password(32)`) | ❌ reste NULL |

Il n'existe aucun endpoint authentifié de changement de mot de passe : rien de
plus à instrumenter.

### Anti-rejeu : quand exactement le code est consommé

`DeletionStepUpService` scinde délibérément `verifyCode()` (lit, ne consomme
pas) et `consumeCode()` (efface) — c'est le seul écart de fond avec
`PhoneVerificationService`, dont le `verifyOtp()` fait les deux d'un bloc.

Le code n'est consommé **qu'à la toute fin** de `withValidator()`, une fois le
2FA validé *et* le pré-contrôle des obligations passé. Brûler le code plus tôt
ferait perdre son code à quelqu'un dont le TOTP a glissé d'un pas ou dont un
bail est encore ouvert, et le pousserait à en réémettre en boucle. La
consommation reste dans la **même requête** que la suppression : il n'y a pas
de fenêtre de rejeu exploitable. Deux tests couvrent chacun de ces deux
sursis (`..._not_burnt_when_obligations_block...`, `two_factor_stays_mandatory...`).

### Le point de sécurité le plus délicat

La branche est calculée **exclusivement** depuis
`$this->user()->hasUsablePassword()`. La faire dépendre d'une valeur du payload
(`required_if:mode,…`) rendrait la suppression exécutable sans aucune preuve :
il suffirait au client d'annoncer le mode le plus faible. Les deux champs sont
mutuellement `prohibited`, avec des messages qui **orientent** au lieu
d'accuser : un `password` envoyé sur un compte à mot de passe machine reçoit
« Ce compte n'a pas de mot de passe : confirmez avec le code reçu par e-mail. »
et non plus « Mot de passe incorrect. ».

### Débit

`throttle:account-deletion-step-up` — limiteur **nommé** (il n'y a pas de
`throttle:api` global), clé = l'utilisateur et non l'IP puisque la route est
authentifiée, deux bornes : 3/min contre le martèlement, 10/h contre le
mail-bombing d'une adresse dont on détiendrait le jeton. Le service pose en
plus un cooldown de 60 s en cache : **le limiteur borne les requêtes, le
cooldown borne les e-mails**. La réponse reste un 202 invariant même pendant
le cooldown — le temps de réponse ne doit rien apprendre.

### Surfaces

- `POST /api/auth/me/deletion-request/step-up` → 202 (message invariant), 422
  si le compte a un mot de passe utilisable.
- `POST /api/auth/me/deletion-request` accepte désormais `step_up_code` à la
  place de `password`, selon ce que le serveur a décidé.
- `GET /api/auth/me` expose `has_usable_password`.
- L'activity log `account.deletion.requested` porte `step_up` =
  `password` | `email_code`.
- Côté front, le défaut de `hasUsablePassword` est **`true`** :
  `useAuth()` ne lève pas hors provider et rend `user === null`, or un défaut
  `false` afficherait la voie la plus faible à tout le monde le temps d'un
  chargement.
