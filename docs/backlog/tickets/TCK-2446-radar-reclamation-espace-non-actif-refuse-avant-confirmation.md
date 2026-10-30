---
id: TCK-2446
title: "Radar : hors mandat, refuser la réclamation vers un espace non actif avant la confirmation, comme sous mandat"
status: todo
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

- [ ] AC1 — Hors mandat, un compte vérifié dont l'espace est suspendu, puis inactif, reçoit un refus à l'envoi du
  code ; aucun SMS ne part.
- [ ] AC2 — Hors mandat, un espace devenu non actif entre l'envoi du code et la confirmation refuse la confirmation :
  aucun accord `otp`, `radar_advertisers.user_id` inchangé, aucune annonce `consented`.
- [ ] AC3 — Un espace actif, ou l'absence d'espace, ne change rien au parcours actuel.
- [ ] AC4 — La page affiche un texte qui ne parle pas de mandat.
- [ ] AC5 — Sous mandat, le comportement de TCK-2421 est inchangé.

## Hors périmètre

- Reprendre ou publier vers un espace non actif en laissant les biens hors ligne (option écartée par TCK-2421,
  décision 10, à revoir par le porteur).
- La réactivation de l'espace.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
