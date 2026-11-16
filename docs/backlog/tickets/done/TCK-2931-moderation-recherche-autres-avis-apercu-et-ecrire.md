---
id: TCK-2931
title: "Modération : le champ « Chercher » de la file des avis, « Autres avis sur ce bien » et la note du sujet, « Ouvrir l'aperçu complet » / « Ouvrir en grand » et « Écrire » à l'auteur d'un bien"
status: done
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

**2026-11-15 — implémenté (agent délégué, vague 92), front seul, sur l'API de TCK-2930.**

- **Recherche (AC1)** : `filter[search]` dans `buildQueueParams` (rognée, jamais vide) ; champ
  `DebouncedSearchInput` (saisie immédiate, envoi à 300 ms) dans la tête de page au bureau
  (maquette `TeteModeration`), dans la feuille « Filtres » au téléphone, avec une ligne
  « Recherche : « … » » effaçable au-dessus de la liste. L'état vit dans l'URL ; il entre dans la
  clé des deux lectures, dans `cleFiltres` (les cases tombent) **et dans « Tout cocher »**, qui
  relit la file à part (sans quoi le lot publiait des avis hors de la liste cherchée). État
  « Aucun avis pour « x » » avec « Effacer la recherche ».
- **Contexte (AC2)** : `GET /api/reviews/{id}/subject-summary` (clé sous `['reviews-moderation', …]`,
  relue après une décision). « 4,2 ★ sur 12 avis » en tête de la 3ᵉ ligne du bloc du sujet
  (`BlocDuSujet note`), formaté par `nombre` à une décimale ; « Locataire depuis {mois année} »
  remplace le contexte de l'auteur quand `tenant_since` est rendu ; « Autres avis sur ce bien /
  cet agent / … » (titre selon le type du sujet), 3 au plus, « publié en {mois} ». Résumé absent
  ou illisible : rien n'est rendu, jamais d'erreur dans le détail.
- **Gestes de l'agence (AC5)** : `ModerationDetail` ne lit plus `platform` (prop retirée) :
  « Supprimer » suit `can_delete`, « Ignorer les signalements » `can_dismiss_reports` (et un compte
  de signalements), hors de `can_moderate` — un avis publié de son périmètre les offre à l'admin
  d'agence, sans la mention « seule la plateforme peut le retirer ». Au bureau, en pied du détail ;
  au téléphone, dans « ⋯ » de l'en-tête (`DeclarerEnTete actions`, `SheetClose`), maquette `:468`.
  **Choix tranché** : supprimer exige motif codé ET texte **pour tous à l'écran**, super-admin
  compris (l'API ne l'exige que de l'agence) — le geste est irréversible ; libellé dédié
  « Quelques mots (obligatoires, consignés dans le journal d'audit) ».
  Le rappel `admin.moderation.file.motifRappel` est retouché en conséquence (« supprimer demande
  aussi quelques mots »), alias de la fiche TCK-2673 mis à jour. Ouvert depuis « ⋯ », le panneau
  de confirmation est amené à l'écran et prend le focus. Le super-admin garde les deux gestes par
  `Gate::before` (relu : `ReviewPolicy::delete` / `dismissReports`), plus par `platform`.
- **Aperçu complet (AC3)** : route `/app/agency/moderation/properties/[id]` (page gardée par
  `garderPageAdmin('/app/agency/moderation/properties')`, `check-pro-routes` vert). Le
  `layout.tsx` du segment lit `GET /api/properties/moderation/{id}` (`cache()`, partagé avec la
  page) : identifiant illisible, **403 ou 404 → introuvable** ; une panne laisse la page dire son
  erreur. **Écart à l'AC** : un profil sans AUCUNE page d'administration (un agent simple) est
  renvoyé vers `/app` par le layout d'`agency` et par `garderPageAdmin` (règle de toute la section,
  307) avant d'atteindre l'introuvable ; l'introuvable vaut pour l'admin qui n'a pas le droit de
  modérer CE bien (autre agence, `reject-property` refusé). L'aperçu (`ApercuDuBienAValider`)
  reprend les pièces du détail de la file (exportées de `PropertyModerationDetail`) : carrousel au
  téléphone, mosaïque dès `md`, titre, lieu, prix, caractéristiques, description, toutes les
  photos (`full_url`), « Soumis par » + « Écrire », sous le bandeau « Aperçu — ce bien n'est pas
  encore publié » ; retour par la coque (téléphone) ou `BoutonRetour` (bureau, TCK-2617).
  Liens : « Ouvrir l'aperçu complet de la fiche » (téléphone, `:604`), « Ouvrir en grand »
  (bureau, `:625`) — clés existantes `bien.ouvrirApercu` / `bien.ouvrirEnGrand`, même onglet.
- **Écrire (AC4)** : `EcrireA` dans `Soumission` (les deux dispositions) : le fil à deux avec
  `submitted_by.id` (un `User`, vérifié dans `PropertyModerationChecks::submitter`), sinon le
  brouillon — jamais vers soi-même.
- **Fidélité (AC-F1)** : fiche `fidelite/TCK-2673.json` — écarts « Supprimer/Ignorer/⋯ absents »,
  « champ Chercher absent », « Autres avis / note / Locataire depuis absents » retirés ; « Ouvrir… /
  Écrire absents » réduit à la puce « Appartement » ; trois écarts neufs (autres avis publiés
  seulement, « Masquer » absent d'un avis publié pour l'agence, recherche du téléphone dans la
  feuille). **AC-F2 / AC-F3 non mesurés** (pas de navigateur, consigne du lot) : à 768 et 1024
  la file et le détail restent l'un sous l'autre (`max-xl:flex-col`, inchangé) ; le champ de
  recherche prend `w-full` sous `lg` dans la tête de page ; l'aperçu est en `max-w-5xl`, grilles
  à colonnes fractionnaires.

**Tests** : `ModerationWorkspace.test.tsx` (+9 : recherche, aucun résultat, « Tout cocher » sous
recherche, téléphone, note du sujet, autres avis absents, gestes de l'agence, sans capacité ;
suppression réécrite pour le texte exigé), `ApercuDuBienAValider.tck-2931.test.tsx` (5), `ModerationDetail.telephone.tck-2931.test.tsx` (1 : « ⋯ » → « Supprimer » → confirmation focalisée, coque doublée comme `EnTeteMobile`),
`properties/[id]/__tests__/layout.tck-2931.test.tsx` (5) ; mocks mis à jour dans
`ModerationDetail.double-facteur`, `ModerationDetail.signaleur.tck-2053`,
`ModerationSansCompteDeSignalements.tck-2722` (prop `platform` retirée, `can_dismiss_reports`
au témoin), `PropertyModerationDetail.tck-2673` (routeur et conversations doublés pour `EcrireA`).
19 ablations, toutes rouges puis restaurées par md5 (une première, sur `buildQueueParams`, restait
verte : test unitaire ajouté). Joués aussi : `fleche-de-retour-unique`, `a-traiter-lu-par-sa-page`,
`gardes`, `introuvable-de-detail`, `titres-onglets`, `PropertyModeration*` ; `tsc`, ESLint,
`check:i18n`, gardes `takussan-web/scripts` et racine (rouges hors de cette zone :
`check-env-production` — clés `VOICE_LAM_*` —, `check-models-spec`, d'autres agents).
