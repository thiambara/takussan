---
id: TCK-2499
title: Liste « Deux densités » et feuille de filtres dans l'ordre de l'usage
status: done
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: [TCK-2498]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#24-recherche--filtres"
  models: []
tags: [front, search, mobile, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur compare quatre à cinq biens par écran au lieu de deux, et pose son budget et ses chambres sans chercher sous seize types de bien.

## Contrat de données

Liste publique existante ; répartition des prix de TCK-2498 pour le budget ; sponsorisés selon TCK-2500.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=liste&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Liste », « Galerie », « Filtres », téléphone et bureau.
- Densité « Liste » par défaut au téléphone (photo de 112 px), « Galerie » à un geste ; le choix est mémorisé sur l'appareil.
- Filtres actifs en puces retirables, collées sous l'en-tête ; Filtres et Carte en pastille flottante au-dessus de la barre d'onglets, jamais en deuxième barre.
- Feuille de filtres dans l'ordre de l'usage : Louer/Acheter, budget (avec histogramme), quartier, chambres, type, logement.
- « Voir N biens de plus » remplace la pagination numérotée.
- Deux éléments au plus sur une photo : favori, et « Nouveau » quand il l'est ; « Sponsorisé » en mention sobre.

## Contraintes strictes (métier)

- Le retour arrière depuis une fiche ramène au même bien dans la liste (position et biens déjà chargés).
- L'URL reste la source des filtres (partage, recherche sauvegardée) ; la densité n'entre pas dans l'URL.
- Aucun filtre existant ne disparaît : seul l'ordre change (« autour de moi », amenités, etc. restent).

## Delta à produire

- [x] Densités Liste / Galerie et leur mémorisation.
- [x] Feuille de filtres réordonnée ; budget avec histogramme.
- [x] « Voir N biens de plus » et restauration de la position au retour.
- [x] Tests : ordre de la feuille ; densité mémorisée ; retour arrière à la même place.

## Critères d'acceptation

- [x] AC1 — À 390 px en densité Liste, au moins quatre biens sont visibles dans le premier écran de résultats.
- [x] AC2 — Le budget et les chambres sont visibles à l'ouverture de la feuille de filtres, sans défiler.
- [x] AC3 — Fiche ouverte depuis le 30e bien puis retour : le 30e bien est à l'écran.

## Hors périmètre

- La carte (vue inchangée).
- Le placement des sponsorisés côté API (TCK-2500).

## Notes d'implémentation

Re-mesuré le 2026-11-09 (vague 2, agent « liste ») :

- **La liste par défaut est de 40 biens** (`PER_PAGE_PAR_DEFAUT`), pas 30 : le 30ᵉ bien d'AC3 est sur la PREMIÈRE page.
  AC3 tient donc d'abord par la restauration de position existante (`useScrollRestoration`, TCK-335/557), que la
  densité « Liste » ne change pas ; « Voir N biens de plus » y ajoute la reprise des pages suivantes.
- **`price-distribution` rend 422 sans `contract_type`** (`curl …/price-distribution` → `The contract type field is
  required.`) : sans transaction choisie, l'histogramme n'est ni demandé ni rendu, le budget reste deux champs.
- **Aucun seuil de « Nouveau » n'existait** dans le dépôt (front comme API). Retenu : publié il y a moins de 48 h
  (`NOUVEAU_PENDANT_MS`, `LigneDeResultat.tsx`).
- La barre d'onglets (TCK-2493) sert déjà d'assise au dock flottant (`globals.css`) : la pastille Filtres | Carte s'y
  pose au-dessus sans autre réglage.

Décisions non évidentes :

- **La densité ne vaut que sous `md`.** À partir de `md`, la liste est une grille de 3 à 6 colonnes, et la carte de
  bureau (`PropertyCard`) est inchangée. En densité « Liste », la cellule rend UNE carte en disposition
  `ligne-au-telephone` : le CSS la pose en ligne sous `md` (photo de 112 px, `sizes="(max-width: 767px) 112px, …"`,
  rien sur la photo, favori en bout de ligne, place payée et Badge en texte) et la laisse carte de bureau au-delà. Le
  premier tour rendait la ligne ET la carte, l'une masquée : ×2,35 nœuds à 390 px (revue adverse) — corrigé.
- **Densité en `localStorage`, instantané serveur « Liste »** (`useSyncExternalStore`) : pas d'écart d'hydratation ;
  qui a choisi « Galerie » la retrouve à l'hydratation.
- **« Voir N biens de plus » ne touche pas l'URL** (la page chargée n'est pas un filtre ; `?page=3` servirait la
  page 3 SEULE au rendu serveur). Le bouton reste un LIEN vers la page suivante, graine comprise (TCK-1008), pour un
  robot et le clic modifié (TCK-557) ; une URL qui ouvre une page > 1 garde « Revenir aux premiers biens ».
- **Retour arrière** : les pages ajoutées sont rangées en `sessionStorage` sous la clé de l'ENTRÉE d'historique de
  `useScrollRestoration` (exportée : `cleDeLEntreeCourante`), avec la requête qu'elles prolongent, 30 min au plus.
  Chaque écriture purge les suites expirées et ne garde que les 5 listes les plus récentes (`LISTES_GARDEES`) : sans
  cela, une trentaine de listes atteignaient le quota de l'onglet, et les positions de `useScrollRestoration` cessaient
  de s'écrire en silence (revue). Une entrée sans page ajoutée n'écrit rien. Une
  nouvelle entrée (lien, barre) repart de la page 1 ; un autre filtre ne reprend rien. La position n'est restaurée
  qu'après la reprise (`useScrollRestoration(!loading && suite.decidee)`) : sinon le document est écrêté.
- **Pastille Filtres | Carte permanente sous `lg`** en vue liste (elle n'apparaissait qu'une fois la rangée d'outils
  défilée) ; absente à zéro résultat (l'état vide porte ses issues, TCK-552 E1). Le bout de la rangée d'outils prend
  la bascule de densité sous `md` ; la bascule de vue y reste entre `md` et `lg`.
- **La suite continue montre un bien UNE fois** (`suiteDesPages`) : l'API ne double pas un résultat dans une page,
  mais d'une page à l'autre si (revue : 12 doublons sur 186 cellules, un bien trois fois). Le premier affichage gagne,
  quel que soit son genre (organique, réservé, sponsorisé) ; un emplacement retiré n'est pas remplacé.
- **Page au-delà de la dernière** (`?page=9` d'un lien périmé) : l'état vide offre « Revenir à la page N » et
  « Revenir aux premiers biens », filtres gardés (la pagination numérotée les donnait ; il ne restait qu'« Effacer
  tous les filtres »). Une recherche d'une seule page n'offre que le second.
- **Avant l'hydratation, un tap sur « Voir N biens de plus » suit son `href`** (`?page=2&seed_hour=…`) et ouvre la
  page 2 seule, avec « Revenir aux premiers biens ». C'est l'amélioration progressive voulue — le lien reste un lien
  pour un robot, un clic modifié et un JavaScript en retard (TCK-557) —, et non un défaut (décision de la session,
  revue du 2026-11-09).
- **Histogramme** : la phrase dit ce qui est compté — « La moitié des loyers mensuels sont sous… », « … des prix de
  vente… » —, et non « des biens » : l'histogramme d'une location sans période exclut les loyers à la semaine et au
  jour (TCK-2498), que la liste compte (172 contre 173 au relevé de la revue).
- **Puces des filtres actifs** revenues (TCK-635 les avait retirées de l'en-tête) dans un bandeau à part, collé sous
  la `nav` mesurée sous `lg`, sur une ligne qui défile de côté ; au bureau, au-dessus de la grille.
- **Ordre de la feuille** : transaction, budget (histogramme), fréquence de loyer (location), lieu, chambres, autour
  de moi, type, puis « Plus de filtres ». « Autour de moi » passe après les chambres (AC2) mais reste après la ville à
  laquelle son message de refus renvoie. Aucun filtre retiré.
- **Histogramme** : `useQuery` seulement sous `QueryClientProvider` (un panneau monté seul ne demande rien), et
  seulement panneau visible (`charger`, TCK-1088). La phrase « la moitié des biens sont sous X » prend la fin de la
  première tranche où le cumul atteint la moitié : vraie par construction (`[from, to[`), jamais une médiane estimée.
  Pas de curseur à deux poignées : les bornes restent les deux champs (commit au `blur`/`Entrée`, TCK-335).
- **Fréquence de loyer APRÈS les chambres** (re-mesuré au navigateur) : posée entre le budget et le lieu, elle
  repoussait les chambres sous le pied du tiroir à 390 × 844 (titre « Chambres » à 739 px, pied à 763 px). L'ordre
  du ticket (« Louer/Acheter, budget, quartier, chambres, type ») ne la nomme pas ; elle reste, après les chambres.
- **Bascule de densité en pastilles de 36 px** (zone de toucher 44, `ZONE_TACTILE_44`) dans un groupe de 76 px : à
  40 px, le tri n'avait que 58 px pour « Pertinence » (70 px), tronqué en « Pertinenc ».
- **Un emplacement reçoit la transaction filtrée** : la lui taire posait « En location » sur sa photo en Galerie, en
  plus du favori et de « Sponsorisé ».

Preuves des critères (navigateur, 2026-11-09, contexte isolé, `/fr/properties?contract_type=rent`, 172 biens, `next dev`) :

- **AC1** — 390 × 844, densité Liste : lignes de 133 px, 4 lignes ENTIÈREMENT visibles (248–380, 381–513, 514–646,
  647–779) au-dessus de la barre d'onglets (784) ; `scrollWidth` 390. Test : `PropertiesDiscoveryPage.densite.test.tsx`
  (Liste par défaut, Galerie mémorisée hors URL).
- **AC2** — tiroir ouvert à 390 × 844 : budget 260–466 (histogramme de 12 tranches + bornes), chambres 645–751, leurs
  boutons finissent à 730, pied « Voir 172 biens » à 763 — sans défiler. Test : `FilterSidebar.ordre-de-l-usage.test.tsx`
  (ablation : fréquence de loyer remise avant le lieu → rouge).
- **AC3** — 30ᵉ ligne (« Bureaux à Mermoz », index 29) mise à l'écran (haut à 356 px, `scrollY` 3749), fiche ouverte,
  retour : même ligne à 356 px, `scrollY` 3749. Avec « Voir 40 biens de plus » (86 lignes = 80 biens + 6 emplacements),
  61ᵉ ligne ouverte puis retour : 86 lignes reprises sans requête, la ligne à 356 px (`scrollY` 7872), « 80 sur 172
  biens ». Tests : `PropertiesDiscoveryPage.densite.test.tsx` (reprise sur la même entrée, position restaurée APRÈS la
  reprise, nouvelle entrée → page 1, autre filtre → rien).
- 1440 × 900 : grille de 4 colonnes inchangée, puces au-dessus de la grille, histogramme dans le rail, emplacements aux
  cellules 0, 11 et 22, « 40 sur 172 biens · Voir 40 biens de plus » centré, taille de page à droite ; `scrollWidth` 1440.

Reste (`PropertyCard`, disposition « carte » inchangée) : en Galerie au téléphone, la photo porte au plus deux éléments
(favori + ancienneté, ou favori + « Sponsorisé »), mais l'ancienneté y est TOUJOURS affichée (« il y a 3 mois ») là où
la direction dit « Nouveau » quand il l'est ; au bureau, ancienneté + robe + favori (trois) — carte de bureau inchangée
par contrainte (TCK-555). À trancher avec la refonte des cartes.
