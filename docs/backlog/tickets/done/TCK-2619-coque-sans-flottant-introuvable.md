---
id: TCK-2619
title: "Coque de /app : plus de bouton flottant, la marque mène à /app, « Aujourd'hui » parle au verbe, un tiroir sans punaises, et une page introuvable qui aide"
status: done
phase: P1
family: front
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, navigation, audit-ux, app]
---

## Objectif utilisateur

Dans `/app`, rien ne recouvre le contenu, la marque ramène à l'espace de travail au lieu d'en faire sortir, la colonne dit ce qu'il faut faire, le tiroir se lit au pouce sans punaises, et une adresse fausse propose d'aller ailleurs plutôt qu'un cul-de-sac.

## Contrat de données

Aucun endpoint neuf. « Aujourd'hui » lit les compteurs qu'il lit déjà (`useCompteursDuMenu`). Les épingles restent dans `preferences.navigation` (ADR-0089 §6), et l'ordre des épingles est celui du tableau `epingles`. La page introuvable lit le menu composé et les « Récents » (TCK-2490), comme la palette.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-coque&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Accueil (admin) » (bureau : aucun bouton flottant), « Menu (tiroir) » (téléphone et bureau en mode « Modifier le menu »), « Compte et espaces », « Page introuvable ».
- **Bouton flottant « Messagerie »** : il est retiré de `/app` au bureau (décision 6 a de la famille), comme TCK-2481 l'a retiré du téléphone. Il reste sur le site public.
- **Marque** : dans la colonne et dans le tiroir, le logo mène à `/app`. Le menu du compte gagne « Voir le site public », qui mène à l'accueil public.
- **« Aujourd'hui » de la colonne, au verbe** : « Demandes à traiter », « Visites à confirmer », « Messages non lus », « Biens à valider », « Avis à modérer ». Le libellé dit l'action, l'entrée du menu dit la destination : la même file ne paraît plus deux fois sous le même nom.
- **Français** : « Entrées en attente » remplace « Onboardings en attente » dans le menu. La diapositive de bienvenue de l'agent dit « Vos demandes », et non « Vos leads ».
- **Tiroir (téléphone)** :
  - Les lignes font 44 px au doigt, sans punaise.
  - Un lien discret « Modifier le menu », en bas du tiroir, fait paraître punaises et poignées, avec le bandeau « Épinglez jusqu'à 5 pages · Terminé ».
  - Le pied du compte ouvre une **feuille du bas**, et non un menu déroulant posé dans le tiroir.
- **Bureau (≥ 1280)** : le même mode « Modifier le menu » (écran « Menu (tiroir) », bureau) remplace la punaise au survol. Les poignées ordonnent les épingles.
- **Page introuvable** :
  - H1 « Page introuvable », une icône de recherche barrée dans un disque, et la phrase actuelle (« Cet élément n'existe pas, ou il ne relève pas de votre agence… »).
  - Puis le champ « Aller à… » ouvert dans la page : 44 px au téléphone (la hauteur de la primitive `Input`, ADR-0106 § 2 c : la maquette dessine ce seul champ à 48 px), 480 px au bureau. Sous lui, les récents et quatre entrées du menu.
  - Puis « Retour à la liste » quand l'URL a une liste parente, et « Retour à l'accueil » (« Retour à Aujourd'hui » chez l'agent).
- **Mobile et bureau** : à 360–390, la page introuvable garde la barre d'onglets, et le bouton de retour reste atteignable au-dessus d'elle.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md).

**Pas de régression :**

- **Épingles** : 5 au plus, avec les replis de groupe, le rail de 60 px et l'enregistrement sur le compte ; la réinitialisation depuis le profil reste (TCK-2480).
- **Menu du compte** :
  - nom et courriel ;
  - « Changer d'espace » ;
  - solde de crédits si portefeuille ;
  - Mon profil ;
  - Préférences de notification ;
  - Administration si accès ;
  - Langue FR/EN/WO ;
  - Déconnexion.
- **« Aujourd'hui »** : il ne rend que les lignes non nulles, mène à la page filtrée sur ce qui attend, et n'apparaît ni pendant le chargement ni sur une erreur (ADR-0089 §5).
- **Page introuvable** :
  - un vrai `HTTP 404` ;
  - `<title>` « Introuvable — Takussan » ;
  - rendue dans la coque ;
  - message, champ « Aller à… » et retour principal portés par un composant serveur (`CorpsDeLIntrouvable`) ; l'écran se rend dans la coque après hydratation. Qu'ils soient dans le HTML du serveur n'est PAS tenu aujourd'hui, ni avant ce ticket : TCK-2740.

**Autres règles :**

- Le ChatWidget ne doit plus se monter sur `/app` à aucune largeur. Il reste sur le site public, avec ses deux formes actuelles.
- Un lien de notification ou d'e-mail vers `/app/messages?conversation=…` ouvre toujours le fil.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Retrait du lanceur « Messagerie » sur `/app` au bureau.
- [ ] Logo de la colonne et du tiroir vers `/app` ; « Voir le site public » dans le menu du compte.
- [ ] Libellés d'« Aujourd'hui » au verbe ; « Entrées en attente » ; « Vos demandes » dans la bienvenue de l'agent.
- [ ] Mode « Modifier le menu », au tiroir et à la colonne : punaises et poignées, ordre des épingles, « Terminé ».
- [ ] Menu du compte en feuille du bas au téléphone.
- [ ] Page introuvable : H1, « Aller à… » en ligne, récents et entrées du menu, deux retours.
- [ ] Tests :
  - aucun lanceur sur `/app` à 1280, toujours un sur `/fr` ;
  - `href` du logo ;
  - libellés d'« Aujourd'hui » ;
  - aucune punaise hors du mode « Modifier » ;
  - réordonner deux épingles écrit le nouvel ordre ;
  - 404 avec H1 et champ « Aller à… », rendus dans la coque après hydratation (le HTML du serveur : TCK-2740).

## Critères d'acceptation

- [ ] AC1 — À 1440 sur `/app/overview/agency`, aucun élément fixe ne recouvre le coin bas droit du contenu : `elementFromPoint` à 24 px des bords bas et droit rend un nœud du contenu. Sur `/fr`, le lanceur est présent.
- [ ] AC2 — Le logo de la colonne a `href="/app"`. « Voir le site public » mène à l'accueil public.
- [ ] AC3 — À 390, le tiroir ouvert ne contient aucun bouton « Épingler » (compte = 0) tant que « Modifier le menu » n'est pas touché. Après le geste, chaque ligne épinglable en porte un.
- [ ] AC4 — La ligne « Aujourd'hui » d'un admin avec une demande non traitée dit « Demandes à traiter 1 » et mène à la liste filtrée sur les non traitées.
- [ ] AC5 — La 404 de `/app` répond 404 et l'écran se rend dans la coque après hydratation : `GET /app/zzz` rend 404 ; au navigateur, un `h1` « Page introuvable » et un champ de recherche ; taper « baux » propose l'entrée « Baux » du menu du persona.
  - **Écart mesuré** (amendement du 2026-11-11, décision de la session, option (a)) : le critère exigeait aussi le `h1` et le champ dans le HTML du serveur. Sur `next build` + `next start`, la 404 de `/app` sort en document d'erreur de Next (`<html id="__next_error__">`, corps de 58 octets hors scripts) — mesuré sur deux builds : be658051c + ce ticket, et **46c0b49f1** (dev avant la fusion du lot 1). Préexistant, cause non établie : [TCK-2740](TCK-2740-la-404-de-app-sort-sans-html-serveur.md).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2619.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La variante « cet élément est dans l'espace Thiès Properties · Basculer » de la page introuvable : l'API ne distingue pas « inexistant » de « autre agence » sur une URL tapée. Elle reste là où l'objet connaît son agence (`LienDansLAgence` des notifications).
- Le choix d'espace et la ville dans le menu du compte (TCK-2620, TCK-2621).
- La modale de bienvenue elle-même, au-delà de son libellé (aucune maquette retenue).

## Notes d'implémentation

- **Lanceur « Messagerie »** : `estDansLaConsole(pathname)` (`layout/plein-ecran.ts`) — `ChatWidget` ne monte plus son corps sous `/app`, et `CorpsDuWidget` redit la règle. Mesuré à 1440 sur `/app/overview/agency` (comparateur vidé) : `elementFromPoint` à 24 px du coin rend `enveloppe-du-contenu`, aucun élément fixe ; sur `/fr`, le lanceur est là (14 px du bord droit, 24 du bas).
- **Marque** : `/app` dans la colonne, le rail et le tiroir (même composant). Les tests qui cherchaient « le » lien `a[href="/app"]` écartent désormais `[data-slot="marque"]`.
- **« Aujourd'hui » au verbe** : seule la clé `nav.sidebar.aujourdhui.lignes.unhandledLeads` changeait (« Demandes à traiter ») ; les quatre autres disaient déjà le verbe. ADR-0090 §3 cite encore « Demandes de contact » en exemple — non modifié.
- **Mode « Modifier le menu »** : état local à CHAQUE montage d'`AppSidebar` (tiroir et colonne ne s'ouvrent pas en édition l'un pour l'autre). Hors du mode, aucune punaise n'est rendue (la punaise au survol a disparu, `STYLE_EPINGLE` est réécrit). En édition : bandeau « Épinglez jusqu'à 5 pages · n sur 5 · glissez pour ordonner · Terminé », la colonne ne garde que ce qui s'épingle (ni action, ni « Aller à », ni « Aujourd'hui », ni « Démarrer », ni « Récents » ; le tableau de bord de l'admin n'est plus hissé). Ordre : `epinglesApresDeplacement` + `deplacerEpingle` du fournisseur (une seule écriture, `preferences.navigation`), par glisser (`@dnd-kit/core`, déjà au dépôt, capteurs pointeur et toucher) ou par les flèches haut/bas sur la poignée (WCAG 2.5.7). Poignées sur les seules épingles : les autres lignes ne s'ordonnent pas (écart à la maquette, motif dans la fiche).
- **Lignes du tiroir à 44 px** (`STYLE_LIGNE` `max-md:h-11`, action et « Démarrer » `min-h-11`) — mesuré 44 à 390.
- **Feuille du compte** : `FeuilleDuCompte` (sur `FeuilleDuBas`) sous `md` (`useMatchesMedia('(width < 48rem)')`, instantané serveur = menu), menu déroulant dès `md`. `EspacesDeLaFeuille` réutilise `useEspacesDuCompte`. Langue en trois boutons `aria-pressed`.
- **Page introuvable** : H1 « Page introuvable » (nouvelle clé `heading` ; `title` « Introuvable » reste celui de l'onglet), forme d'en-tête `racine` déclarée (un seul H1 à toute largeur, mesuré sur `/app/zzz` et `/app/leases/abc-zzz` à 390 et 1440), « Aller à… » en ligne : `useOptionsDeLaPalette` (sorti de `PaletteDeCommandes`, même index) via un contexte que la coque fournit (`ContexteDuMenuDeLaCoque`), liens et non `listbox`. « Retour à Aujourd'hui » quand la disposition nomme l'accueil `today`.
- **Ce que l'introuvable rend AU SERVEUR** : `not-found.tsx` est un composant serveur asynchrone qui rend `CorpsDeLIntrouvable` (sans directive) — H1, message, le champ « Aller à… » (un vrai `<form role="search">`, sans état React) et le retour à l'accueil, nommé au serveur par `accueilNommeAujourdhui` (rôles + profil actif, les entrées mêmes du layout ; `getMeAction` est en cache pour la requête). Le client (`SecoursDeLIntrouvable`) n'ajoute que la liste des pages : il écoute le champ par son `id`, filtre à la saisie, ouvre la première à Entrée. Motif : le relevé du 2026-08-27 (l'enfant client d'un introuvable serveur absent du HTML du 404, `next build` compris) ; la première version de ce ticket mettait le champ et le retour dans un composant client. Le contour du retour passe au discret derrière « Revenir à la liste » en CSS (`[[data-slot=retour-a-la-liste]~&]`), le serveur ne connaissant pas l'URL. `accueil-nomme.test.ts` refuse que `agenceIndividuelle`, inconnu du serveur, change la réponse pour un seul compte.
- ⚠ **HTML serveur du 404** : en `next dev`, les 404 de `/app` (notFound dans un layout comme dans une page) rendent un `<body>` vide hors scripts (`<template data-next-error-message="NEXT_HTTP_ERROR_FALLBACK;404">`) et `<title>` « Tableau de bord — Takussan » ; le contenu n'arrive qu'au rendu client. Le relevé du 2026-08-27 (docblock de `RetourVersLaListe`) disait l'inverse. **Même chose à HEAD** : le `not-found.tsx` d'avant ce ticket remis en place sous `next dev`, corps identique (69 octets hors scripts, gabarit de repli) — ce n'est pas une régression de TCK-2619. **Mesuré sur `next build` + `next start` (worktree propre, `npm ci`, port 3100)** : `/app/zzz`, `/app/leases/abc-zzz` et `/app/properties/99999999`, agent et admin, rendent **404** mais un document d'erreur de Next — `<html id="__next_error__">`, corps de 58 octets hors scripts, titre « Tableau de bord — Takussan » ; le H1, le champ et les retours ne sont que dans la charge RSC, et l'écran entier (coque comprise) est rendu au client — sans erreur de console, conforme au navigateur à 390 et 1440. **Même résultat avant le lot 1** (46c0b49f1, construit à part) : ni ce ticket ni le lot 1 n'en sont la cause. AC5, dans sa moitié « HTML de serveur », **n'est donc pas tenu**. La cause n'est pas établie ; deux explications, aucune vérifiée : TCK-426 (c0dc2af43) a retiré le 2026-08-27 la frontière de suspension ancêtre de `/app` pour que le statut 404 survive ; ou le relevé du 2026-08-27 (docblock de `RetourVersLaListe`) a lu la réponse entière, charge RSC comprise — la même lecture rendait « vrai » ici sur un corps vide. Lecture du corps : `corps.py`, scripts retirés (la charge RSC porte les textes : un `includes` sur la page entière est vert sur un corps vide).
- **Réserves de la vérification closes (2026-11-11)** : F7 (la liste des espaces dans la feuille du compte) est gardée
  par `FeuilleDuCompte.espaces.tck-2621.test.tsx`, livré avec TCK-2621 — RF7 rejouée rouge par verif-patrimoine ; d1
  (les ~25 absents d'icône) relève des maquettes et part en TCK-2742, `TCK-2619.absents.json` y renvoie (b629ba37c).
