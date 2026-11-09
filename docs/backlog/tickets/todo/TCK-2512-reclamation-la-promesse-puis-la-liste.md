---
id: TCK-2512
title: Page de réclamation « La promesse, puis la liste » : bouton sous le pouce, refus toujours présent
status: todo
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2511, TCK-2505]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [front, radar, mobile, audit-ux]
---

## Objectif utilisateur

L'annonceur qui ouvre le lien comprend en une ligne ce qu'il y gagne, coche ses annonces, publie d'un bouton toujours sous le pouce — ou dit « ce n'est pas moi » sans chercher.

## Contrat de données

`GET /api/radar/claims/{token}` (avec `demand`, TCK-2511), `POST …/otp`, `POST …/confirm`, `POST …/decline` (TCK-2511). Aucun autre.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=revendication&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Vos annonces, Corriger, Votre espace, Code SMS, Confirmé, Ce n'est pas moi, Compte existant.
- **Coque de lien nue** construite par TCK-2505 : logo, « Lien personnel », pied minimal ; ni recherche, ni favoris, ni comparateur, ni barre d'onglets.
- En tête, la promesse : gratuit, numéro masqué aux visiteurs, et — si `demand` existe — « {N} recherches à {quartier} ces 30 derniers jours ». Sans `demand`, la promesse sans chiffre.
- « Déjà en ligne » et « À publier » séparés ; annonces en cartes à cocher, « Corriger » par carte.
- Bouton collant « Publier mes N annonces » qui ouvre deux feuilles successives : l'espace, puis le code.
- « Ce n'est pas moi · Ne plus me contacter » toujours visible en bas de page ; ouvre une feuille de confirmation (boîte de dialogue de 480 px en bureau).
- Vouvoiement (échange commercial).

## Contraintes strictes (métier)

- Rien de ce que la page fait ne se perd : correction (titre, prix, description, jeton [TELEPHONE]), prénom et nom d'espace avec l'avertissement « pas de numéro dans le nom », espace existant, conditions versionnées, code à 6 chiffres (`one-time-code`), renvoi avec compte à rebours, code de préproduction, « Ouvrir mon espace ».
- Tous les états gardent leur page : déjà en ligne, en cours de publication, en attente de vérification, reprise sous mandat, et les six blocages de la spec § 2.12.
- Lien expiré, révoqué, introuvable, service indisponible : l'état commun des pages par lien (TCK-2514).

## Delta à produire

- [ ] Page réordonnée (promesse, sections, bouton collant, feuilles).
- [ ] Feuille de refus branchée sur `decline`, état « C'est noté » final.
- [ ] Clés i18n `fr`/`en`/`wo`.
- [ ] Tests (chiffre absent quand `demand` est nul, refus, chacun des états existants toujours rendu).

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, le bouton « Publier mes N annonces » est visible sans défilement et N suit les cases cochées.
- [ ] AC2 — Avec `demand: null`, aucun chiffre ni phrase de demande n'apparaît.
- [ ] AC3 — « Ce n'est pas moi » confirmé appelle `decline` une fois et laisse un écran sans action restante.
- [ ] AC4 — Les six blocages de la spec se rendent encore, chacun avec son texte actuel.

## Hors périmètre

- La coque de lien (TCK-2505).
- Le partage WhatsApp et le conseil de photos de l'écran « Confirmé » (ajouts à décider, montrés par la maquette).

## Notes d'implémentation

_(à remplir par implementing-specs)_
