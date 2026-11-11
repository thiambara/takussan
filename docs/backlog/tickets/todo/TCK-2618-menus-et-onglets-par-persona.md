---
id: TCK-2618
title: "Menus et onglets par persona : « Aujourd'hui » pour l'agent, « Argent » pour l'admin, « Loyers » pour le bailleur, et les favoris dans la coque"
status: todo
phase: P1
family: front
estimate: L
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2622, TCK-2628]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, coque, navigation, mobile, adr-0089, adr-0090, audit-ux, app]
---

## Objectif utilisateur

Chaque persona trouve sous le pouce et en tête de colonne ce qui fait son métier : l'agent sa journée, l'admin d'agence son argent, le bailleur ses loyers, et le client ses favoris sans changer de coque.

## Contrat de données

Aucun endpoint neuf. Les changements portent sur les dispositions par persona (`DISPOSITIONS`, ADR-0089 §3) et sur les onglets qui en dérivent (`ongletsDuMenu`, TCK-2481) ; le catalogue reste l'unique juge de l'accès. Les favoris lisent ce que la page publique lit déjà (favoris du compte, recherches sauvegardées et leurs nouveautés, TCK-2507 et suivants).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-coque&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Accueil (admin) », « Menu (tiroir) », « Persona · bailleur », « Persona · locataire », « Persona · prestataire », « Page introuvable » (barre de l'agent). Les menus et onglets de toutes les personas sont écrits dans `PERSONAS_APP` de `…/maquettes/chrome-app.tsx`. Pour la page « Aujourd'hui » de l'agent : `?p=app-aujourdhui&a=a` (famille 5).
- **Décision 10 (a) — l'agent** :
  - **Onglets** : « Aujourd'hui · Demandes · Clients · Messages · Menu ». « Aujourd'hui » (icône soleil) mène à `/app`. « Visites » quitte la barre et reste dans « Prospection ».
  - **Colonne** : « Aujourd'hui » ouvre la tête de colonne (« Aujourd'hui · Messagerie · Tâches »). « Mes tâches » devient « Tâches ». L'entrée « Tableau de bord » disparaît : c'est la même destination, sous le nom « Aujourd'hui ».
- **Décision 12 (a) — l'admin d'agence** : onglets « Accueil · Argent · Biens · Messages · Menu ». « Argent » (icône portefeuille) mène aux finances de l'agence. Les demandes quittent la barre et restent dans le menu (« Activité ») et dans « Aujourd'hui » de la colonne.
- **Le bailleur** (persona `bailleur`, toujours rattaché à une agence ; recommandation c de la famille, validée) : onglets « Accueil · Biens · Loyers · Messages · Menu ». « Loyers » (icône portefeuille) mène à ses paiements, et l'entrée « Finances » de « Mon patrimoine » s'appelle « Loyers » — mot **décidé par le porteur le 2026-11-10** ([ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 3), le même que le titre de la page (TCK-2651). Les demandes restent dans le menu et dans « Aujourd'hui ».
- **Hôte, prestataire, locataire, client** : onglets inchangés.
- **Partout** : le libellé d'onglet est « Messages », et non « Messagerie », qui est tronqué à 360 px avec une pastille. L'onglet actif a son icône en couleur primaire, en plus du trait et du gras (écart relevé au § 1 de l'audit).
- **Favoris (décision 4 b de la famille, validée)** : `/app/favorites` et `/app/saved-searches` rendent la page de favoris du site public, avec ses onglets « Biens · Recherches · Nouveautés », **dans la coque de `/app`** (colonne ou barre d'onglets, sans la barre ni le pied du site). Chaque route ouvre l'onglet qui lui correspond. L'onglet « Favoris » du client et le cœur de la barre publique mènent ainsi au même contenu.
- **Mobile (360–390)** : cinq cases égales. Aucune ne déborde à 360 (le libellé le plus long est « Aujourd'hui »).
- **Bureau (≥ 1280)** : la colonne change selon les mêmes décisions ; les onglets n'existent pas.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0096](../../../adr/0096-l-accueil-est-la-journee-et-les-rapports-sont-une-page.md), [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).

**Règles d'ADR-0089 :**

- Aucune destination accessible n'est perdue. Ce qui quitte une barre reste dans le tiroir et dans la colonne.
- Un onglet que le menu du persona ne rend pas cède sa place à la destination suivante de la disposition, jamais à un cadenas.
- Le masquage des modules d'agence (`hidden_modules`) continue de s'appliquer aux personas du personnel.

**Ce qui doit rester :**

- Les épingles de l'utilisateur. Une épingle sur « Tableau de bord » chez l'agent reste valide, puisque c'est la même destination, désormais « Aujourd'hui ».
- Les replis, le rail d'icônes et les compteurs des onglets (pastille 99+).
- La région `aria-live` des non-lus.

**Favoris : rien ne se perd des deux pages actuelles.**

- *Favoris* : retirer, « Voir des biens similaires », bien retiré du marché signalé, états vide et erreur.
- *Recherches sauvegardées* :
  - relancer (filtres rejoués) et supprimer, avec le refus de suppression expliqué (P210-03) ;
  - l'**alerte par recherche** : interrupteur et canaux ;
  - le résumé des critères : villes, équipements.

Toute fonction de ces pages absente de la page publique y est ajoutée avant que les routes de `/app` ne la rendent. Sinon, la route garde sa page actuelle.

**Rendre la page publique dans la coque :**

- Elle n'y rend ni `Navbar` ni `Footer`, et son contenu principal garde l'identifiant que vise le lien d'évitement.
- Les liens internes de la page publique (`LienLocalise`) restent justes sous `/app`, qui n'a pas de segment de langue.

**Libellés :** les libellés neufs (« Aujourd'hui », « Argent », « Loyers », « Tâches », « Messages ») partent en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Dispositions :
  - **agent** : tête avec « Aujourd'hui », icône soleil, libellé propre au persona ; « Tâches » ; plus de groupe « Tableau de bord » ; onglets Aujourd'hui · Demandes · Clients · Messagerie ;
  - **admin d'agence** : onglets Accueil · Finances de l'agence · Biens · Messagerie ;
  - **bailleur** : onglets Accueil · Biens · Paiements · Messagerie, et libellé « Loyers » sur les paiements.
- [ ] Libellé d'onglet « Messages » ; icône active en couleur primaire.
- [ ] La place du tableau de bord (ADR-0090 §4) change EXPRÈS pour l'agent : `dispositions-validees.test.ts` est mis à jour, et l'écart est écrit ici.
- [ ] `/app/favorites` et `/app/saved-searches` rendent la page de favoris dans la coque, sur l'onglet voulu.
- [ ] Tests :
  - les cases exactes des huit personas (table ci-dessus) ;
  - l'agent sans « Tableau de bord » mais avec « Aujourd'hui » en tête ;
  - l'épingle d'un agent sur le tableau de bord toujours rendue ;
  - un onglet inaccessible remplacé ;
  - les favoris rendus sans `Navbar` sous `/app`, avec l'onglet « Recherches » ouvert par `/app/saved-searches`.

## Critères d'acceptation

- [ ] AC1 — À 390, les libellés de la barre (dans l'ordre, « Menu » compris) sont :
  - agent : « Aujourd'hui, Demandes, Clients, Messages, Menu » ;
  - admin d'agence `standard` : « Accueil, Argent, Biens, Messages, Menu » ;
  - bailleur : « Accueil, Biens, Loyers, Messages, Menu » ;
  - hôte, prestataire, locataire et client : leurs cases d'avant le ticket, au libellé « Messages » près.
- [ ] AC2 — À 1280, la colonne de l'agent commence par « Aujourd'hui, Messagerie, Tâches » et ne contient aucune entrée « Tableau de bord ». L'onglet « Aujourd'hui » et l'entrée « Aujourd'hui » ont tous deux `href="/app"`.
- [ ] AC3 — Aucune destination ouverte avant le ticket ne disparaît du menu composé, pour aucun persona (test qui compare les jeux d'`href` avant et après). Seul le doublon `/app` de l'agent fusionne.
- [ ] AC4 — À 390, l'onglet actif a une icône dont la couleur calculée vaut `--primary`.
- [ ] AC5 — Un client connecté sur `/app/saved-searches` voit l'onglet « Recherches » ouvert, dans la coque de `/app` : barre d'onglets présente, aucun `nav` du site public. Il désactive l'alerte d'une recherche, et `PATCH` part avec l'alerte désactivée (vérifié au réseau).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2618.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'entrée « Rapports » et la disparition de « Vue agence », « Statistiques », « Indicateurs », « Alertes » et « Exports » (TCK-2628).
- Le contenu de la page « Aujourd'hui » (famille 5), de la page « Argent » (famille 6) et des loyers du bailleur (famille 4).
- Le choix des onglets par l'utilisateur.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
