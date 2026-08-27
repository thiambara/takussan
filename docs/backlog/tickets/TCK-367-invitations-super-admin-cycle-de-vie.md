---
id: TCK-367
title: "Invitations super-admin — relance, annulation et expiration visibles"
status: done
phase: P2
family: full
estimate: M
wave: 46
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#onboarding-parcours
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, front, super-admin, invitations, cooptation]
---

## Objectif utilisateur

Un super-admin qui a coopté un pair peut relancer l'invitation restée sans réponse, l'annuler si elle a été envoyée par erreur, et voir quand elle expire — sans intervention en base.

## Contrat de données

- Existant : `GET /api/admin/super-admins` (actifs + invitations en attente), `POST /api/admin/super-admins/invite`.
- **Manquant, à créer** : relance et annulation d'une invitation de cooptation. Le modèle `Invitation` et son patron unifié (token signé, expiration, rappel) sont déjà en place pour les autres parcours d'invitation — ce ticket raccorde la cooptation super-admin au même mécanisme plutôt que d'en écrire un second.
- La réponse de la liste doit exposer la date d'expiration de l'invitation et la dernière connexion des super-admins actifs, aujourd'hui absentes de l'écran.

## Direction UX / Artistique

L'écran `/super-admin/super-admins` liste des actifs et des invitations en attente, et n'offre qu'une seule action : inviter. Une invitation partie à la mauvaise adresse y reste indéfiniment, sans expiration affichée, sans moyen de la relancer ni de l'annuler.

- Chaque invitation en attente porte sa date d'envoi **et** sa date d'expiration, avec relance et annulation à portée de ligne.
- Une invitation expirée se distingue d'une invitation en attente : ce sont deux états, pas deux nuances du même.
- Chaque super-admin actif affiche sa dernière connexion et l'état de son enrôlement 2FA — l'écran porte déjà le second, pas le premier.

## Contraintes strictes (métier)

- La 2FA TOTP reste **bloquante** avant qu'un coopté devienne actif : ce ticket ne touche pas cette règle.
- Toute relance et toute annulation sont **journalisées** : la cooptation d'un super-admin est déjà auditée, son cycle de vie doit l'être au même titre.
- Une relance ne crée pas une seconde invitation valable : elle réémet le lien de l'invitation existante et repousse son expiration.
- Un super-admin ne peut ni relancer ni annuler une invitation qu'il n'a pas le droit de voir ; l'autorisation passe par la capacité, jamais par un contrôle d'écran.
- Aucune action ne doit permettre de rester sans aucun super-admin actif.

## Delta à produire

- [x] Endpoints de relance et d'annulation d'une invitation de cooptation, raccordés au patron `Invitation` existant
      <br>`POST /api/admin/super-admins/invitations/{id}/{resend,revoke}`, derrière le middleware `super-admin`, déléguant à `InvitationService::{resend,revoke}()`.
- [ ] Exposition de la date d'expiration de l'invitation et de la dernière connexion des actifs dans `GET /api/admin/super-admins`
      <br>**Sans objet : les deux champs étaient DÉJÀ émis sur `origin/dev`** — `InvitationResource` porte `expires_at`, `SuperAdminInvitationController::index()` porte `last_login_at`, et les types TS les portaient aussi. Ce qui manquait était le RENDU, livré par la ligne « UI » ci-dessous. Ce qui a réellement été ajouté à la réponse est `is_expired`, calculé côté serveur (cf. notes).
- [x] Journalisation des deux nouvelles actions
      <br>`super_admin_invitation_resent` / `super_admin_invitation_revoked`, et un no-op de révocation n'écrit plus de seconde ligne (défaut D3 de la revue).
- [x] Tests backend : relance, annulation, autorisation refusée, invitation expirée, non-régression du caractère bloquant de la 2FA
      <br>`SuperAdminInvitationLifecycleTest`, 13 tests verts, 16 ablations rejouées ou inventées par la revue.
- [x] UI : actions par ligne, état « expirée » distinct, dates d'expiration et de dernière connexion
- [x] Tests frontend : relance, annulation, rendu d'une invitation expirée
      <br>Réserve écrite : aucune assertion ne porte sur la VALEUR ni la localisation des dates rendues (trou signalé par la revue, non comblé — cf. notes).

## Critères d'acceptation

- [x] AC1 — une invitation en attente peut être relancée et annulée depuis `/super-admin/super-admins`
      <br>Rendu et clics réels en jsdom, `fetch` bouchonné au niveau module. Le chaînage des chemins écran → BFF → API est mesuré séparément (`route:list` + lecture du catch-all). **Aucun aller-retour navigateur réel** — c'est la moitié non exécutée de cet AC, et elle est la même pour les six autres tickets du lot.
- [x] AC2 — une relance réémet l'invitation **existante** : le test vérifie qu'aucune seconde invitation n'est créée en base et que l'expiration a bien été repoussée
      <br>Tenu, mais **seulement après correctif** : la résurrection `expired → sent` contournait le garde-fou de dédup et laissait DEUX lignes vivantes pour le même destinataire (cf. notes).
- [x] AC3 — une invitation expirée est affichée comme expirée, distinctement d'une invitation encore valable
- [x] AC4 — un utilisateur sans la capacité requise reçoit un refus côté API, indépendamment de ce que l'UI affiche (test API direct, pas seulement test d'écran)
      <br>403 mesuré par appel API direct pour `agent`, `owner`, `broker` et un utilisateur sans profil. Réserve écrite : aucun test n'ATTRIBUE le 403 à une couche (service ou middleware) — la défense est en profondeur, on ne sait pas laquelle répond.
- [x] AC5 — la relance et l'annulation apparaissent dans le journal d'audit
- [ ] AC6 — `php artisan test --filter=SuperAdminInvitation` vert, `npm run lint` / `npx tsc --noEmit` / `npm run test` passent
      <br>**Trois quarts exécutés.** `php artisan test --filter=SuperAdminInvitation` → vert (la classe s'appelle `SuperAdminInvitationLifecycleTest` précisément pour que ce filtre attrape quelque chose : aucune classe ne portait ce préfixe). `npx tsc --noEmit` → exit 0 sur l'arbre fusionné (2026-08-27), `npm run lint` → 0 erreur. **`npm run test` et `php artisan test` en ENTIER : non lancés** (règle « Qui lance quoi », machine portant plusieurs agents). Périmètres joués : 225 tests front sur 32 fichiers, 13 + 75 + 1 tests backend. **Se coche par le rituel de fin de branche, machine au repos.**

## Hors périmètre

- **La révocation d'un super-admin actif.** Elle n'est décrite dans aucune spec et n'existe côté API : elle demande d'abord une décision produit (qui peut révoquer qui, que devient l'audit, comment on évite le verrouillage complet), donc une PR sur `docs/features.md` avant tout ticket.
- Le bootstrap par commande artisan, inchangé.
- Le mécanisme d'enrôlement 2FA lui-même.

## Notes d'implémentation

**Trois affirmations du ticket ont été contredites par la mesure, toutes dans le sens qui
sur-estime le travail restant** — le contrat de données était déjà à moitié rempli :

| Le ticket dit | Mesuré sur `origin/dev` |
|---|---|
| « La réponse de la liste doit exposer la date d'expiration … et la dernière connexion » | Les DEUX y sont déjà : `InvitationResource` émet `expires_at`, et `SuperAdminInvitationController::index()` émet `last_login_at`. Les types TS `SuperAdminPendingInvitation` / `SuperAdminEntry` les portent aussi. **Ce qui manquait est le RENDU**, pas l'exposition. |
| « **Manquant, à créer** : relance et annulation » | `InvitationService::resend()` et `::revoke()` existent depuis TCK-249, journalisent (`invitation_resent` / `invitation_revoked`) et sont exposés par `/api/invitations/{id}/{resend,revoke}`. Le delta réel est la surface super-admin, pas le mécanisme. |
| AC6 : `php artisan test --filter=SuperAdminInvitation` | **Aucune classe ne portait ce préfixe** — l'historique est `SuperAdminCooptationTest`. La nouvelle classe s'appelle `SuperAdminInvitationLifecycleTest` pour que le filtre de l'AC attrape quelque chose. |

**Décisions non évidentes :**

- **Routes dédiées plutôt que les génériques `/api/invitations/{id}/*`.** `InvitationPolicy::revoke()`
  autorise l'inviteur ET l'agency_admin de l'agence de l'invitation, et `view()` rend `true` sur
  `agency_id === null` pour tout agency_admin. Passer la cooptation par cette policy aurait fait
  dépendre une décision de plateforme de règles écrites pour l'isolation par agence. Les deux
  nouvelles routes vivent sous `/api/admin/super-admins/invitations/*`, derrière le middleware
  `super-admin`, et `assertIsCooptationInvitation()` rend **404** (pas 403) sur toute invitation
  d'agence : répondre « interdit » confirmerait son existence.

- **`is_expired` est calculé côté serveur, pas côté client.** Une invitation encore `status = sent`
  dont `expires_at` est passé EST expirée ; le cron `invitations:expire` ne tourne qu'à l'heure, si
  bien que `status` seul affiche « en attente » une invitation morte pendant jusqu'à 60 minutes. Le
  champ est posé sur `InvitationResource` (donc réutilisable tel quel par TCK-368) et non sur la
  seule réponse super-admin.

- **La relance ressuscite une invitation `expired`.** `InvitationService::resend()` refuse tout
  statut ≠ `sent` (422) ; le service de cooptation la ramène en `sent` avant de déléguer. Sans ça,
  la seule façon de relancer une invitation expirée serait `invite()`, qui crée **une seconde
  ligne** — exactement ce que la contrainte « une relance ne crée pas une seconde invitation »
  interdit. La bascule vit dans le service de cooptation, pas dans le service générique, pour ne
  pas décider à la place de TCK-368.

- **« Aucune action ne doit laisser la plateforme sans super-admin actif » est structurellement
  tenue, pas gardée par un compteur** : seule une invitation NON acceptée est annulable, donc
  l'ensemble des actifs est invariant. `test_revoking_an_invitation_leaves_the_active_super_admins_untouched`
  fige l'invariant plutôt que de le supposer.

- **Défaut préexistant, hors périmètre, non corrigé** : `InvitationPolicy::view()` laisse un
  agency_admin lire une invitation de cooptation via `GET /api/invitations/{id}` (branche
  `agency_id === null`). Le listing générique la masque, `show` non. À traiter par un ticket dédié.


## Reprise après revue adverse — 2026-08-27

La revue a rendu **refus conditionnel** : les six AC tenus et prouvés par exécution (4 ablations de
l'implémenteur rejouées rouges, 12 inventées), mais **une contrainte stricte du ticket violée par
une mesure** — « une relance ne crée pas une seconde invitation valable ». **Trois défauts, tous
corrigés, chacun prouvé par ablation.**

1. **Deux lignes vivantes pour le même destinataire** (le défaut de la contrainte). La résurrection
   `expired → sent` que ce ticket introduit contournait le garde-fou de dédup de
   `InvitationService::send()` : expirer une invitation, en réémettre une par `POST /invite`, puis
   relancer la vieille, et l'écran affiche deux invitations vivantes pour la même adresse, avec deux
   jetons ouvrants. `assertNotSupplanted()` rend désormais **409** en NOMMANT la ligne survivante.
   L'invariant posé — *au plus une ligne `sent` par destinataire coopté* — est tenu des deux côtés :
   `send()` refuse d'insérer, la résurrection refuse de ressusciter. Ablation : la seule ligne
   d'appel retirée → 409 devient 200 et le doublon reparaît.

2. **Un docblock qui affirmait une transaction inexistante.** Un envoi de courriel en échec laissait
   une invitation *zombie* — statut `sent`, jeton neuf, expiration repoussée, et personne n'a reçu
   le lien. `resendInvitation()` est réellement enveloppé dans `DB::transaction()`, le docblock
   réécrit sur ce que le code fait. Ablation : transaction remplacée par une closure auto-appelée →
   le zombie revient.

3. **Le journal comptait un no-op comme une action.** Une seconde révocation écrivait une seconde
   ligne d'audit sur une invitation déjà `revoked`. La réponse reste 200 (l'idempotence côté client
   est préservée), seule l'écriture disparaît.

### Ce qui reste ouvert

- **`InvitationPolicy::view()` laisse un `agency_admin` lire une invitation de cooptation** via
  `GET /api/invitations/{id}` (branche `agency_id === null`). Défaut **préexistant**, hors périmètre.
  Le listing générique la masque, `show` non. À traiter par un ticket dédié.
- **La course sur deux `invite()` simultanés reste ouverte pour les invitations d'AGENCE.** Le verrou
  consultatif ne couvre que la surface de cooptation ; `InvitationService::send()` fait un « lire
  puis insérer » sans verrou. La fermer partout demande un index unique partiel
  (`invitations (email, invitable_type, agency_id) WHERE status = 'sent'`), donc une migration sur
  une table partagée.
- **Aucune assertion front sur la valeur ni la localisation des dates rendues**, et **aucune
  vérification navigateur** — les trois correctifs sont côté API et se mesurent en base.
