---
id: TCK-560
title: "Fiches d'agent et d'agence : retour manquant, lien de propriétaire en 404, chargement de l'annuaire muet — re-mesurés sur dev ; cible tactile du retour portée à 44 px"
status: doing
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, fiche-agent, fiche-agence, annuaire, navigation, a11y, retour-testeur]
---

## Objectif utilisateur

Un visiteur qui ouvre la fiche d'un agent, d'une agence ou d'un particulier qui publie trouve un
retour visible, qu'on peut toucher au pouce, et qui le ramène là où il était (filtres compris).
Un lien vers la fiche d'un propriétaire n'aboutit jamais à un 404. Un clic sur une ville de
l'annuaire `/agents` se voit tout de suite.

## Contexte

Retour testeur du 2026-09-23 (preview.takussan.com), quatre points pour ce ticket (unité A1).
Chacun a été re-mesuré sur l'arbre `dev` local (`next dev`, API locale) et, pour ce qui se mesure
sans l'authentification Basic du front, sur la préproduction.

**Les quatre symptômes avaient déjà été signalés, et corrigés, par le lot « retours
d'administration » du 2026-09-16 (`cfe92ba8`)** : `/agents/owner.agency4` en 404, fiches sans
retour, clic sans retour visuel sur les villes de `/agents`. Ce lot est dans `origin/preview`
(`fc4faee1`, PR #302), et il y est **déployé depuis le 2026-09-16 à 12:27** (`images.yml`, PR #294,
vert) ; `preview.api.takussan.com/up` rend `X-Build-Sha: fc4faee1…`.

**Les captures datent d'un build antérieur à ce déploiement — établi, pas supposé.** Sur les
captures des fiches (agence « Thiès Properties », agent « Ndeye Diouf »), la colonne de droite
(description, boutons de contact) est alignée en HAUT, à hauteur du logo. L'alignement en bas
(`md:items-end`) a été introduit par `4b7b9138` (2026-09-16 22:33, déployé par #296 à 23:04) ; le
retour, par `cfe92ba8` (déployé par #294 à 12:27, plus tôt le même jour). Une capture sans le
bouton ET sans l'alignement en bas vient donc d'un build antérieur à 12:27 le 2026-09-16. Il
n'existe aucun service worker ni cache applicatif (`public/` ne contient que des SVG) qui aurait
pu servir une page périmée.

### W3 / W4 — « Bouton retour manquant » (fiche agence, fiche agent, desktop) — **non reproduit**

- `BoutonRetour` (`components/shared/BoutonRetour.tsx`) est rendu sur les deux fiches, testé par
  `agents/[slug]/__tests__/page.server.test.tsx` et `agencies/[slug]/__tests__/page.server.test.tsx`.
- Mesuré au navigateur (CDP) à 1400, 390 et 320 px : présent, **non recouvert** par la barre fixe
  (`elementFromPoint` au centre rend le lien), repli `/fr/agents` / `/fr/agencies`.
- Parcours `/fr/agents?city=Saint-Louis` → fiche → « Retour » → `/fr/agents?city=Saint-Louis` :
  la page quittée revient avec son filtre.
- **Défaut trouvé en chemin : la cible mesurait 85 × 32 px**, sous les 44 px d'une cible tactile,
  à 390 comme à 1366 — c'est le geste qu'on cherche au pouce sur une fiche. Corrigé (`min-h-11`),
  mesuré 85 × 44 après.

### W5 — `https://preview.takussan.com/agents/owner.agency4` en 404 — **non reproduit**

- **D'où vient le lien** : `owner.agency4` est le `username` d'un propriétaire (« Property Owner »),
  servi comme slug public par l'API (`PropertyResource::buildOwner()` → `owner.slug`, TCK-177). Le
  front le suit dans `PropertyAgentCard` (fiche de bien), `TeamStrip` (équipe d'agence) et l'index
  `/agents` (`ProfileCard`). Qu'un propriétaire ait une fiche sous `/agents` est la définition
  retenue par TCK-436 (§ 1, option b), pas un accident.
- **Pourquoi c'était un 404** : la capture montre le 404 **racine** (`app/not-found.tsx`, sans
  barre de navigation), pas celui de la fiche d'agent (qui a la barre) : l'URL ne correspondait à
  aucune route. C'est le mécanisme corrigé par `cfe92ba8` : le `matcher` du proxy et
  `estCheminLocalisable` prenaient `.agency4` pour une extension de fichier, le proxy ne préfixait
  pas la langue, `/agents/owner.agency4` n'appariait rien.
- Mesuré : API de préproduction `GET /api/public/agents/owner.agency4` → **200** ; front local
  `/agents/owner.agency4` → **307** `/fr/agents/owner.agency4` → **200** (titre rendu). Balayage des
  **44** slugs de l'index public local : 4 contiennent un point (`owner.agency1` à `4`), **tous 200**.

### W6 — « Un loader plus visible » sur `/agents` (villes) — **non reproduit**

Mesuré au navigateur, clic sur « Saint-Louis » (état relevé toutes les 40 ms) : dès **43 ms**, la
puce est sélectionnée (`aria-pressed`) et porte un indicateur qui tourne, une barre de 3 px court
en haut de l'écran (`role="status"`), la zone porte `aria-busy` ; les résultats sont estompés à
50 % dès 200 ms ; tout se lève à l'arrivée de la page (784 ms en local). À 320 px, la puce et la
barre sont dans le premier écran. La capture du testeur montre l'état final, et appartient au lot
daté ci-dessus.

## Critères d'acceptation

- [x] AC1 — sur `/fr/agents/<slug>` et `/fr/agencies/<slug>`, à 1400, 390 et 320 px, un lien
      « Retour » est rendu et c'est lui qu'on touche en son centre (non recouvert par la barre).
- [x] AC2 — sa cible mesure au moins 44 px de haut au navigateur (85 × 44 à 390 et 1400) ; sans
      `min-h-11`, 85 × 32 et le test `offre une cible tactile de 44 px` échoue (ablation).
- [x] AC3 — `/fr/agents?city=Saint-Louis` → fiche → « Retour » rend `/fr/agents?city=Saint-Louis`.
- [x] AC4 — chaque slug de l'index public d'agents, points compris, rend 200 sur `/fr/agents/<slug>`.
- [x] AC5 — un clic sur une ville de `/agents` produit un état visible en moins de 100 ms (puce
      sélectionnée + indicateur, barre en haut de l'écran).
- [ ] AC6 — rejoué sur preview.takussan.com (authentification Basic : hors de portée de l'agent).

## Hors périmètre

- Présenter un propriétaire comme « Agent immobilier » (titre, balisage `RealEstateAgent`) sur
  sa fiche `/agents/<username>` : décision de TCK-436 (§ 1, option b), à rouvrir par une personne.
- Les puces de villes de `/agents` mesurent 36 px de haut (`min-h-9`), sous les 44 px ; et à
  320 px, le placeholder « Nom d'un agent » est tronqué. Relevés, non traités ici
  (`components/public/index/`).
- La barre de chargement des navigations par LIEN (cartes, pagination, équipe) : unité A2,
  `IndicateurDeNavigation`.

## Notes d'implémentation

- `components/shared/BoutonRetour.tsx` : `min-h-11` ; test `offre une cible tactile de 44 px`
  dans `components/shared/__tests__/BoutonRetour.test.tsx`. Le composant est aussi consommé par
  `components/auth/RetourAuth.tsx` (unité A2), qui hérite de la cible de 44 px.
- Aucune modification côté API : W5 n'en exigeait aucune.
