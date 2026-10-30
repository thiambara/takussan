---
id: TCK-2413
title: "Radar : le super-admin délie le compte supprimé qui bloquait la réclamation, et l'annonce que la publication laisse à l'opérateur le dit"
status: done
phase: P1
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2390, TCK-2391]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, support, public, adr-0077]
---

## Objectif utilisateur

L'annonceur dont le compte créé par le Radar a été supprimé peut de nouveau réclamer ses annonces,
une fois que le super-admin l'a délié ; et l'annonceur dont une annonce attend l'équipe le lit
honnêtement sur la page de réclamation, pendant que l'opérateur la trouve dans sa file.

## Contexte

Deux suites de [TCK-2390](TCK-2390-radar-reclamation-par-l-annonceur.md) (§ « Suites »),
[ADR-0077](../../adr/0077-le-radar.md) §3, §6, §11.

1. **Compte du Radar supprimé** : tant que `radar_advertisers.user_id` vise un compte A supprimé
   (doucement), `RadarClaims::state()` rend `support` si un compte B a vérifié le numéro (A n'est pas
   « jamais servi »), `unavailable` sinon (`AdvertiserProvisioner::accountUnavailable()`). Aucun outil
   du support ne remet ce champ à zéro : l'annonceur ne peut plus rien réclamer.
2. **L'annonce que le job laisse à l'opérateur** : `PublishClaimedRadarListings` laisse `consented`
   ce qu'il ne peut pas publier (aucune photo en réserve, champ requis manquant, refus de la
   publication) sans rien écrire. La page la range encore dans `publishing` — « en cours de
   publication » — et aucune file de la console ne la montre.

## Contrat de données

- `POST /api/admin/radar/advertisers/{advertiser}/release-account` — motif facultatif. Gardé par
  `super-admin` + `platform-can:platform.radar.publish`. Remet `user_id` à `null` si le compte
  rattaché est supprimé ; 409 sinon, ou si l'annonceur est révoqué (STOP, `do_not_contact`, accord
  retiré, numéro purgé). Journalisé (`radar_account_released`).
- Fiche annonceur (`GET /api/admin/radar/advertisers/{advertiser}`) : `account` (le compte rattaché,
  supprimé ou non, si le geste est offert, et `claimed` : l'annonceur a réclamé avec ce compte, sinon le
  Radar l'a créé), le `stage_reason` et le `purge_at` de chaque annonce.
- `filter[queue]=left_to_operator` sur `GET /api/admin/radar/advertisers` ; chaque ligne de la liste
  porte `left_purge_at`, l'échéance de purge de sa première annonce laissée (`null` : aucune).
- `GET /api/radar/claims/{token}` : `awaiting_review`, les annonces réclamées que la publication a
  laissées à l'équipe, sorties de `publishing`.

## Contraintes strictes (métier)

- Le geste ne contourne jamais STOP, `do_not_contact` ni la révocation : il les refuse.
- Il ne délie qu'un compte **supprimé** ; un compte bloqué ou un espace suspendu reste une décision du
  support, que le geste ne défait pas.
- La page publique ne dit pas pourquoi l'annonce attend (rien du Radar interne) ; la console le dit.

## Delta à produire

- [x] Service et route du geste, journalisé, avec sa garde de capacité.
- [x] Fiche : `account`, `stage_reason` des annonces ; front : le geste et son dialogue.
- [x] Job : chaque annonce qu'il laisse porte le code de la raison dans `stage_reason`, y compris
      quand sa fenêtre expire.
- [x] File `left_to_operator` (API + onglet).
- [x] Page de réclamation : `awaiting_review`, et son texte.

## Critères d'acceptation

- [x] AC1 — Après le geste sur un annonceur dont le compte A est supprimé, la page de réclamation
      ne rend plus `support` (ni `unavailable`), et la réclamation aboutit ; le geste est journalisé.
- [x] AC2 — Le geste est refusé (409) sur un annonceur révoqué, après STOP, ou dont le compte n'est
      pas supprimé ; sans `platform.radar.publish`, 403.
- [x] AC3 — Une annonce que le job laisse (sans photo, champ manquant, refus) sort de `publishing`
      pour `awaiting_review` sur la page, et l'annonceur apparaît dans `left_to_operator`.

## Hors périmètre

- La relance d'activation et le mandat (TCK-2394).
- Un bien publié puis retiré par la modération : il n'est plus une annonce que le job laisse.

## Notes d'implémentation

- **Re-mesure (2026-10-30)** : les deux défauts tenaient. Compte A supprimé : `RadarClaims::state()` rend
  `support` quand un compte B a vérifié le numéro (`orphanAbsorbable()` refuse un compte qui ne
  peut plus ouvrir de session), et `unavailable` sinon (`AdvertiserProvisioner::accountUnavailable()`) —
  le ticket parent ne nommait que le premier. Une suppression **définitive** ne bloque rien
  (`radar_advertisers.user_id` est `nullOnDelete`) : seule la suppression douce bloque. Annonce
  laissée : le job ne laissait aucune trace (ni étape, ni motif), seulement un `Log::warning` pour un
  refus ; `show()` la rangeait dans `publishing`.
- **Le marqueur est `stage_reason` sur une annonce `consented`** : aucun autre chemin n'écrit de motif
  sur une annonce `consented` (relevé : `grep -rn stage_reason app`), la publication par l'opérateur
  le remet à `null` (`RadarPublisher::publishLocked`). Codes : `radar.publish.no_photo`,
  `radar.publish.missing_field`, le code du refus de la publication, `radar.publish.photos_pending` ou
  `radar.claim.publish_failed` à l'abandon (`failed()`), `radar.advertiser.account_unavailable` si le
  compte ou l'espace a disparu. Posé par une mise à jour conditionnelle (`stage = consented`) : une
  annonce publiée entre-temps n'en garde aucun (testé par un `DB::listen`).
- **Rien n'est posé après un STOP ou une révocation** : l'annonce s'y ferme.
- **Le geste laisse le compte supprimé tel quel**, ses biens compris : il ne rouvre ni ne réunit rien.
- **Vérification adverse (2026-10-30, « prêt », six mineurs)** — traités :
  - **M1** : `origin/dev` fusionnée (#1585 et la spec #1588), sans conflit.
  - **M2** : rapport écrit sous `.superpowers/rapport-TCK-2413.md`.
  - **M4** : la fiche disait « le compte créé pour cet annonceur » même quand c'était celui du titulaire
    qui avait réclamé. `account.claimed` le distingue, et le texte suit le cas. La source est l'accord
    `otp` déposé par ce compte (`RadarClaims::recordProof`) : seuls deux chemins écrivent `user_id`, la
    réclamation et « Publier pour lui ». La purge efface le contenu d'un accord, jamais sa ligne ni son
    déposant. Le journal d'activité n'a pas été retenu, parce qu'il se purge à 12 mois.
  - **M5** : les huit refus que la publication de la réclamation peut rendre sont traduits. Un code
    qu'aucune ligne ne nomme prend un libellé de repli (« la publication a été refusée »), et le code
    reste visible au survol. Un test relit `RadarPublisher::publishClaimed()` / `publishLocked()` et les
    `leave()` du job, et casse sur tout code non nommé.
  - **M6** : chaque annonce laissée affiche sur la fiche son échéance de purge. Dans la file « À reprendre »,
    la colonne de relance devient « Échéance de purge » (celle de la première annonce laissée). La purge
    elle-même n'est pas modifiée (`privacy.ts` § 6).
  - **M3 (noté, non codé)** : si le compte A est délié puis **restauré hors de l'application**,
    l'annonceur réclame avec un compte neuf N. A reste à part, avec ses biens du Radar, et deux comptes
    portent le même numéro (A non vérifié, N vérifié). Aucune route ne restaure un `User` (relevé :
    `grep -rn "restore()" app routes`), donc le cas n'existe que par un geste en base. Si le porteur veut
    le fermer, deux pistes : retenir `previous_user_id` sur l'annonceur, ou refuser le geste tant que A
    reste restaurable. Suite possible sous TCK-2429 (réservé).
- **Contrôle au navigateur non fait** : la machine était à une charge de 50 à 120 pendant la session ;
  les trois écrans sont couverts par des tests de composants (avec ablation).

### Décisions prises en autonomie, à revoir

1. **Capacité du geste** : retenu `platform.radar.publish` (`super_admin` seul), comme la révocation ;
   écarté `platform.radar.operate` (le `support`), parce que le compte délié est celui que « Publier
   pour lui » a créé et que le brief demande un geste super-admin.
2. **Prise en charge** : retenu « pas exigée », comme la révocation ; écarté « exigée » (règle du
   démarchage) — le geste n'écrit aucun message, et n'attend pas qu'un autre opérateur libère la sienne.
3. **Motif** : retenu facultatif (≤ 500 caractères), journalisé s'il est écrit ; écarté le motif
   obligatoire de la révocation — moins restrictif, et l'historique garde qui et quand.
4. **Portée** : retenu « compte supprimé seulement » ; écarté « supprimé ou bloqué, ou espace
   suspendu » — un blocage est une décision du support que le geste ne doit pas défaire.
5. **Annonceur révoqué** : retenu le refus (409 `radar.advertiser.do_not_contact`, code existant) ;
   écarté « délier quand même, la réclamation refusant de toute façon » — la garantie se lit sur le
   geste même.
6. **La raison sur la page publique** : retenue une seule section « En attente de vérification »,
   sans raison ; écarté un texte par raison (« ajoutez des photos ») — la page ne permet pas d'en
   ajouter, et rien de l'état interne ne sort.
7. **La file** : retenue une file étroite `left_to_operator` (motif posé par le job) ; écartée une
   file « à publier » qui compterait aussi les accords par capture — ceux-là, l'opérateur vient de
   les confirmer sur la fiche, où le bouton « Publier pour lui » l'attend.
8. **L'origine du compte (M4)** : la source retenue est l'accord `otp` déposé par le compte, qui n'est
   jamais purgé. Écartés : le journal `radar_published` (`created_account`), purgé à 12 mois ; et une
   colonne neuve, qui demanderait une migration pour une distinction de libellé.
9. **L'échéance de purge (M6)** : retenu l'affichage seul, sans changer la purge. Écarté : suspendre la
   purge d'une annonce laissée, ce qui contredirait la promesse des 90 jours (`privacy.ts` § 6).
