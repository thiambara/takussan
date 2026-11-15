# Fidélité au pixel : des maquettes de la partie connectée au produit

**Demande du porteur (2026-11-10)** : « je veux que quand on implémente, on ait la même chose au
pixel près […] je ne veux pas qu'après implémentation on ait l'impression que ce n'est pas la même
chose, car les contours, les tailles, l'espacement… ne sont pas les mêmes. » Avant tout code, un
état des lieux **mesuré** de ce qui produirait un écart, puis les tickets de préparation.

**Relevé du 2026-11-10**, sur `dev` (`8478950a2`), par quatre explorations parallèles, au
navigateur (styles calculés par CDP) et dans le code :

- les 33 pages retenues (204 écrans), au téléphone et au bureau ;
- 23 pages réelles de `/app` aux deux formats, pour les personas admin, agent, bailleur et
  locataire.

Le détail, avec fichier et ligne pour chaque valeur, est dans les annexes de
[`fidelite/`](fidelite/) :

| Annexe | Sujet |
|---|---|
| [A — jetons](fidelite/A-jetons.md) | Jetons, typographie, formats et icônes |
| [B — composants](fidelite/B-composants.md) | Les 24 primitives, face à face |
| [C — coque](fidelite/C-coque.md) | La coque, la mise en page et les largeurs |
| [D — méthode](fidelite/D-methode.md) | Comment prouver la fidélité, avec un prototype éprouvé |

## En une phrase

**Aujourd'hui, une implémentation « fidèle » ne le serait pas** : aucune des primitives que
dessinent les maquettes n'existe telle quelle dans le produit, les maquettes parlent une autre
échelle de tailles que le design system, la visionneuse a déformé ce que le porteur a vu au
téléphone, et rien ne mesure l'écart à la revue. Tout cela se prépare en **8 tickets**
(TCK-2684 → TCK-2691) et **une ADR**, avant la première page.

## Les sept causes d'écart, par ordre de visibilité

### 1. La visionneuse n'a jamais montré une maquette à sa taille réelle

- **Le téléphone, vu sur un écran d'ordinateur, est déformé.**
  - La cause : le produit réduit tout ce qui est en `rem` à 90 % dès 1024 px de fenêtre
    (`globals.css:805-808`, TCK-635), et le cadre téléphone de la visionneuse vit dans cette
    fenêtre.
  - Ce qui est en `rem` y est 10 % plus petit qu'au vrai téléphone : marges, hauteurs, `text-sm`.
    Ce qui est en px garde sa taille : `text-[13px]`, bordures.
  - Ce n'est donc pas une simple réduction, ce sont d'**autres proportions**. 39 % des tailles
    de texte diffèrent, et quatre couples s'inversent. Par exemple, `text-sm` rend 12,6 px dans
    le cadre, sous un `text-[13px]` ; il rend 14 px sur un vrai téléphone, au-dessus.
  - Mesures : en-tête 50,4 px au lieu de 56, barre d'onglets 57,6 au lieu de 64, bouton
    39,6 px au lieu de 44.
- **Le bureau est réduit à 73 %** dans une fenêtre de 1440. Ses proportions sont justes : le
  produit est aussi à 90 % au bureau.
- **Réduire le produit à 90 % au téléphone n'est pas possible.** Sous 16 px de texte de champ,
  Safari sur iPhone zoome à chaque toucher.

**La seule référence qui puisse être égale au produit est la taille réelle** : 390 × 844 à
rem 16 au téléphone, 1440 × 900 à rem 14,4 au bureau. Sur un vrai téléphone, ce qui est en `rem`
paraîtra environ 11 % plus grand que ce que le porteur a validé à l'écran. → Décision 1.

### 2. Deux échelles de texte

- **Au vrai téléphone**, 59 % du texte des maquettes est en tailles fixes que le design system
  n'a pas : `text-[13px]` (1 125 occurrences), `text-[15px]` (621), `text-[11px]` et
  `text-[17px]`.
- **Le produit écrit plus petit** : 53 % de son texte à 12 px au téléphone, 54 % à 10,8 px au
  bureau.
- Une implémentation fidèle **grossira nettement le texte de `/app`** ; c'est voulu par la
  maquette. Pour le faire sans valeur arbitraire, il faut des jetons de taille **en px** : en
  `rem`, la réduction du bureau les changerait.

### 3. Deux échelles de hauteurs

| Contrôle | Maquette, téléphone | Maquette, bureau | Produit, partout |
|---|---|---|---|
| Bouton et champ | 44 px | 36 px | 40 px |
| Action principale | 48 px | — | 44 px |
| Petit bouton | — | 32 px | — |

Le produit est à 40 px partout, par décision (TCK-2460, gardée par `check-champs-uniformes`).
L'écart est de ±4 px sur chaque bouton et chaque champ de 61 tickets. Le mécanisme pour le fermer
existe déjà, sans toucher au site public : la portée de densité de `field-density.ts`, à étendre
au bouton et à poser sur la coque de `/app`.

### 4. Aucune primitive n'a d'équivalent exact

Les 82 fichiers de maquettes n'importent aucun composant du produit : tout y est dessiné à la
main. Sur 24 primitives, **une seule** est déjà identique, le squelette de chargement.

| Ce qu'il faut faire | Primitives | Tickets qui en dépendent |
|---|---|---|
| **Créer** (7) | puce de filtre | 53 |
| | barre d'action collante | 38 |
| | feuille du bas | 33 |
| | contrôle segmenté | 30 |
| | case à cocher | 26 |
| | jauge | 26 |
| | interrupteur | 16 |
| | ligne de liste mobile | — |
| **Étendre** (17) | `Button`, `Input`/`Select`/`Textarea`, `StatusBadge`, `Card`, `Avatar`, `Tabs`, `Sheet` droite, `DataTable`, `PageHeader`, `EmptyState`, `StatCard`, `WarningBanner`, `Toast`, entre autres | — |

Les valeurs exactes de chacune sont dans l'annexe B, § 6.

### 5. Les maquettes ne sont pas cohérentes entre elles

Chaque page a redessiné ses pièces localement. Dans les seules approches retenues :

| Pièce | Variantes distinctes |
|---|---|
| Interrupteur | 4 gabarits |
| Case à cocher | 7 |
| Contrôle segmenté | 5 |
| Champ de recherche | 4 |
| Jauge | 4 |
| Avatar | 12 tailles |
| Trait d'icône | 1,5, 1,75 et 2 |
| Heure | « 09:00 » et « 9 h 00 » |

**« Au pixel près » ne peut donc pas valoir écran par écran** : une primitive n'a qu'un dessin.
Recommandation : la valeur majoritaire, relevée et chiffrée dans l'annexe B, § 2.4 et § 6.

### 6. Les maquettes contredisent des règles déjà payées

- **Contours de champ** : la maquette utilise le filet `--border`, à 1,26:1. TCK-753 a passé
  `--input` à 3,59:1 parce que le contour d'un champ doit atteindre 3:1 (WCAG 1.4.11).
- **Focus** : la maquette dessine un halo pâle, le produit un anneau plein.
- **Pastilles de statut** :
  - les fonds sont à 15-20 %, contre 10 % dans la charte (TCK-450) ;
  - le ton « info » utilise `--accent`, à **3,88:1**, sous le seuil de 4,5:1 ;
  - certaines pastilles font 24 px de haut.
- **Contrôles non textuels** : cases vides et interrupteurs éteints sont sous 3:1.
- **Texte des champs au téléphone** : 15 px dans 20 pages. Le zoom de Safari impose 16 px.
- **Charte** :
  - titre de page en graisse 600 (charte : 700), et 20 px au téléphone (produit : 24) ;
  - bouton sombre comme second bouton plein, sur 16 pages ;
  - `shadow-2xl` et ombres littérales ;
  - texte de la colonne à 12,6 px, contre 14 px fixés par TCK-2490.

Les quatre premiers points sont de l'**accessibilité mesurée** ou une **contrainte technique** :
là, le produit doit garder raison. Le dernier relève du **goût** : la maquette peut gagner, si le
porteur le veut. → Décision 2.

### 7. La maquette n'existe qu'à deux largeurs, et le produit en a cinq

Les maquettes « bureau » sont dessinées pour 1440 et ne contiennent qu'une seule classe
responsive.

**Largeur utile du produit**

| Fenêtre | Largeur utile |
|---|---|
| 1440 | 1125 px |
| 1280 | 965 px |
| 1024 | 709 px (la plus défavorable) |
| 768 | 660 px |

**La maquette elle-même, rétrécie à ces largeurs**

| Fenêtre | Écrans dégradés | Pages touchées | Débord horizontal |
|---|---|---|---|
| 1280 | 55 sur 170 | 18 sur 29 | jusqu'à 104 px |
| 1024 | 102 sur 170 | 26 sur 29 | jusqu'à 360 px |

- Sont touchés : les listes avec panneau de fiche, les fiches à colonne fixe, les tables de 6 à
  8 colonnes, l'agenda et le kanban.
- Côté tickets, 50 disent « Bureau (≥ 1280 px) », un seul nomme 1024, aucun ne nomme 768.

**1280 est une largeur d'ordinateur portable courante** : sans règle écrite, l'implémenteur
inventera ces écrans. → Décision 3.

## Ce qui est déjà juste (on ne touche pas)

- **Mêmes jetons de couleur, mêmes polices** (Bricolage, DM Sans) et mêmes arrondis des deux
  côtés. Aucune palette brute hors charte dans les maquettes.
- **Au bureau, maquette et produit sont tous deux à rem 14,4** : ils se comparent terme à terme.
- **Défilement** : même modèle des deux côtés. En-tête et onglets fixes, contenu qui défile.
- **Aucun élément flottant** sous la barre d'onglets.
- **Pas de mode sombre** à prévoir.

## La méthode de preuve : comparer des mesures, pas des images

- **Une comparaison d'images brute ne marche pas.** La maquette a des données fictives, la page
  celles de la base. On ne peut pas non plus leur donner les mêmes : 66 pages de `/app` lisent
  leurs données côté serveur, hors de portée du navigateur.
- **La garde retenue est structurelle.**
  - On relève les styles calculés de chaque élément des deux côtés : bordure, rayon, marges,
    couleurs, police, hauteur, icône.
  - On apparie les éléments par leur libellé, leur icône ou un rôle déclaré, et l'outil liste
    les écarts.
  - Les pixels ne servent que sur les zones au contenu identique (coque, tête de page), et un
    **rideau** glissant sert l'œil du porteur.
- **Le prototype est éprouvé** sur Notifications, au téléphone et au bureau :
  - deux relevés successifs identiques à l'octet ;
  - **6 écarts injectés sur 6 attrapés**, sans faux écart ;
  - environ 5 s par relevé, moins d'1 s par comparaison.
- **Les maquettes ne sont pas dans git**, donc la CI et les worktrees ne les ont pas. Il faut
  **geler** les mesures de chaque écran retenu en JSON versionné, soit environ 1 à 2 Mo dans
  git ; les images restent locales.
- **La CI ne peut pas jouer la comparaison** : elle n'a ni l'application servie ni la base de
  démo. L'implémenteur la lance sous `./dev.sh` avant la PR et joint le tableau et le rideau ;
  le porteur valide sur le rideau.
- **Tolérances** :

  | Propriété | Tolérance |
  |---|---|
  | Police, graisse, rayon, bordure, icône | exacte |
  | Couleurs | ±3/255 par canal |
  | Dimensions et marges | ±1 px |
  | Position d'un élément | ±2 px |
  | Pixels d'une zone à contenu identique | ≤ 0,5 %, à étalonner sur les trois premiers tickets |

- **Cinq critères d'acceptation types**, AC-F1 à AC-F5 (annexe D, § 7), s'ajouteront à chaque
  ticket front des vagues 86 à 90.

## Les tickets de préparation (vague 91, avant les vagues 86 à 90)

| Ticket | Contenu | Taille |
|---|---|---|
| TCK-2684 | L'outil de fidélité versionné (relevé, comparaison, gel) et le gel des références | M |
| TCK-2685 | Les jetons : échelle de texte en px, icône (taille et trait), ombres nommées, formats (« F », « 4 nov. »), vitrine des primitives, garde qui interdit les valeurs arbitraires dans `/app` | M |
| TCK-2686 | L'échelle de densité de `/app` : hauteurs des contrôles, `Button` et champs | M |
| TCK-2687 | Primitives existantes, lot 1 : pastille, carte, avatar, onglets, en-tête de page, chiffre clé, état vide | M |
| TCK-2688 | Primitives existantes, lot 2 : panneau latéral, tableau, bannière, choix, recherche, toast | M |
| TCK-2689 | Primitives neuves, lot 1 : puce de filtre, contrôle segmenté, barre d'action collante, ligne de liste | M |
| TCK-2690 | Primitives neuves, lot 2 : feuille du bas, case à cocher, interrupteur, jauge | M |
| TCK-2691 | La coque au pixel : enveloppe du téléphone bord à bord, marges, en-tête de page, barre d'onglets, icônes, compte | M |

Après les décisions du porteur, la session :

- écrit l'ADR de la fidélité au pixel (référence de mesure, principe d'arbitrage, règle entre 768
  et 1279, amendement de TCK-2460) ;
- relie chaque ticket front des vagues 86 à 90 à ces préparations (`depends_on`) ;
- leur ajoute AC-F1 à AC-F5.

## Décisions du porteur (2026-11-10)

« 1a 2a 3b (mais avec Opus au lieu de Fable) 4a » :

1. **(a) Référence : la taille réelle.**
   - Téléphone : 390 × 844 à rem 16 ; bureau : 1440 × 900 à rem 14,4.
   - La visionneuse est modifiée pour les rendre ainsi, chaque écran dans un cadre qui a sa propre
     largeur.
   - Le porteur revoit les écrans téléphone à taille réelle avant le gel des références.
2. **(a) La maquette fait foi, avec trois exceptions** :
   - l'accessibilité mesurée : contour de champ ≥ 3:1, anneau de focus plein, texte de pastille
     ≥ 4,5:1, contrôles éteints ≥ 3:1 ;
   - les contraintes techniques : texte de champ ≥ 16 px au téléphone ;
   - les incohérences entre maquettes, où l'on prend la valeur majoritaire.

   Elle emporte donc :
   - les hauteurs 44/48 px au téléphone, 36/32 au bureau (amende TCK-2460) ;
   - le titre de page en graisse 600 ;
   - le texte de la colonne à 12,6 px au bureau (amende TCK-2490) ;
   - le bouton sombre ;
   - le toast sombre en bas ;
   - « F » dans `/app`, et « F CFA » sur l'offre et l'abonnement (décision 14) ;
   - les dates sans l'année de l'année en cours ;
   - le trait d'icône de la maquette.
3. **(b) Une règle écrite pour 768 à 1279 px, et des maquettes à 1280** pour les pages qui s'y
   dégradent. Ces maquettes sont faites **par Opus 5.5**, sur demande expresse du porteur ; il les
   valide comme les autres.
4. **(a) Les mesures gelées des écrans retenus sont versionnées** (JSON) ; les images restent
   locales.

Ces décisions sont écrites dans [ADR-0106](../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md).

### Décisions complémentaires (2026-11-10, le soir) — les bonnes pratiques

Relue contre les bonnes pratiques du web, la démarche gardait quatre écarts. Le porteur a tranché :

- **(a) La densité suit aussi le pointeur.** Au doigt (`pointer: coarse`), les contrôles de `/app`
  rendent 44/48 px quelle que soit la largeur — un iPad à l'horizontale fait 1024 px (TCK-2686, AC8).
- **(b) La colonne se replie en rail de 60 px entre 768 et 1023 px.** Le produit le fait déjà
  (TCK-2480) ; ce sont les maquettes qui gardaient 272 px. TCK-2691 le confirme.
- **(c) remplacé par la « voie 2 »** : la racine reste à 16 px partout et la densité du bureau
  devient des jetons à ×0,9 dès `lg` ; les tailles fixes de la maquette deviennent des `rem`
  calculés. Au réglage par défaut, le rendu est identique au pixel ; le réglage de police de
  l'utilisateur est respecté ; les requêtes de conteneur redeviennent possibles.
  [ADR-0107](../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md), TCK-2692 (avant
  TCK-2685). La référence du bureau devient **1440 × 900, rem 16, densité ×0,9** : là où ce
  document écrit « rem 14,4 », lire cette référence.

### Validation des maquettes « bureau 1280 » (2026-11-11)

- **Faites** le 2026-11-10 au soir, sur Opus 5.5 (quatre agents, puis les pages sans groupe) :
  25 pages changent à 1280 ; 8 pages ne changent que sous 1280 (règle d'ADR-0106 § 4).
- **Contrôle indépendant de la session** sur les 204 écrans bureau des 33 pages retenues, en
  écran seul (`cadre=1`), à 1440, 1280, 1024 et 768 : aucun débord du défileur, aucun élément hors
  de la fenêtre, aucun texte coupé net par un ancêtre `overflow-hidden` ; les textes qui cèdent le
  font en ellipse, et aucun nom, montant, statut ni date ne cède à 1280.
- **1440 inchangé**, prouvé par comparaison de pixels avant/après pour chaque écran touché — sauf
  deux défauts **des maquettes validées elles-mêmes**, corrigés à la demande du porteur : les
  budgets coupés de la colonne « Cherche » (Clients, e0/e3/e4) et « Annuler la visite » coupé de
  45 px (Visites, e7).
- **La coque des maquettes** reprend le rail d'icônes de 60 px du produit entre 768 et 1023 px
  (TCK-2480), et deux corrections communes : les actions de `TeteDePage` passent à la ligne sous
  `xl`, le panneau latéral de 480 px passe en pleine largeur sous `xl`.
- **Validé par le porteur le 2026-11-11** : « je valide tout » — les maquettes à 1280, les
  corrections à 1440, et les écrans retenus tels quels. L'étape 2 de l'ordre d'ADR-0106 § 6 est
  donc franchie ; le gel des références (TCK-2684) peut se faire.
