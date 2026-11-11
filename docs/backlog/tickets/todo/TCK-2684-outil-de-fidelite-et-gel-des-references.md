---
id: TCK-2684
title: "Fidélité au pixel : l'outil qui compare une page de /app à sa maquette, et le gel des références mesurées"
status: todo
phase: P1
family: technique
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2692, TCK-2580, TCK-2581, TCK-2584, TCK-2586, TCK-2587, TCK-2589, TCK-2590, TCK-2592, TCK-2594, TCK-2596, TCK-2597, TCK-2598, TCK-2600, TCK-2601, TCK-2602, TCK-2603, TCK-2604, TCK-2606, TCK-2608, TCK-2611, TCK-2613, TCK-2614, TCK-2617, TCK-2618, TCK-2619, TCK-2621, TCK-2622, TCK-2624, TCK-2625, TCK-2628, TCK-2629, TCK-2632, TCK-2634, TCK-2635, TCK-2636, TCK-2638, TCK-2639, TCK-2641, TCK-2643, TCK-2644, TCK-2645, TCK-2647, TCK-2648, TCK-2650, TCK-2651, TCK-2653, TCK-2654, TCK-2656, TCK-2659, TCK-2660, TCK-2662, TCK-2664, TCK-2667, TCK-2668, TCK-2670, TCK-2671, TCK-2673, TCK-2675, TCK-2677, TCK-2678, TCK-2682]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, outillage, audit-ux, app, fidelite]
---

## Objectif utilisateur

Le porteur et l'implémenteur d'un ticket de page savent, mesure à l'appui, si l'écran réel de `/app` est le même que la maquette retenue — bordures, rayons, tailles, marges, couleurs, typographie, icônes —, au téléphone et au bureau, avant d'ouvrir la PR.

## Contrat de données

Aucun changement d'API.

- **Lit** : la visionneuse des maquettes servie par l'arbre principal (`http://localhost:3000/fr/playground/maquettes?p=<page>&a=<approche>&e=<écran>`), et la page réelle de `/app`, servie par l'arbre principal ou par un worktree (`--base http://localhost:3100`), connectée à une persona de démo.
- **Produit** :
  - des **relevés** : un JSON de nœuds (texte, boîte, icône) avec leurs styles calculés, et une capture de l'écran seul ;
  - des **comparaisons** : `rapport.md`, `rapport.json`, `difference.png`, `superposition.png`, `cote-a-cote.png`, `rideau.html` ;
  - des **références gelées** : un JSON par écran retenu et par appareil, versionné. Les images restent hors de git.
- **Jetons de persona** : frappés par l'outil lui-même (le motif de `jetons.php` de l'audit, par `php artisan tinker`), écrits **hors du dépôt** dans un fichier `chmod 600`, **jamais imprimés** : ni sur la sortie, ni dans un rapport, ni dans une URL.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire — [synthèse](../../../qa/audit-ux-2026-11/fidelite-au-pixel.md). Ce ticket n'arbitre rien : il outille la mesure. **Ses propres exceptions** : aucune.

La méthode est celle de l'[annexe D](../../../qa/audit-ux-2026-11/fidelite/D-methode.md), éprouvée sur `?p=app-notifications&a=a`, écran « Historique », contre `/app/notifications`. Le prototype (538 lignes) est `…/scratchpad/fidelite/methode/fidelite.mjs` dans le dossier de session — chemin non versionné, cité en D § 10.

**Références de mesure (décidé par le porteur le 2026-11-10, décision 1 a ; [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 1)** :

| Appareil | Fenêtre | DPR | `rem` | Comment la maquette est rendue |
|---|---|---|---|---|
| Téléphone | 390 × 844 | 2 | **16** (taille réelle) | cadre téléphone sorti de la visionneuse, `html { font-size: 100% }` injecté, arrondis et ombre du cadre retirés (D § 1.4, artefacts 1 et 3) |
| Bureau | 1440 × 900 | 2 | 14,4 tant que TCK-2692 n'est pas fusionné ; ensuite **16, densité ×0,9 par les jetons** ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), au même rendu | cadre bureau sorti de la visionneuse, échelle 1, bordure retirée → 1440 px utiles (artefact 2), fausse barre d'adresse masquée |

Jamais une capture de la visionneuse vue au bureau : elle réduit le bureau à 73 % et rend le téléphone à `rem` 14,4 dans une fenêtre de bureau (C § 1.1). Une option `--rem 14.4` permet de relever ce que le porteur a vu, pour mémoire seulement.

**Comment obtenir la référence téléphone** (relevé de fid-coque, balayage complet des 204 écrans, [annexe C § 1](../../../qa/audit-ux-2026-11/fidelite/C-coque.md), tableau du `rem` relevé) : la visionneuse **ouverte dans une fenêtre de moins de 768 px** échappe aux 90 % — `rem` 16, en-tête de 56 px, barre d'onglets de 64 px. Deux réserves : une barre de navigation de 44 px s'y ajoute (la maquette n'a que 800 px de haut) et le haut est arrondi ; l'outil sort donc le cadre à 390 × 844 plein (méthode d'`isoler-tel.js`, C § 1.2). **La visionneuse est en cours de modification par la session** pour rendre ses cadres dans des iframes (téléphone 390 à `rem` 16 ; bureau à 1440, 1280 et 1024) : quand ce mode existe, l'outil relève **dans l'iframe** (son `rem`, sa fenêtre) et n'a plus à injecter `font-size: 100%` ; les deux voies rendent les mêmes mesures (AC3).

**Tolérances par défaut** (D § 6.3) :

| Propriété | Tolérance |
|---|---|
| Police, taille, graisse, rayon, épaisseur de bordure, ombre (chaîne exacte), trait et taille d'icône | exacte |
| Couleurs | ±3/255 par canal, alpha ±0,02 |
| Dimensions d'un élément d'interface, marges internes, `gap` | ±1 px |
| Position d'une ancre | ±2 px |
| Tailles dépendant des données | hors garde |
| Pixels d'une zone à contenu identique (coque, tête de page, barre de filtres) | ≤ 0,5 % au seuil RVB 40, à étalonner sur les trois premiers tickets |

**Ce que l'outil rend au porteur** : un tableau par écran et par appareil (`conformes · écarts · absents · % pixels`), et le rideau glissant (`rideau.html`) sur lequel il valide.

## Contraintes strictes (métier)

**Pas de régression.** L'outil ne touche à rien de ce qui existe :

- les maquettes restent **non versionnées** (`.git/info/exclude`, l. 64-65) : l'outil versionné est générique et ne contient **aucune** maquette ni aucun extrait de leur code (README de l'audit, § Maquettes : « on en reprend le résultat, jamais le code ») ;
- la visionneuse et `src/app/[locale]/(public)/playground/maquettes/` ne sont pas modifiées ;
- `capture.mjs` et les outils de l'audit dans le dossier de session ne sont pas une dépendance : l'outil versionné porte son propre Chrome jetable et ses créneaux (deux captures à la fois au plus, comme `capture.mjs`).

**Autres règles :**

- **Sécurité des jetons** : aucun jeton dans le dépôt, sur la sortie standard, dans un rapport ni dans une URL ; fichier `chmod 600` hors dépôt ; les sorties de l'outil ne citent qu'un nom de persona.
- **Aucune dépendance implicite** : `sharp` n'arrive aujourd'hui que par `next` (D § 2) ; l'outil le déclare en `devDependency` explicite. `pixelmatch` est permis s'il sert (2 paquets purs JS) ; rien d'autre.
- **Aucune suite de tests lancée par l'outil**, et l'outil n'est pas joué en CI : la CI n'a ni l'application servie ni la base de démo (D § 6.2). Seule sa logique de comparaison, sur fixtures JSON, est éprouvée par un test du dépôt.
- **Le gel se fait APRÈS la revue du porteur** (décidé le 2026-11-10) : le porteur revoit d'abord les écrans téléphone à taille réelle (390 à `rem` 16) et valide les maquettes à 1280 que la session dessine pour les pages qui se dégradent (décision 3 b) ; une référence gelée avant cette revue n'est pas un contrat. Le journal du gel date chaque page et cite la revue qui la précède.
- **Un compte locataire avec un bail actif est un prérequis mesuré.** Le compte de démo « locataire » des outils de l'audit (`customer@agency1.demo.takussan.sn`) s'affiche avec le menu d'un **client** (onglets « Favoris · Visites ») : il ne peut pas servir aux écrans « Persona · locataire » (disposition `locataire` de `dispositions.ts:112`, onglets « Paiements · Maintenance », C § 2.3). L'outil se sert d'un compte dont le profil actif est locataire, trouvé dans la base de démo ou créé par un seeder idempotent du dépôt — **jamais** par `migrate:fresh` — et le relevé vérifie la disposition rendue avant de comparer.
- **Le gel est long** (~400 relevés × ~5 s ≈ 35 min machine au repos, D § 6.2) : il se découpe en lots de moins de 9 minutes, que la session principale lance elle-même (CLAUDE.md, « une commande de plus de ~10 minutes ne peut pas être déléguée »).
- **Échec bruyant** : l'outil échoue si l'écran relevé n'est pas exactement 390 × 844 ou 1440 × ≥ 900 à l'échelle 1, si `html` n'a pas le `rem` attendu (le relevé porte aussi la densité mesurée, `--spacing` calculé, pour qu'un relevé d'avant et un d'après TCK-2692 se comparent en connaissance de cause), si les polices ne sont pas chargées (`document.fonts.ready`), ou si un relevé ne contient aucun nœud. Un relevé vide n'est pas un relevé conforme.
- Libellés de l'outil et de sa documentation : français, sans i18n (outil de développement).

## Delta à produire

- [ ] L'outil versionné `takussan-web/scripts/fidelite/` à partir du prototype, avec trois commandes :
  - `releve` : une maquette (`--maquette <page> --a <approche> --e <écran>`) ou une page (`--url /app/… --persona <nom>`), `--device mobile|desktop`, `--base`, `--defiler <px>`, `--perturber <script>`, `--rem 14.4`, `--out` ;
  - `compare` : maquette contre produit, avec `--roles`, sorties listées au contrat ;
  - `geler` : relève toutes les références d'une page (ou de toutes) et les écrit au gel.
- [ ] Les **neutralisations** des artefacts de la visionneuse (D § 1.4), le déterminisme (animations, curseur, barres de défilement, `hover: none` / `pointer: coarse` au téléphone des deux côtés, attente des polices).
- [ ] Les **rôles de coque communs** des deux appareils (barre d'onglets, en-tête téléphone, barre latérale, zone de contenu), versionnés à côté de l'outil.
- [ ] La **frappe des jetons de persona** hors dépôt, `chmod 600`, sans impression.
- [ ] Le **recensement des écrans** par la visionneuse elle-même (la liste d'écrans de l'approche retenue telle qu'elle la rend), et non par un motif dans les fichiers : cinq pages (agenda, assistants, fil commercial, réservations, visites) déclarent leurs écrans dans un fichier voisin (D § 1.1).
- [ ] Le **gel des références**, après la revue du porteur, de tous les écrans retenus (33 pages, ~200 écrans, téléphone 390 et bureau 1440 ; **plus 1280** pour les pages dont la session a dessiné l'écran à 1280) sous `docs/qa/audit-ux-2026-11/fidelite/references/<page>/<approche>-<écran>-<appareil>.json`, chaque fichier daté et portant le commit de l'arbre et le `rem` mesuré. Les images (PNG ou WebP) vont à côté des maquettes, hors de git. Un journal du gel (page, écrans, date) accompagne les références.
- [ ] Le **modèle de fiche de fidélité** d'un ticket, `docs/qa/audit-ux-2026-11/fidelite/TCK-NNNN.json` (écrans, références gelées, persona, route, état à reproduire, rôles, zones, alias de libellés), avec un exemple complet sur Notifications.
- [ ] La **documentation d'usage** (`docs/qa/audit-ux-2026-11/fidelite/README.md`) : installation, les trois commandes, depuis un worktree, la lecture d'un rapport, les tolérances, les critères types AC-F1 à AC-F5 de D § 7 prêts à recopier dans un ticket de page, ce que l'outil n'attrape pas (D § 5).
- [ ] Le dossier de sortie des rapports (`takussan-web/.fidelite/`) ignoré par git.
- [ ] Un test de la logique de comparaison sur fixtures JSON (sans Chrome) : déterminisme et sensibilité.

## Critères d'acceptation

- [ ] AC1 — **Déterminisme.** Deux `releve` successifs de `?p=app-notifications&a=a` (« Historique »), puis deux de `/app/notifications` (persona `admin`), au téléphone et au bureau, rendent des JSON identiques à l'octet, hors champ de date ; `compare` d'un relevé contre lui-même rend 0 écart et 0 % de pixels.
- [ ] AC2 — **Sensibilité (E2 de D).** Les six perturbations de D § 4.2 (rayon, marge +2 px, couleur de texte, graisse, couleur de bordure, hauteur +4 px), injectées par `--perturber` dans la maquette et **chacune vérifiée avant → après**, sont toutes rapportées, avec l'élément et la propriété, et aucun autre écart n'apparaît. Le test sur fixtures rejoue les six et rougit si l'on retire la comparaison d'une seule propriété (ablation).
- [ ] AC3 — **Référence téléphone à taille réelle.** Le relevé téléphone d'une maquette porte `rem = 16` et un écran de 390 × 844 ; l'en-tête de `?p=app-coque&a=a` y mesure 56 px et la barre d'onglets 64 px (C § 1.1). Avec `--rem 14.4`, les mêmes mesurent 50,4 et 57,6 px. Si la visionneuse rend en iframe, le relevé dans l'iframe et le relevé par cadre isolé sont identiques (0 écart).
- [ ] AC4 — **Gel complet.** Pour chacune des 33 pages retenues, le nombre de références gelées par appareil est égal au nombre d'écrans que la visionneuse rend pour l'approche retenue (moins les écrans déclarés sans bureau, comptés et nommés au journal) ; chaque page dessinée à 1280 a ses références à 1280. Le compte total est écrit au journal, page par page, avec la date de la revue du porteur qui précède le gel.
- [ ] AC8 — **Persona locataire.** Le relevé de `/app` avec le compte locataire de l'outil rend la barre d'onglets « Paiements · Maintenance » (et non « Favoris · Visites ») ; un relevé pris avec le compte `customer@agency1.demo.takussan.sn` pour un écran « Persona · locataire » sort en erreur.
- [ ] AC5 — **Comparaison sans les maquettes.** Depuis un worktree qui n'a pas `playground/maquettes/`, `compare` d'un relevé produit contre une référence gelée fonctionne (`--base http://localhost:3100`).
- [ ] AC6 — **Échec bruyant.** Un relevé pris dans une fenêtre qui met le cadre à l'échelle < 1, ou sur une route qui rend 404, sort en erreur avec un message, sans écrire de référence.
- [ ] AC7 — **Jetons.** `git grep` d'un jeton frappé ne trouve rien ; la sortie complète d'un `releve` et d'un `geler` ne contient aucun jeton ; le fichier de jetons est en `-rw-------`.

## Hors périmètre

- Les pages elles-mêmes (vagues 86 à 90) et l'ajout des critères AC-F1 à AC-F5 à leurs tickets : la session les relie après les décisions du porteur.
- Les jetons, primitives et la coque (TCK-2685 → TCK-2691).
- Le diff de pixels à données identiques par interception (option (a) de D § 3) : 66 pages lisent leurs données côté serveur.
- Toute modification de la visionneuse ou des maquettes (un interrupteur « rem 100 % » dans le cadre téléphone reste une décision du porteur, D § 8).
- Une garde de CI qui exigerait la fiche de fidélité dans une PR (option ultérieure, D § 6.2).

## Notes d'implémentation

_(à remplir par implementing-specs)_
