---
id: TCK-368
title: "Équipe agence — cycle de vie des invitations (en attente, relance, révocation)"
status: done
phase: P1
family: front
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
tags: [front, admin, team, invitations]
---

## Objectif utilisateur

L'admin d'agence qui a invité un collaborateur voit son invitation tant qu'elle n'est pas acceptée, peut la relancer si elle est restée sans réponse, et l'annuler s'il s'est trompé d'adresse.

## Contrat de données

Aucun endpoint à créer. Les trois nécessaires existent et sont déjà consommés ailleurs :

- `GET /api/invitations` — liste, filtrable
- `POST /api/invitations/{invitation}/resend`
- `POST /api/invitations/{invitation}/revoke`

`src/lib/queries/owners.ts` (TCK-256) et `src/lib/queries/service-providers.ts` (TCK-249)
les appellent déjà, et `OwnersList` / `ServiceProvidersList` en rendent déjà la liste. Le
delta est du câblage, pas de la conception.

## Direction UX / Artistique

Les invitations en attente ne sont pas des membres : elles ne se mélangent pas aux lignes du
tableau. Une zone distincte, au-dessus ou dans un onglet propre, qui se replie quand elle est
vide. Chaque ligne dit à qui, quel rôle, depuis quand, et porte ses deux gestes. La révocation
demande confirmation ; la relance non — elle est réversible par une seconde révocation.

L'écran `/app/owners` a déjà tranché ces questions : s'en inspirer plutôt que rouvrir le débat.

## Contraintes strictes (métier)

- Les invitations listées sont bornées à l'agence active. Le front n'envoie jamais de
  `filter[agency_id]` : la portée vient du profil actif côté serveur.
- Une agence `individual` ne peut pas inviter de collaborateur interne
  ([§1.12](../../features.md#112-agence--équipe)) : la zone ne s'affiche pas, et son absence
  ne se lit pas comme une erreur.
- Les deux gestes sont gardés par capacité côté client, jamais par type de profil — cacher un
  bouton n'autorise rien, ce sont les policies qui décident.
- Toute lecture passe par `fields[…]`, `filter[…]` et `include=`.

## Delta à produire

- [x] Requêtes : liste / relance / révocation des invitations d'agence (le patron des deux
      modules jumeaux est réutilisable tel quel)
      <br>Les deux mutations sont **ré-exportées** depuis `owners.ts`, pas réécrites — un test compare les identités de fonction (`expect(resendInvitation).toBe(owners.resendInvitation)`) : une troisième déclaration, même à corps identique, le fait rougir.
- [x] Section « invitations en attente » dans la console Équipe
- [x] Confirmation avant révocation
- [x] Invalidation du cache après chaque geste, des deux côtés (membres ET invitations)
      <br>Livré au premier tour mais **gardé par rien** — la revue a retiré les deux `invalidateQueries` et tout est resté vert. Deux fichiers de test neufs assertent désormais les clés réellement invalidées (`admin-users` ET `agency-invitations`) ; l'ablation les fait rougir.
- [x] i18n fr/en/wo, les trois locales dans le même commit
- [x] Tests : rendu de la liste, relance, révocation, absence de la zone en agence `individual`
      <br>16 tests sur `PendingInvitationsSection`, dont deux qui cliquent la DEUXIÈME ligne d'une liste à trois : les tests du premier tour cochaient aussi un geste qui aurait toujours visé `rows[0]`.

## Critères d'acceptation

- [ ] AC1 — après une invitation envoyée depuis `/admin/team`, l'invitation apparaît dans
      l'écran **sans rechargement de page**
      <br>**Sans objet : le bouton « Inviter » de `/admin/team` ne crée AUCUNE invitation.** Mesuré le 2026-08-27 — il appelle `POST /api/agencies/{id}/members` (`AgencyController::addAgent`), qui exige un `User` déjà inscrit et attache les profils directement ; aucune ligne `invitations` n'est écrite. L'AC repose donc sur une prémisse fausse, et le raccorder est une décision de parcours, pas du câblage → **[TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md)**. Ce qui est livré tient sans lui, et l'invalidation croisée est en place des deux côtés : le jour où TCK-392 passe, AC1 devient vrai sans toucher à ce code. **Ne pas cocher cet AC tant que TCK-392 n'est pas livré.**
- [x] AC2 — la relance appelle `resend` et le confirme à l'écran ; deux relances successives
      ne créent pas deux invitations
      <br>Tenu, et **la seconde moitié n'est plus tenue par accident** : la relance accepte désormais une invitation `expired` et la RESSUSCITE au lieu de laisser l'admin repasser par « Inviter », qui posait une seconde ligne. `assertSlotIsFree()` refuse la résurrection par un 409 quand une ligne vivante supplante la morte. Compte pris sur l'e-mail, pas sur l'id.
- [x] AC3 — la révocation demande confirmation, puis fait disparaître la ligne
- [x] AC4 — en agence `individual`, aucune section d'invitation n'est rendue
- [x] AC5 — `grep -rn "invitations" src/components/admin/` trouve les trois appels ; aucun
      d'eux n'est une re-déclaration de ce que `owners.ts` expose déjà (vérifier par lecture,
      pas par compte)
      <br>Exécuté le 2026-08-27 : `InviteMemberButton.tsx`, `TeamConsole.tsx`, `PendingInvitationsSection.tsx`. Vérifié par lecture ET par un test d'identité de fonction.
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      <br>**Deux tiers exécutés.** `npx tsc --noEmit` → exit 0 sur l'arbre fusionné (2026-08-27) — l'erreur TS7006 que le fichier neuf `InviteMemberButton.test.tsx` a portée en cours de lot est corrigée. `npm run lint` → 0 erreur. **`npm run test` en ENTIER : non lancé**, ni par l'implémenteur, ni par la revue, ni par le correcteur (règle « Qui lance quoi »). Le plus large périmètre joué est 72 fichiers / 402 tests sur `src/components/console src/app src/components/admin`. **Se coche par le rituel de fin de branche, machine au repos.**

## Hors périmètre

- L'invitation de propriétaires et de prestataires depuis cette console : les deux ont leur
  écran dédié (`/app/owners`, `/app/maintenance/providers`) et les y déplacer est une décision
  de navigation, pas un raccord.
- Les invitations de cooptation super-admin — TCK-367.
- Les relances automatiques ou programmées.

## Notes d'implémentation

**AC1 n'est pas atteignable, et ce n'est pas un manque de câblage.** Mesuré le 2026-08-27 : le
bouton « Inviter » de `/admin/team` appelle `POST /api/agencies/{id}/members`
(`AgencyController::addAgent`), qui **exige un `User` déjà inscrit** et attache les profils
directement — **aucune ligne `invitations` n'est créée**. L'endpoint qui en crée une,
`POST /api/agencies/{agency}/agents/invite` (TCK-258, complet jusqu'au mail et au garde
`kind=individual`), **n'a aucun appelant dans le front**. Le raccorder change la sémantique de
l'écran (rôles offerts, champs du formulaire, sort du cas `agency_admin` qu'aucun chemin
d'invitation ne couvre) — c'est une décision de parcours, pas le « câblage » que ce ticket
annonce. → **[TCK-392](TCK-392-inviter-depuis-admin-team-nenvoie-aucune-invitation.md)**.

Ce qui est livré ici tient sans lui : la zone liste **toutes** les invitations en attente de
l'agence, y compris celles que les assistants Propriétaire et Prestataire créent déjà. Et
l'invalidation croisée est en place des deux côtés, si bien que le jour où TCK-392 passe, AC1
est vrai sans toucher à ce code.

**Le rôle est affiché, donc la zone n'est pas bornée aux rôles internes.** « Chaque ligne dit à
qui, **quel rôle**, depuis quand » suppose plusieurs rôles. Filtrer sur `agent|agency_admin`
aurait rendu la zone vide en pratique (cf. ci-dessus) tout en cachant les seules invitations qui
existent réellement.

**Pas d'`include=`, délibérément.** `InvitationResource::toArray()` n'émet aucune relation :
un `include=inviter` serait chargé côté serveur puis jeté à la sérialisation.

**Les deux mutations sont ré-exportées depuis `owners.ts`, pas réécrites** — `service-providers.ts`
en porte déjà une seconde copie mot pour mot (lignes 144 et 154). Un test compare les identités de
fonction (`expect(resendInvitation).toBe(owners.resendInvitation)`) : une troisième déclaration,
même à corps identique, le ferait rougir.

**~~`is_expired` (TCK-367) n'est pas consommé ici~~ — révoqué par la reprise du 2026-08-27.**
C'était vrai au premier tour ; la revue a montré que lister les seuls `sent` renvoyait l'admin sur
« Inviter » dès qu'une invitation mourait, c'est-à-dire sur le doublon. Le champ est désormais
consommé (cf. section suivante).

Ablations vérifiées (8, toutes rouges puis vert restauré) : garde `individual` retirée · révocation
câblée sans confirmation · zone qui ne se replie plus · `filter[agency_id]` renvoyé par le front ·
relance muette · `visibleScope` sans borne d'agence · relance qui duplique la ligne · `revoke()` qui
ne change pas le statut.


## Reprise après revue adverse — 2026-08-27

La revue a rendu **REFUSÉ**. Elle a d'abord prouvé par exécution ce que l'implémenteur n'avait que
déduit — **l'isolation par agence tient** : admin d'une autre agence 403/403/403, agent de la bonne
agence liste vide + 403/403, utilisateur sans profil 0 ligne + 403/403. Puis elle a montré que deux
des trois AC exécutés l'étaient par des tests qu'une régression cocherait aussi, et que le seul
demi-livrable offert en remplacement d'AC1 — l'invalidation croisée — pouvait être **entièrement
retiré sans un seul rouge**. **Huit défauts, huit corrigés, chacun ablation-vérifié.**

**Ce qui a changé de comportement :**

- **La relance ressuscite une invitation expirée**, au lieu de la refuser en 422 et de laisser
  l'admin repasser par « Inviter » — le chemin qui posait une seconde ligne. La garde de
  supplantation (`assertSlotIsFree()`) est le seul point qui pouvait augmenter le nombre de lignes
  vivantes ; le couple gardé `(email, invitable_type, agency_id)` s'écrit désormais **une seule
  fois**, lu par `send()` comme par `resend()`.
- **La liste sert les expirées et les marque** (`filter[status]=sent,expired` + badge « Expirée »),
  parce que lister sans donner de geste dessus produit une ligne qu'on regarde sans pouvoir agir.
- **Un envoi de courriel en échec ne laisse plus l'invitation dans un état intermédiaire** :
  bascule du jeton, envoi et journal roulent ou tombent ensemble, la ligne étant relue sous
  `lockForUpdate()`. Corrigé **dans `InvitationService::resend()`**, donc les deux surfaces en
  héritent : la cooptation super-admin n'est plus protégée par accident (TCK-367), elle l'est deux
  fois.
- **La pagination est réelle.** Le badge affichait `rows.length` — un compte faux à l'écran, pas
  seulement une troncature — et les paramètres `page`/`perPage` étaient testés sans appelant. Ils en
  ont un ; `agencyInvitationKeys.all` reste un préfixe, donc l'invalidation emporte toutes les pages.
- **`InvitationPolicy::revoke()` accepte la capacité `team.invite` en plus du profil d'admin.**
  L'écran gardait par capacité, la policy par type de profil : les deux docblocks décrivaient un
  mécanisme que le code ne portait pas. L'écart est refermé dans le sens **permissif**, celui qui
  n'invente aucune autorisation — rien de ce qui était refusé ne l'est encore.
- **`invited_by` ne franchit plus la frontière d'agence.** Un ex-admin pouvait relancer et révoquer
  les invitations qu'il avait lui-même émises dans l'agence qu'il a quittée. Le court-circuit ne
  survit que pour les invitations SANS agence (cooptation, assistants hors agence), où il n'existe
  aucune frontière à faire respecter. L'id **TCK-429**, réservé pour reporter ce défaut, n'a pas
  été consommé : il est corrigé, pas reporté.
- **Deux gestes visaient la bonne ligne, sans qu'aucun test le vérifie**, et une panne côté serveur
  était muette à l'écran. Quatre tests neufs les gardent, dont deux qui cliquent la **deuxième**
  ligne d'une liste à trois — `rows[rows.length - 1]` aurait été un second raccourci vert.

### Ce qui reste ouvert, écrit et non corrigé

**La garde de supplantation ferme la SÉQUENCE, pas la COURSE.** Deux `invite()` réellement
simultanés sur un destinataire sans ligne existante passent encore : `send()` fait un INSERT, et
aucun verrou de ligne ne bloque un INSERT. Généraliser le verrou consultatif de la cooptation a été
**tenté puis reculé** — mesuré, `SuperAdminInvitationLifecycleTest::test_both_write_paths_serialize_on_the_same_advisory_lock`
passe de 2 verrous à 4 et rougit ; le faire proprement demande de retirer le verrou de
`SuperAdminCooptationService` (un seul point de sérialisation, pas deux), donc d'éditer des fichiers
tenus par un autre correcteur. **Ce reste est celui que `send()` portait déjà avant ce ticket** — il
n'en ajoute pas. Écrit dans le docblock d'`assertSlotIsFree()`.
