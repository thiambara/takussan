---
id: TCK-2471
title: "Radar : le message d'accord dit à l'annonceur que son bien est recherché sur Takussan, quand une cible de la demande le vise"
status: todo
phase: P2
family: full
estimate: M
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2470]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, front, radar, demarchage, adr-0077, adr-0087]
---

## Objectif utilisateur

L'annonceur accepte plus volontiers parce que le message lui dit une chose vraie et utile : des personnes cherchent en ce
moment, sur Takussan, un bien comme le sien.

## Décision du porteur (2026-11-04) : validée

`accord.v3` est le corps du gabarit que Meta a approuvé pour le démarchage par l'API (TCK-2395). Une phrase de plus
exige un nouveau gabarit approuvé. Validée telle que proposée : **`accord.v4` = `accord.v3` + la phrase exacte « Des
personnes recherchent en ce moment sur Takussan un bien comme le vôtre. », sur le seul canal manuel (`wa.me`)** ; l'API
garde `accord.v3` tant que `radar.whatsapp.accord_v4_template` n'est pas configuré.

## Contraintes strictes (métier)

- **Texte fixe et versionné** (ADR-0077 §4) : une phrase écrite dans le dépôt, jamais générée, sans nombre (« Des
  personnes recherchent en ce moment sur Takussan un bien comme le vôtre. »). Elle n'apparaît que si au moins une annonce
  du message est rattachée à une cible `demand` active (TCK-2470).
- Chaque message garde sa version ; une version nouvelle ne réécrit aucun message envoyé.
- Le canal API refuse `accord.v4` tant que `radar.whatsapp.accord_v4_template` n'est pas configuré.
- Les textes juridiques ne changent pas (la phrase n'est pas une clause).

## Delta à produire

- [x] `ConsentMessageComposer` : version `accord.v4` = `accord.v3` + la phrase, choisie quand la condition tient et que
      le canal est manuel.
- [x] Console : l'aperçu du message montre la phrase et sa raison (« recherché : <nom de la cible> »).
- [x] Tests : `ConsentMessageDemandSentenceTest` (phrase présente seulement si une cible `demand` active couvre une
      annonce ; absente sur le canal API ; version enregistrée `accord.v4`).

## Critères d'acceptation

- [x] AC1 — Une annonce rattachée à une cible `demand` active → message `accord.v4` avec la phrase, mot pour mot.
- [x] AC2 — Sans cible `demand`, ou par l'API sans gabarit v4 → `accord.v3` inchangé.
- [x] AC3 — Ablation : retirer la condition fait rougir AC2.

## Hors périmètre

- Le gabarit Meta v4 (démarche du porteur).

## Notes d'implémentation

**Re-mesures (2026-11-04)**

- Versions existantes : `accord.v1` … `accord.v3` (`resources/radar/clauses/<version>.<locale>.md`, `fr` et `en` ; pas de
  wolof, décision 5). Chaque message enregistre la sienne (`radar_outreaches.clauses_version`) ; `retouch()` recompose dans
  la version ENREGISTRÉE — rien à changer pour que la v4 ne réécrive aucun message.
- Le gabarit Meta se cherche par version dans `config/radar_whatsapp.php` (`templates`), pas sous une clé
  `radar.whatsapp.accord_v4_template` : la clé du ticket est devenue `radar_whatsapp.templates.accord.v4`, lue de
  `RADAR_WHATSAPP_ACCORD_V4_TEMPLATE` (vide par défaut). Une version sans nom rend déjà 422 `radar.whatsapp.template_missing`.
- Pivot `radar_listing_target` (TCK-2468) : `RadarListing::targets()` / `RadarTarget::listings()` ; `RadarTargetOrigin::Demand`,
  `RadarTargetStatus::Active` existent.
- **Le canal n'est pas connu à la préparation** : l'opérateur choisit `wa.me` ou « Envoyer par l'API » sur l'aperçu, APRÈS
  que le texte est composé et enregistré. La version se décide donc à la préparation, sur ce qui sera offert.

**Ce qui est fait**

- `accord.v4.{fr,en}.md` = `accord.v3` + la phrase, en paragraphe à elle après la présentation ; clauses identiques mot pour
  mot (test : retirer la phrase redonne `accord.v3`). Anglais : « People are looking for a property like yours on Takussan
  right now. »
- `ConsentMessageComposer::DEMAND_VERSION` et `versionFor(listing_ids)`, appelée par `RadarOutreachWorkflow::prepare()`
  sous le verrou des annonces jugées : `accord.v4` si une cible `demand` **active** couvre une annonce du message ET que
  chaque canal offert peut l'envoyer — l'API n'est pas offerte (`RadarWhatsappNumber::available()`), ou le gabarit v4 est
  configuré. Sinon `accord.v3`, inchangé. `demandTargetNames()` rend la raison.
- `RadarWhatsappTemplate::templateName()` (extrait de `for()`) : la même lecture décide de la version et refuse l'envoi.
- `RadarOutreachResource.demand_targets` : les noms des cibles de la demande qui couvrent les annonces d'un message
  `accord.v4` (toutes, même mises en pause depuis : c'est la raison d'un texte déjà composé) ; `[]` pour toute autre version.
- Console : `ApercuMessage` affiche sous le texte une note (`radar-message-demande`) — « Ce message dit à l'annonceur que
  des personnes recherchent un bien comme le sien sur Takussan. » puis « Recherché : <noms> » ; la phrase elle-même est
  dans le segment figé. Libellés `superAdmin.pages.radar.advertiser.message.demandSentence|demandReason` (wo = fr).
- Clé `RADAR_WHATSAPP_ACCORD_V4_TEMPLATE` : commentée dans `.env.example` / `.env.docker` (défaut vide, D-54), vide dans le
  gabarit de production et ajoutée à `VIDES_PERMISES` de `scripts/check-env-production.mjs`.
- `takussan-web/src/content/legal/README.md`, ligne 4 : la phrase d'`accord.v4` rejoint ce que l'avocat relit (ce n'est
  pas une clause ; aucun texte juridique ne change).

**Écarts**

- **Avec l'API offerte et sans gabarit v4, la phrase ne part pas, même à la main** : le texte est figé avant le choix du
  canal, et un `accord.v4` préparé alors ne pourrait plus partir par l'API (le geste principal quand il est offert). C'est
  la lecture retenue de « l'API garde `accord.v3` » (AC2 « par l'API sans gabarit v4 → `accord.v3` »). Un `accord.v4`
  préparé quand l'API n'était pas offerte, puis envoyé par l'API une fois offerte, est refusé (`template_missing`) : rien
  ne part, le brouillon reste.
- **Borne du résumé pour le gabarit v4** : la phrase ajoute 77 caractères (fr) au texte fixe. Avec la salutation, le résumé
  (120) et les liens les plus longs, le corps hydraté dépasse 1024 (refus Meta 132005) ; la garde existante le refuse
  avant tout envoi (`radar.whatsapp.summary_too_long`, `max` = 120 — trompeur pour la v4), un résumé de 40 passe. À trancher
  avec la démarche du gabarit Meta v4 : une borne de résumé par version (~45 caractères pour la v4).

**Tests** : `tests/Feature/Radar/ConsentMessageDemandSentenceTest.php` (9) ;
`takussan-web/src/components/admin/super/radar/annonceur/__tests__/ApercuMessageDemande.tck-2471.test.tsx` (2). Ablations :
condition de la cible retirée → AC2 rouge (AC3) ; statut actif, origine `demand`, rattachement aux annonces ignorés →
AC2 rouge ; condition du canal retirée → AC2-API rouge ; `prepare()` sans `versionFor` → AC1 rouges ; raison absente de
la ressource → AC1 rouge ; envoi d'un v4 sans gabarit accepté → test du refus rouge ; note absente de l'aperçu → test
front rouge.

## À reporter dans les specs

- `docs/features.md` §2.12 (message d'accord) : `accord.v4` = `accord.v3` + « Des personnes recherchent en ce moment sur
  Takussan un bien comme le vôtre. » (en : « People are looking for a property like yours on Takussan right now. »), quand
  une cible `demand` active couvre une annonce du message ; seulement si chaque canal offert peut l'envoyer (API non
  offerte, ou gabarit Meta v4 configuré par `RADAR_WHATSAPP_ACCORD_V4_TEMPLATE`) ; sinon `accord.v3`. L'aperçu de la
  console dit pourquoi (« Recherché : <cibles> »). L'API refuse un `accord.v4` sans gabarit (`template_missing`).
- `docs/features.md` (recherches sauvegardées / Radar, demande) : `results_count` est écrit par le passage des alertes
  (chaque recherche active) et à la création ou au changement de critères (cf. TCK-2470, notes du 2026-11-04).
