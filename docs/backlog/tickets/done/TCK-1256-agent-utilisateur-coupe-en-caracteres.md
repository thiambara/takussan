---
id: TCK-1256
title: "Demande de contact et clic : l'agent utilisateur est coupé en caractères, plus de 500 sur la voie publique"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-124--colonnes-bornées-remplies-par-une-valeur-dérivée-ou-recopiée"
tags: [api, contact, public, utf8, colonnes-bornees, pistes]
---

## Contexte

Réf : **P124.03** du fichier de pistes, `retenu · autonome` (A1).

`ContactLeadService` écrit `substr((string) $request->userAgent(), 0, 255)` pour le clic WhatsApp
ou Appeler et pour la demande de contact. Le `substr` d'octets coupe une séquence UTF-8 : la
chaîne écrite est invalide, et PostgreSQL rend 22021, soit 500 sur une voie publique. Le dépôt
corrige déjà ce défaut ailleurs (`FailedJobService::truncate()`, `LeaseSignatureService`).

## Objectif

L'agent utilisateur est coupé à 255 caractères, jamais au milieu d'un caractère.

## Delta à produire

- [x] `ContactLeadService` : `mb_substr` aux deux lignes.
- [x] Un test par voie publique : `PropertyContactClickTest`, `PropertyContactLeadTest`.

## Critères d'acceptation

- [x] AC1 — `contact-click` avec un `User-Agent` de 254 `a` suivis de `éé` → 204, valeur
      `254 a + é`, valide en UTF-8.
- [x] AC2 — `contact-lead`, même en-tête → 201, même valeur.

## Hors périmètre

- La garde de forme contre `substr(` sur une valeur écrite en base, que la piste donne pour
  facultative.

## Notes d'implémentation

- Ablation : `ContactLeadService.php` remis à `HEAD` → 1 rouge dans chaque classe (500) ;
  correctif remis → 4 et 21 verts. `AgentContactLeadTest` (même ligne 314) vert.
