---
id: TCK-2494
title: En-tête public de bureau sur une ligne, et menu « Mon espace » du profil connecté
status: todo
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2493]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, desktop, adr-0091, audit-ux]
---

## Objectif utilisateur

En bureau, le visiteur atteint Agences sans descendre au pied de page, et le connecté retrouve son espace (loyer, visites, demandes, messages) depuis n'importe quelle page publique.

## Contrat de données

Aucun endpoint neuf : lignes et compteurs du menu « Mon espace » = destinations et compteurs du persona actif (ADR-0089), comme la barre de TCK-2493.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=navigation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes), vues Bureau des écrans « Anonyme », « Locataire », « Agent » et « Par profil » (trois menus côte à côte).
- Une seule ligne : marque, Louer · Acheter · Agences, recherche, favoris, compte, « Publier un bien ».
- La rangée de catégories ne reste que sur les pages de découverte (accueil, liste) ; elle quitte la fiche et les pages d'outils.
- Connecté : bouton « Mon espace » avec avatar et point de notification ; le menu montre les lignes du persona avec un détail et un compteur, puis « Ouvrir mon espace », la langue et la déconnexion.

## Contraintes strictes (métier)

- Le menu ne propose jamais une destination que le persona ne peut pas ouvrir (même composition que `/app`).
- « Publier un bien » reste dans l'en-tête pour les pros, et aussi en tête de leur menu (décision du porteur, 2026-11-08).

## Delta à produire

- [x] En-tête public de bureau sur une ligne, Agences dans la navigation.
- [x] Rangée de catégories limitée aux pages de découverte.
- [x] Menu « Mon espace » dérivé du persona, avec compteurs.
- [x] Tests : lignes du menu par persona ; rangée absente sur la fiche.

## Critères d'acceptation

- [x] AC1 — À 1440 px, Agences est dans l'en-tête de chaque page publique de découverte.
- [x] AC2 — Un locataire connecté ouvre « Mon espace » et voit Loyer (avec le montant dû), Interventions, Mon bail, Documents, Messages ; un agent voit Demandes, Visites, Clients, Agenda, Mes biens.
- [x] AC3 — La fiche d'un bien n'a plus la rangée de catégories.
- [x] AC4 — Aucun débordement horizontal de l'en-tête entre 1024 et 1440 px.

## Hors périmètre

- La barre d'onglets mobile (TCK-2493).
- La recherche dans l'en-tête (TCK-2497).

## Notes d'implémentation

Mesures du 2026-11-09 au navigateur (chrome-devtools, `next dev`, branche `feat/audit-ux-vague-1`),
émulation bureau à facteur 1 :

- **AC1** — `Louer · Acheter · Agences` dans l'en-tête de `/fr`, `/fr/properties`, `/fr/agencies`
  (« Agences » `aria-current`) et de la fiche, à 1440. Les liens sont une `<ul>` dans l'unique
  `<nav>` de l'en-tête : un second `<nav>` imbriqué faisait rougir les tests de contraste
  (plusieurs rôles `navigation`).
- **AC2** — locataire `aliou-sene-k3sd@example.com` (6 échéances en retard) à 1440 : lignes
  `Loyer — 6 343 953 F CFA en retard · Interventions · Mon bail · États des lieux · Documents ·
  Messagerie · Mes favoris · Recherches sauvegardées`, puis « Ouvrir mon espace », « Mon profil »,
  FR/EN/WO, « Se déconnecter ». Agent `agent1@dakarimmo.sn` : « Publier un bien » en tête, puis
  `Demandes · Visites (13) · Mes tâches · Clients (CRM) · Calendrier · Mes biens · Messagerie (99+)`
  — « Agenda » de l'AC est l'entrée `calendrier` ; « Mes tâches » vient de la disposition de l'agent
  (ADR-0089), source unique, et n'est pas retirée ici. Bouton : « Mon espace, 194 éléments en
  attente ».
  - « Loyer » n'existe dans aucun libellé de `/app` : `libellePublic(id, persona)`
    (`lib/navigation/barre-publique.ts`) le donne aux paiements **du locataire seul** (ceux du
    bailleur sont ses encaissements), lu par la barre, « Moi » et ce menu.
  - Le montant : `useDetailDuLoyer` (`useRappelDuPersona.ts`), dans l'ordre de la carte de rappel —
    un retard (« 6 343 953 F CFA en retard ») avant l'échéance à venir (« 150 000 F CFA · dû le
    5 déc. »). Aucun locataire des seeds n'a d'échéance à venir non payée (`lease_payments` :
    seulement `paid` et `late`) : la forme « dû le » n'est éprouvée qu'en test.
- **AC3** — fiche à 1440 : pas de rangée de catégories, cale 74,6 px = barre 74,6 px.
- **AC4** — anonyme et agent connecté, `/fr/agencies` : dernier contrôle de l'en-tête à droite
  1002 px (1024), 1258 px (1280), 1418 px (1440) ; tous sur une ligne (sommets 16-26 px) ;
  `scrollWidth − innerWidth = 0` aux trois largeurs.
- **La cale suit la barre** (`NavbarSpacer`, `data-decouverte`) : 74,6 px hors découverte aux trois
  largeurs ; sur l'accueil, barre 127 px et cale 136 px — l'écart de 9 px est antérieur.
- **Contraste** : la ligne surlignée du menu passait en `bg-primary/90` (4,18:1) ; elle passe sur
  `--primary-deep`.
- Tests : `components/home/__tests__/Navbar.en-tete-bureau.test.tsx` (15),
  `navigation-publique/__tests__/espace-public.test.tsx` (« Mon espace »),
  `lib/navigation/__tests__/barre-publique.test.ts` (`lignesDeMonEspace`, `libellePublic`).
  Ablations (copie, retrait, rouge, `cp`, md5) : rangée de catégories, ordre « Loyer » du menu,
  destination de la déconnexion, libellé « Loyer » (et sa restriction au locataire), montant en
  retard.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (en-tête de bureau Louer · Acheter · Agences, rangée de catégories, « Mon espace », « Loyer » du locataire).
- **Corrections de revue (2026-11-09)** :
  - Entre 1024 et 1279 px, la pastille de crédits de l'en-tête n'a pas la place. « Mon espace » de
    l'admin et de l'hôte reprend donc « Crédits » et son solde. Relevé à 1024 : ligne « Crédits :
    0 crédit », pastille masquée. À 1440 : la pastille est visible et la ligne n'est pas dans le menu.
  - Le nom du bouton est posé par `aria-label` : « Mon espace, 60 éléments en attente », sans
    espace avant la virgule. Chrome en insérait une entre le texte et le `sr-only`.
  - La hauteur de la cale des pages de découverte (`lg:data-decouverte:h-[136px]`) est gardée par
    un test.
