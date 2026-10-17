---
id: TCK-794
title: "Clics sponsorisés : trois par heure, marqueur dans l'URL, et /playground hors des environnements déployés"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-18--statistiques-boost-face-aux-robots-aux-rendus-serveur-et-aux-revalidations
tags: [back, front, boost, statistiques, pistes]
---

## Contexte

Réf : **P18.06** du fichier de pistes, `validé` (critère accordé : V7). Trois écarts des statistiques
Boost (ADR-0061 § 10) :
- un seul clic par bien, par IP et par heure, quand la vue de fiche en accepte trois
  (`PropertyViewCounter::MAX_PAR_HEURE`) : derrière un NAT d'opérateur, les clics sont sous-comptés ;
- le marqueur d'arrivée était une seule clé `sessionStorage` : un clic du milieu ou « ouvrir dans un
  nouvel onglet » ouvre un onglet qui ne la lit pas ;
- `/playground` est servi sur le site public et appelle la recherche publique : chaque affichage
  comptait des impressions sponsorisées qu'il ne montre pas.

## Décision du porteur

plafond des clics aligné sur celui des vues (3 par heure), marqueur `?src=sponsored` dans l'URL, `/playground` retiré des environnements déployés

## Delta à produire

- [x] `BoostStatsRecorder::click()` : plafond à `PropertyViewCounter::MAX_PAR_HEURE` sur
      `PropertyViewCounter::FENETRE_SECONDES`.
- [x] `arrivee-sponsorisee.ts` : le contexte `ArriveeSponsorisee`, `hrefDeFiche()` et
      `consommerArriveeDansLUrl()` remplacent le stockage de session. `LienDeCarte` ajoute
      `?src=sponsored` sous ce contexte ; `EmplacementsSponsorises` et la rangée vedette
      (`PropertyRow emplacementSponsorise`) le posent ; `CompteurDeVue` le lit dans l'URL et l'en retire.
- [x] `/playground` rend 404 dans une construction de production (`NODE_ENV === 'production'`).

## Critères d'acceptation

- [x] AC1 — Quatre clics d'une même IP sur un bien dans l'heure en comptent trois ; une autre IP en
      compte un de plus.
- [x] AC2 — Le lien d'une carte d'emplacement, et de la rangée vedette, mène à
      `/fr/properties/<slug>?src=sponsored` ; une carte ailleurs n'a pas de marqueur.
- [x] AC3 — Une fiche ouverte avec `?src=sponsored` envoie sa vue avec `src=sponsored`, retire le
      marqueur de l'URL (les autres paramètres et l'ancre restent), et la vue suivante est organique.
- [x] AC4 — `/playground` rend 404 en production, et se rend en développement.

## Hors périmètre

- La justesse de l'IP elle-même (angle 37).
- Une variante du playground qui lirait une source sans effet de bord : la décision le retire des
  environnements déployés.

## Hypothèses (mode sans humain)

- « Environnements déployés » = toute construction `next build` : préproduction et production sont
  construites en `NODE_ENV=production` ; `next dev` reste la seule façon de l'ouvrir.
- Le marqueur est retiré de l'URL une fois lu (`history.replaceState`), comme le stockage de session
  était consommé une fois : un rechargement ou une URL partagée ne recompte pas de clic.

## Notes d'implémentation

- Ablation API : plafond remis à 1 → `BoostStatsTest` rouge (2 clics au lieu de 4) ; remis → vert.
- Ablation front, en une passe : le lien sans marqueur, le compteur qui ignore l'URL et la garde du
  playground retirée → 4 rouges sur 40 ; remis → 40 verts.
- Le docblock de `BoostStatsTest` (« une par IP et par heure ») suit le nouveau plafond.
