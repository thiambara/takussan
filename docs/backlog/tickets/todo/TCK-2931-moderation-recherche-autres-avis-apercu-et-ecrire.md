---
id: TCK-2931
title: "Modération : le champ « Chercher » de la file des avis, « Autres avis sur ce bien » et la note du sujet, « Ouvrir l'aperçu complet » / « Ouvrir en grand » et « Écrire » à l'auteur d'un bien"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2930]
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#11-review"
tags: [front, moderation, avis, biens, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

Le modérateur trouve l'avis qu'il cherche, le juge dans son contexte, voit le bien à valider en grand comme le verra le public, et écrit à son auteur sans quitter la file.

## Contrat de données

- `filter[search]`, résumé du sujet, `tenant_since`, et sous condition les gestes « Supprimer » / « Ignorer les signalements » (TCK-2930).
- Bien à valider : `GET /api/properties/moderation/{property}` (existant) pour l'aperçu ; `POST /api/conversations` (existant) pour « Écrire » à qui l'a soumis.
- Les clés `admin.propertyModeration.bien.ouvrirApercu` et `bien.ouvrirEnGrand` existent déjà dans `fr.json`, sans appelant.

## Direction UX / Artistique

- **Référence de fidélité** : `app-moderation`, **approche B**, `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-moderation.tsx`, visionneuse `?p=app-moderation&a=b`.
  - **e0 « File des avis »**, **bureau** : champ « Chercher un bien, un auteur, un agent » sur l'onglet Avis (`:391`) ; le téléphone est conforme.
  - **e1 « Détail d'un avis »**, **téléphone** et **bureau (colonne droite de e0)** : « Autres avis sur ce bien », note moyenne du sujet « 4,2 ★ sur 12 avis », « Locataire depuis … » (`:240`), et — si TCK-2930 AC4 est livré — « Supprimer », « Ignorer les signalements » et le ⋯ (`:468`, `:551-553`).
  - **e2 « Bien à valider »** : **téléphone** « Ouvrir l'aperçu complet de la fiche » (`:604`) ; **bureau** « Ouvrir en grand » (`:625`) ; **les deux** « Écrire » à côté de « Soumis par » (`:352`).
- Audit : `audit-f6-agence-entree.md`, § app-moderation e0-e2 ; fiche TCK-2673.

## Contraintes strictes (métier)

- La recherche est faite par le serveur (`filter[search]`), jamais sur la page déjà chargée ; saisie retardée (debounce) et état « aucun résultat ».
- L'aperçu complet rend la fiche publique du bien **non publié** à partir de la lecture de modération, sans l'exposer publiquement (route sous `/app`, même garde que la file) ; un bandeau dit « Aperçu — ce bien n'est pas encore publié ».
- « Écrire » ouvre (ou reprend) une conversation avec qui a soumis le bien, dans la messagerie existante.
- Les gestes de AC4 de TCK-2930 ne paraissent que si l'API les autorise (capacité / abilities de l'avis), jamais sur le rôle déduit côté front.
- Libellés `fr`/`en`/`wo` (`wo` = français) ; vouvoiement.

## Delta à produire

- [ ] Champ de recherche de la file des avis (bureau ; au téléphone, dans la feuille des filtres si la maquette ne le montre pas ailleurs).
- [ ] Bloc « Autres avis sur ce bien » + note moyenne ; « Locataire depuis ».
- [ ] Route d'aperçu complet d'un bien à valider ; liens « Ouvrir l'aperçu complet » (tél.) et « Ouvrir en grand » (bureau).
- [ ] « Écrire » à l'auteur.
- [ ] Gestes de l'admin d'agence si TCK-2930 AC4 est livré.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — À 1440, sur l'onglet Avis, taper « sacré » envoie `filter[search]=sacré` et la liste ne rend que les avis renvoyés ; vider le champ rend la file entière.
- [ ] AC2 — Le détail d'un avis dont le sujet a 12 avis publiés de moyenne 4,2 affiche « 4,2 ★ sur 12 avis » et jusqu'à 3 autres avis ; sans autre avis, le bloc n'est pas rendu.
- [ ] AC3 — « Ouvrir l'aperçu complet de la fiche » (390) et « Ouvrir en grand » (1440) mènent à une page sous `/app` qui rend titre, photos, prix, caractéristiques et description du bien à valider, avec le bandeau d'aperçu ; un agent sans droit de modérer reçoit la page introuvable.
- [ ] AC4 — « Écrire » ouvre la messagerie sur une conversation dont l'autre participant est l'auteur du bien.
- [ ] AC5 — Si TCK-2930 AC4 est livré : sur un avis publié de son périmètre, l'admin d'agence voit « Supprimer » (avec motif) et « Ignorer les signalements » ; sinon ces gestes restent absents et la fiche TCK-2673 garde l'écart avec le motif ADR-0043.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche TCK-2673 mise à jour (entrées `b-0`, `b-1`, `b-2` couvertes retirées).
- [ ] AC-F2 — À 390 × 844 et 1440 × 900, `fidelite compare` sur e0, e1, e2 ne rend aucun écart non expliqué.
- [ ] AC-F3 — À 1024 et 768 : la colonne de détail passe dessous ou en plein écran, aucun défilement horizontal.

## Hors périmètre

- Les règles d'accès (TCK-2930).

## Notes d'implémentation

_(à remplir par implementing-specs)_
