---
id: TCK-2938
title: "Orientation : la pastille « Nouveau » de l'aperçu, l'espace pro qui ouvre une agence (« Ton équipe · Tes bailleurs · Tes mandats », « Sous 48 h »), la ville principale en liste et le chemin « Équipe, puis Inviter »"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2937]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#2-agency"
tags: [front, entree, orientation, agence, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le chercheur voit ce qui vient d'arriver ; le professionnel sait ce que son espace d'agence lui ouvre et quand l'agence sera vérifiée, et l'agent sait où son administrateur trouve le lien.

## Contrat de données

- Création de l'agence et villes principales (TCK-2937).
- Pastille « Nouveau » : `published_at` des résultats de la recherche publique (déjà servi par `PropertyResource`), règle « publié depuis moins de 48 heures » de la liste des biens (TCK-2499).

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-orientation`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-orientation.tsx`, visionneuse `?p=app-entree-orientation&a=a`.
  - **e2 « Chercheur : l'alerte »**, **bureau** : pastille « Nouveau » sur les lignes de l'aperçu (`:551`).
  - **e3 « Professionnel (créer) »**, **téléphone et bureau** : promesse « Ton espace d'agence s'ouvre tout de suite » (`:108`), panneau « Ce que tu auras » : « Ton équipe », « Tes bailleurs », « Tes mandats » (`:126-128`, bureau) ; « En deux temps » avec « Sous 48 h » (`:334-340`) ; « Ville principale » en liste (`:364`).
  - **e4 « Professionnel : rejoindre »**, **téléphone et bureau** : « Son administrateur te l'envoie depuis son espace (Équipe, puis « Inviter »). » (`:379`).
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-orientation (e2-e4, « non vérifiables ») ; fiche TCK-2608 (`ecarts_acceptes` 9, 10, 11, 20).

## Contraintes strictes (métier)

- « Sous 48 h » n'est écrit que si l'ADR de TCK-2937 en fait un engagement ; sinon l'étape garde son texte sans délai et la fiche garde l'écart avec ce motif.
- La pastille suit exactement la règle de la liste des biens (même fonction, pas une seconde définition).
- Libellés `fr`/`en`/`wo` (`wo` = français) ; tutoiement de l'orientation conservé.

## Delta à produire

- [ ] Pastille « Nouveau » dans l'aperçu du chercheur.
- [ ] « Créer mon espace pro » branché sur la création d'agence ; panneau « Ce que tu auras » à trois rangées équipe / bailleurs / mandats ; « En deux temps » avec « Sous 48 h ».
- [ ] « Ville principale » en liste.
- [ ] Texte de « rejoindre ».
- [ ] Vérifications au navigateur (AC5).

## Critères d'acceptation

- [ ] AC1 — À 1440, une ligne de l'aperçu dont le bien est publié depuis 10 h porte « Nouveau » ; publié depuis 3 jours, non.
- [ ] AC2 — « Créer mon espace pro » rempli puis validé mène à `/app` dans l'**espace d'agence** créé (pas à `/app/settings/agency/upgrade`).
- [ ] AC3 — Le panneau « Ce que tu auras » (bureau) liste « Ton équipe », « Tes bailleurs », « Tes mandats » ; « En deux temps » porte « Sous 48 h » sous la condition ci-dessus.
- [ ] AC4 — « Ville principale » est une liste (combobox) des villes servies ; une valeur hors liste n'est pas envoyée. L'écran « rejoindre » nomme « Équipe, puis « Inviter » ».
- [ ] AC5 — Vérifier au navigateur : l'interrupteur WhatsApp de e2 avec la capacité `search_alerts.whatsapp_enabled` ouverte et un numéro ; la carte « agence reconnue » de e4 avec un lien d'invitation valide collé. Corriger ce qui manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2608 mise à jour (entrées 9, 10, 11, 20 et la pastille retirées des écarts, ou motif réécrit).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e2, e3, e4 ne rend aucun écart non expliqué.

## Hors périmètre

- La règle de création d'agence (TCK-2937).

## Notes d'implémentation

_(à remplir par implementing-specs)_
