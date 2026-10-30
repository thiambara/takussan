---
id: TCK-2446
title: "Radar : hors mandat, refuser la réclamation vers un espace non actif avant la confirmation, comme sous mandat"
status: done
phase: P3
family: full
estimate: S
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2421]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, reclamation]
---

## Objectif utilisateur

Un annonceur dont le compte vérifié porte un espace suspendu ou inactif apprend sur la page de réclamation, avant de
confirmer, que ses annonces ne peuvent pas y être publiées. Aujourd'hui, la page lui dit « confirmé », puis rien ne se
publie.

## Contexte

La spec ([§2.12](../../features.md#212-radar--acquisition-dannonces), règle « Les biens du Radar n'entrent pas dans
l'espace d'un annonceur qui n'est pas actif ») décrit l'écart, relevé par la relecture adverse de la PR de spec commune
du lot 3 (m15, 2026-10-30) :

- **sous mandat**, `RadarClaims::refuseSuspendedTakeBack()` refuse avant l'envoi du code et à la confirmation (409
  `radar.claim.space_suspended`), puis `RadarMandateTakeBack::takeBack()` le rejuge sous verrou (TCK-2421) ;
- **hors mandat**, `sendCode()` et `confirm()` ne jugent pas l'espace : la réclamation est commitée (accord `otp`,
  compte rattaché à l'annonceur) et la page la dit confirmée. C'est le job `PublishClaimedRadarListings` qui refuse
  ensuite, dans `RadarPublisher::publishClaimed()` (`radar.advertiser.account_unavailable`), et les annonces restent
  `consented` avec ce code pour raison, dans la file « À reprendre » de l'opérateur (TCK-2413).

Rien n'entre dans l'espace non actif : ce n'est pas une fuite. Mais l'accord est enregistré et le compte rattaché pour
une publication qui ne peut pas avoir lieu, et l'annonceur l'apprend après coup, s'il l'apprend.

## Contrat de données

- `POST` d'envoi du code et de confirmation de `/claim/{jeton}` : un refus neuf, hors mandat, quand le compte vérifié du
  numéro a un espace (`primary_admin_id`) dont le statut n'est pas `active`. Code à trancher : réutiliser
  `radar.claim.space_suspended` avec un texte qui ne parle pas de mandat, ou un code distinct. Le texte actuel de
  `space_suspended` (« vos annonces restent diffusées par Takussan pour votre compte ») ne vaut que sous mandat.
- La lecture de la page (`show()`) peut dire l'état d'avance, sur le modèle de `mandate_support`.

## Contraintes strictes (métier)

- Même définition de l'espace non actif que les trois portes existantes (`status !== active`) : suspendu ou inactif.
- Sans espace, rien ne change : la réclamation en ouvre un, actif.
- Le refus vient avant l'envoi du code SMS et se rejuge à la confirmation : aucun accord `otp` ni rattachement de
  compte pour un espace qui ne publiera pas.
- La garde du job (`publishClaimed()`) reste : un espace suspendu entre la confirmation et la publication est encore
  refusé.
- Libellés par next-intl (`fr`, `en` ; `wo` porte le texte français tel quel tant que le wolof est en pause).

## Critères d'acceptation

- [x] AC1 — Hors mandat, un compte vérifié dont l'espace est suspendu, puis inactif, reçoit un refus à l'envoi du
  code ; aucun SMS ne part.
- [x] AC2 — Hors mandat, un espace devenu non actif entre l'envoi du code et la confirmation refuse la confirmation :
  aucun accord `otp`, `radar_advertisers.user_id` inchangé, aucune annonce `consented`.
- [x] AC3 — Un espace actif, ou l'absence d'espace, ne change rien au parcours actuel.
- [x] AC4 — La page affiche un texte qui ne parle pas de mandat.
- [x] AC5 — Sous mandat, le comportement de TCK-2421 est inchangé.

## Hors périmètre

- Reprendre ou publier vers un espace non actif en laissant les biens hors ligne (option écartée par TCK-2421,
  décision 10, à revoir par le porteur).
- La réactivation de l'espace.

## Notes d'implémentation

- **Code distinct** `radar.claim.space_unavailable` (409), hors mandat ; `radar.claim.space_suspended` reste au mandat,
  inchangé. Une seule porte, `RadarClaims::refuseInactiveSpace()` (ex-`refuseSuspendedTakeBack()`), choisit le code
  selon `underMandate()` ; la définition reste `RadarMandateTakeBack::spaceSuspended()` (premier espace dont il est
  l'administrateur principal, `status !== active`).
- Refus à l'envoi du code et à la confirmation **avant le code** (il n'est pas consommé : il resservira une fois l'espace
  rétabli), puis **rejugé sous le verrou de l'annonceur** dans `claim()`, hors mandat (sous mandat,
  `RadarMandateTakeBack::takeBack()` le rejuge déjà avec son propre code).
- La page lit `account.space_unavailable` (vrai hors mandat seulement) et affiche un bloc « Votre espace n'est pas
  actif », sans formulaire ni code, dans l'ordre des refus de l'API. Elle ne révèle rien de plus que le refus de
  `sendCode()` : celui-ci vient avant `login_required`, le porteur du lien l'obtient sans se connecter.
- Le compte préparé par le Radar (`activation`) dont l'espace n'est pas actif était déjà refusé avant le SMS : l'état
  est `unavailable` (`AdvertiserProvisioner::accountUnavailable()`), 422 `radar.claim.account_unavailable`. Inchangé.
- La garde du job (`RadarPublisher::publishClaimed()`) reste.

### Décisions prises en autonomie, à revoir

1. **L'annonce d'avance est un booléen `account.space_unavailable`, pas un état de `account.state`.** Écarté : un état
   neuf, qui traverserait toute la machine d'états (`existing` sert aussi à la connexion exigée) et le mandat.
2. **Pas d'annonce d'avance sous mandat** (AC5) : le champ y vaut toujours faux, le refus `space_suspended` se dit
   après l'envoi du code comme avant. Écarté : l'annoncer aussi sous mandat, qui changerait la page de TCK-2421. Facile
   à ajouter si le porteur le veut (le refus le révèle déjà).
3. **Le refus vient avant la connexion exigée**, comme sous mandat : le porteur du lien, non connecté, apprend que le
   compte vérifié de ce numéro a un espace non actif. Écarté : le placer après la connexion, qui ferait se connecter
   l'annonceur pour rien et divergerait du mandat.
4. **Relecture sous verrou hors mandat**, au-delà du ticket. Écarté : compter sur le seul job, qui laisserait un accord
   `otp` et un rattachement dans la fenêtre de course.
5. **« Écrivez-nous »** plutôt que « Contactez-nous », comme les textes voisins (`supportRequired`,
   `mandateSupportBody`). Aucun délai promis.
