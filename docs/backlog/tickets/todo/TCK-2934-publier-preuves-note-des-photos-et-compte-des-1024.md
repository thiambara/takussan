---
id: TCK-2934
title: "Publier sans compte : les preuves du départ jamais vides (« 0 F de commission »), la note « tes photos restent sur ce téléphone », « Gratuit, sans commission » au compte, et la disposition bureau dès 1024"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#3-property"
tags: [front, entree, publier, sans-compte, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le particulier qui arrive sur /publish lit d'emblée pourquoi publier ici, sait où sont ses photos avant de les envoyer, et finit sa publication au bureau dans la même disposition, qu'il ait un écran de 1024 ou de 1440.

## Contrat de données

- Preuve chiffrée du départ : `searches_7d` déjà lu par `PreuvesDuDepart` (avec son seuil).
- Aucun endpoint neuf. La spec ne détaille pas ces éléments : à reporter par `/sync-specs`.

## Direction UX / Artistique

- **Référence de fidélité** : `app-entree-publier`, **approche A**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-entree-publier.tsx` (+ `app-entree-publier-assistant.tsx`, `-etapes.tsx`, `-kit.tsx`), visionneuse `?p=app-entree-publier&a=a`.
  - **e0 « Départ : le bien »**, **téléphone et bureau** : carte de preuves à deux chiffres, « N recherches à Dakar cette semaine » et « 0 F de commission » (`app-entree-publier.tsx:101-108`).
  - **e4 « Les photos »**, **téléphone** : « Tes photos restent sur ce téléphone jusqu'à la publication : elles partent avec l'annonce » ; **bureau** : « … dans ce navigateur … » (`-etapes.tsx:261`).
  - **e6 « Le compte, à la publication »** et **e7 « Code, prénom et nom »**, **bureau** : trois assurances, dont « Gratuit, sans commission » (`:632`).
  - **e1 « Le lieu »**, **téléphone et bureau** : l'aide « Introuvable ? Écris-le : il s'affiche tout de suite sur ton annonce, notre équipe le vérifie ensuite. » sous le champ du quartier (`-etapes.tsx:103`), visible d'emblée.
  - **Largeurs** : la maquette écrit « Bureau 1280 : inchangé à 1280 et à 1024 ; sous 1024, l'aperçu passe sous le formulaire » (`:841`). La maquette parle donc à 1024 : la règle d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 4 (qui ne vaut que « puisque la maquette n'y dit rien ») s'efface devant elle entre 1024 et 1279.
- Audit : `audit-f6-agence-entree.md`, « Famille entrée », § app-entree-publier (e0, e4, e6, e7, e8 et « écrans non vérifiables ») ; fiches TCK-2600, TCK-2601, TCK-2603, TCK-2819.

## Contraintes strictes (métier)

- **« 0 F de commission » et « Gratuit, sans commission » sont des promesses** : elles valent pour la publication par un particulier sans compte (aucune commission prélevée par Takussan sur sa publication). L'implémenteur vérifie la règle (crédits, commissions de l'espace individuel) ; si elle ne tient pas, il ne l'écrit pas et remonte la question au porteur dans la PR (écart TCK-2603 ratifié le 2026-11-13, à rouvrir).
- La carte de preuves n'est jamais absente : sous le seuil de `searches_7d` (ou sans la donnée), elle garde la preuve « 0 F de commission » seule, au lieu de disparaître.
- La note des photos ne paraît qu'en mode **anonyme** (assistant de /publish), pas dans `/app/properties/new` qui partage l'assistant (motif de l'écart TCK-2819).
- De 1024 à 1279, l'étape du compte (e6, e7) suit la disposition bureau (panneau dans la colonne gauche, aperçu à droite), pas la feuille latérale de `FeuilleDuBas` ; sous 1024, la règle d'ADR-0106 § 4.
- Libellés `fr`/`en`/`wo` (`wo` = français) ; le tutoiement de la maquette de l'entrée publique est conservé là où le produit l'a déjà.

## Delta à produire

- [ ] Preuve « 0 F de commission » et repli de la carte de preuves.
- [ ] Note des photos (anonyme seulement), deux libellés tél./bureau.
- [ ] Troisième assurance « Gratuit, sans commission » au bureau (e6, e7).
- [ ] Disposition bureau du compte dès `lg`.
- [ ] Aide « Introuvable ? » du quartier visible d'emblée en mode anonyme (écart TCK-2819 a-1, décision 4a, rouvert à la demande du porteur).
- [ ] Fiche TCK-2600 : `ecarts_ouverts` faits par TCK-2819 (étapes, aperçu, pied du téléphone) passés en résolus avec le renvoi.
- [ ] Vérifications au navigateur (AC6).

## Critères d'acceptation

- [ ] AC1 — Avec `searches_7d` au-dessus du seuil, la carte de preuves rend les deux chiffres ; sans la donnée (ou sous le seuil), elle rend « 0 F de commission » seul : la carte n'est jamais absente (test sur les deux cas).
- [ ] AC2 — Sur /publish à l'étape photos, la note « Tes photos restent sur ce téléphone jusqu'à la publication… » est rendue à 390 et « … dans ce navigateur … » à 1440 ; sur `/app/properties/new`, aucune des deux.
- [ ] AC3 — À 1440, l'étape du compte et celle du code portent trois assurances, dont « Gratuit, sans commission ».
- [ ] AC4 — À 1024 (et 1279), « Publier » ouvre l'étape du compte dans la colonne gauche avec « Revenir à l'annonce », l'aperçu restant à droite ; aucun panneau latéral ne recouvre l'aperçu. À 768, la règle d'ADR-0106 § 4 (une colonne, pas de défilement horizontal).
- [ ] AC5b — Sur /publish à l'étape du lieu, l'aide « Introuvable ? Écris-le… » est rendue sous le champ du quartier avant toute saisie (à 390 et 1440) ; sur `/app/properties/new`, le comportement actuel (aide pour un quartier hors référentiel) est inchangé.
- [ ] AC5 — `TCK-2600.json` ne liste plus en `ecarts_ouverts` les trois entrées faites par TCK-2819.
- [ ] AC6 — Vérifier au navigateur : la carte de preuves avec et sans données (e0) ; la carte et la ligne « Booster » de e8 pour un espace particulier neuf (`boost.spend`, statut `published` puis `pending_review` → titre « en vérification ») ; corriger ce qui manque.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiches TCK-2601, TCK-2603, TCK-2819 mises à jour (entrées couvertes retirées).
- [ ] AC-F2 — À 390 × 844, 1440 × 900 et 1024 × 768, `fidelite compare` sur e0, e4, e6, e7 ne rend aucun écart non expliqué.

## Hors périmètre

- « Effacer ce brouillon » et la ligne d'état du brouillon (ajouts du produit, toujours « à trancher » dans TCK-2600 : pas un manque).

## Notes d'implémentation

_(à remplir par implementing-specs)_
