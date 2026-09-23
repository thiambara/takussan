---
id: TCK-553
title: "Vue carte sur mobile : 129 étiquettes de prix empilées sans regroupement, dans une carte qui capture le défilement de la page"
status: todo
phase: P1
family: front
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, carte, recherche, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur passe en vue carte, repère les zones où se trouvent les biens, zoome,
touche un bien précis, et revient à la liste — sans lutter contre la page.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats M1 à M3), sur `?contract_type=rent&q=Dakar` à 390 × 844.

- **M1** — 129 marqueurs `.leaflet-marker-icon`, **0** regroupement : les étiquettes de prix se
  recouvrent en un bloc illisible où aucun marqueur n'est touchable isolément. TCK-047 (`done`)
  exigeait des « marqueurs clusterisés » ; TCK-162 (`done`) a différé le regroupement « à un ticket
  dédié si l'usage révèle une dégradation au-delà de ~150 marqueurs » — elle est constatée dès 129.
- **M2** — la carte (356 × 518 px, `touch-action: none`) est insérée dans une page qui défile, sous
  ~400 px de contrôles et au-dessus du pied de page : sur 61 % de l'écran, le doigt déplace la
  carte au lieu de la page. TCK-047 attendait « carte plein écran sur mobile avec bouton basculer
  vers liste ».
- **M3** — la page annonce « 140 biens trouvés » au-dessus d'une carte qui en place 129 : `/map` ne
  reçoit pas `q` (choix documenté dans `PropertiesDiscoveryPage`), et un bien sans coordonnées ne
  peut pas être placé. Le choix est légitime ; l'écran, lui, affirme deux nombres pour une recherche.

## Contrat de données

Endpoint existant `GET /api/public/properties/map` (GeoJSON plafonné, sans pagination). Aucun
changement d'API dans ce ticket : le regroupement se fait sur les points déjà reçus.

## Direction UX / Artistique

- Aux zooms larges, des **grappes** portant leur nombre de biens ; le prix n'apparaît qu'une fois
  les marqueurs assez séparés pour être lus et touchés.
- Sur mobile, la vue carte **occupe l'écran** sous la barre de navigation, sans pied de page ; un
  bouton flottant ramène à la liste.
- Le nombre affiché en vue carte est celui de la carte (« N sur la carte »), pas celui de la liste.

## Contraintes strictes (métier)

- Les filtres transmis à `/map` restent ceux d'aujourd'hui, `lat`/`lng`/`radius_km` compris
  (TCK-346) : ce ticket ne réintroduit pas l'écart liste/carte que TCK-346 a fermé.
- Le prix d'un marqueur reste formaté comme aujourd'hui (TCK-162).
- Pas d'interaction de la carte capturée hors de la vue carte.

## Delta à produire

- [x] Regroupement des marqueurs avec compte, éclaté au zoom et au tap sur une grappe.
- [x] Vue carte plein écran sous `lg`, bouton flottant de retour à la liste, sans pied de page
      visible.
- [x] Compte affiché en vue carte = nombre de biens placés.
- [x] Tests : regroupement actif au-delà d'un seuil ; compte de la vue carte ; retour à la liste.

## Critères d'acceptation

- [x] AC1 — sur `?contract_type=rent` à 390 × 844, zoom initial : le nombre d'éléments de carte
      rendus (grappes + marqueurs isolés) est inférieur au nombre de biens, et aucune paire de
      marqueurs **isolés** ne se chevauche (intersection des boîtes nulle).
- [x] AC2 — un tap sur une grappe zoome jusqu'à la séparer ; un marqueur isolé ouvre l'aperçu du
      bien comme aujourd'hui.
- [x] AC3 — en vue carte à 390 × 844, la carte occupe toute la hauteur sous la `nav`
      (à 1 px près), et `document.scrollingElement.scrollHeight <= innerHeight`.
- [x] AC4 — le compte affiché en vue carte est égal au nombre de points reçus de `/map`.
- [x] AC5 — le bouton de retour à la liste restaure la liste à la position de défilement quittée.

## Hors périmètre

- Transmettre `q` à `/map` (changement d'API, à décider séparément).
- L'agrégation côté serveur.
- La vue carte de bureau (mise en page inchangée ; le regroupement s'y applique aussi).

## Notes d'implémentation

### Re-mesure des prémisses (2026-09-23, avant tout changement)

Chrome headless, CDP, `setDeviceMetricsOverride(390 × 844, mobile)`, `innerWidth` relevé = 390
(pas d'élargissement du viewport). Front du worktree (`next dev -p 3022`) contre l'API partagée
(`:8002`, base semée sans médias). Charge machine au relevé : `load averages 36.20 77.81 72.22`
sur 8 cœurs — ces chiffres sont des **comptes et des géométries**, pas des temps : la charge ne
les déplace pas.

| Constat | Ticket | Mesuré, `?contract_type=rent&q=Dakar` | Mesuré, `?contract_type=rent` |
|---|---|---|---|
| M1 — marqueurs `.leaflet-marker-icon` | 129, 0 grappe | **129**, 0 grappe, **573 paires** de marqueurs qui se chevauchent | 129, 573 paires |
| M2 — carte | 356 × 518, `touch-action: none` | **356 × 518**, `touch-action: none`, `top` 296, `scrollHeight` **1597** pour 844, pied de page de 766 px | `top` 256 |
| M3 — deux nombres | « 140 biens trouvés » / 129 | « **140 biens trouvés** » au-dessus de 129 marqueurs | — |

Les trois constats tiennent. Deux écarts avec ce que le ticket laisse supposer :

- **La `nav` fixe fait 71 px à 390, pas 69** — ce que `NavbarSpacer` réserve (`h-[69px]`) et ce
  que `HAUTEUR_NAV_PX` (68) suppose. L'AC3 (« toute la hauteur sous la `nav`, à 1 px près ») ne
  peut donc pas s'appuyer sur une constante : la carte plein écran se cale sur le bas **mesuré**
  de la `nav`. L'écart de la cale elle-même est hors périmètre (cf. rapport).
- **`/map` rend 172 points pour `contract_type=rent` sur tout le Sénégal**, tous à des coordonnées
  distinctes (aucun doublon : `max dup = 1`). Les 129 du zoom initial sont ceux des bornes par
  défaut (Dakar, zoom 12) — la carte est pilotée par ses bornes (TCK-047), le compte « sur la
  carte » l'est donc aussi.

### Décisions

- **`supercluster` (9.1.0, nouvelle dépendance), pas `leaflet.markercluster`.** Le regroupement est
  une fonction pure (`src/components/map/regroupement.ts` : points, emprise, zoom → grappes et
  biens isolés), testable sans mise en page ; la carte pose ce qu'elle rend avec les `<Marker>`
  qu'elle posait déjà, aperçus (`Popup`) et étiquettes de prix (TCK-162) inchangés.
- **Le rayon est la garantie de l'AC1, pas un réglage** : 80 px à l'écran, au-dessus de la
  diagonale d'une étiquette (60 × 28 → 66 px). `supercluster` ne laisse isolés que des points plus
  éloignés que son rayon. ⚠ Son `extent` par défaut (512, tuiles vectorielles) divise ce rayon par
  deux sous Leaflet (tuiles de 256) : ablation `extent: 512` → 50 paires d'isolés qui se
  chevauchent entre les zooms 12 et 19 dans le test, rouge.
- **Le regroupement court jusqu'au zoom maximal (19)**, et non un cran avant : l'arrêter à 18
  posait, au zoom 19, des étiquettes qui se chevauchaient (le test de l'AC1 l'a attrapé). Contre-
  partie : des biens à moins de ~23 m (les appartements d'un immeuble, souvent aux mêmes
  coordonnées) restent une grappe qu'aucun zoom ne sépare — le tap l'ouvre alors en **liste**
  (« 3 biens à cette adresse »), au lieu d'en faire une impasse. Vérifié au navigateur en ramenant
  cinq points de `/map` aux mêmes coordonnées : grappe « 3 biens à cette adresse — voir la liste »,
  popup de 3 liens.
- **`TileLayer maxZoom={19}` et `MapContainer maxZoom={19}` sont posés.** Sans eux, Leaflet
  plafonnait la carte au `maxZoom` par défaut des tuiles (18) : une grappe dont le zoom de
  séparation vaut 19 n'aurait jamais été séparée par le tap.
- **Plein écran mobile = conteneur `fixed` calé sur le bas MESURÉ de la `nav`**
  (`--haut-de-la-carte`, repli 69 px), titre, rangée d'outils et pied de page en `max-lg:hidden`.
  Le document retombe à la hauteur de l'écran : il n'y a plus de page à faire défiler derrière la
  carte. Un `ResizeObserver` sur le conteneur appelle `invalidateSize()` (Leaflet ne voit que les
  redimensionnements de la fenêtre).
- **Le retour à la liste passe par la pastille de TCK-552**, montrée d'emblée en vue carte (la
  rangée d'outils n'y est plus rendue sous `lg` : la pastille est alors la seule sortie et le seul
  accès aux filtres). Le vieux `scrollIntoView` vers la rangée d'outils est retiré : la carte
  mobile est posée sous la `nav` quel que soit le défilement. La position de la liste est
  mémorisée à la sortie et restaurée au retour (`useLayoutEffect`, avant peinture) — sans quoi le
  navigateur, qui écrête le défilement à 0 quand le document raccourcit, ramenait en haut.
- **Le compte de la carte vit DANS la carte** (pastille haut-droite, `data-compte-carte`) : « N biens
  sur la carte », N = nombre de points reçus de `/map`, ou le message `truncated` existant quand la
  réponse est plafonnée. Il remplace l'ancienne pastille « plafonné » du coin bas-gauche, qui serait
  passée sous la pastille flottante Filtres/Liste. En vue carte, `SearchToolbar` reçoit
  `total={null}` : le compte de la liste n'est plus affiché, bureau compris.
- **Bureau (`lg+`)** : `max-lg:*` seulement sur le conteneur ; la carte garde sa hauteur de 520 px
  et son cadre (mesuré à 1440 × 900 : 518 px intérieurs + bordure, rayon 14 px, conteneur
  `static`), le regroupement s'y applique (9 grappes), la pastille n'y apparaît pas.

### Vérification au navigateur (après changement)

Même banc que la re-mesure. Scripts CDP : `ac.js`, `compare.js`, `bureau.js`, `immeuble.js`.

| AC | 390 × 844, `?contract_type=rent` | 360 × 740, `?contract_type=rent` |
|---|---|---|
| AC1 | **9 éléments** (9 grappes, 0 isolé) pour **136 points reçus** ; somme des grappes = 136 ; 0 paire d'isolés qui se chevauche | **9 éléments** (8 grappes + 1 isolé) pour **129 points** ; 128 + 1 = 129 ; 0 paire |
| AC2 | tap sur la grappe de 24 : zoom 11 → 12, plus aucune grappe de 24, 15 éléments dont 2 isolés, 0 paire d'isolés qui se chevauche ; tap sur un isolé : aperçu ouvert (lien `/fr/properties/…`), toujours ouvert 3 s après | grappe de 27 : zoom 11 → 12, 16 éléments dont 3 isolés, 0 paire ; aperçu ouvert et tenu |
| AC3 | `nav` 0–71, carte **71 → 844** (390 × 773), écart haut 0, écart bas 0, `scrollHeight` **844** = `innerHeight`, pied de page non rendu | `nav` 0–71, carte **71 → 740**, écarts 0, `scrollHeight` **740** |
| AC4 | « **136** biens sur la carte » = 136 points de la dernière réponse `/map` ; après le tap, « 63 » = 63 reçus ; aucun « … biens trouvés » à l'écran | « 129 » = 129 ; après le tap « 80 » = 80 |
| AC5 | liste quittée à `scrollY` 1500 (9ᵉ carte à −52 px) → pastille « Liste » → `scrollY` **1500** immédiatement | 1500 → **1500**, 9ᵉ carte à **−25 px avant comme après** |

`innerWidth` relevé = largeur demandée à chaque passage (pas d'élargissement du viewport).
À 390, la première lecture de l'AC5 donnait −52 / −58 px pour la même carte : c'était l'animation
d'entrée des cartes (`animate-card-enter`, une translation) prise en cours ; relevée 2,5 s après, la
position est identique au pixel près (colonne 360).

Pastille et barre du comparateur (2 biens en comparaison, 360 × 740, vue carte) : comparateur
495–665, pastille 676–724, **intersection 0** — le dock les empile. Le compte (83–111, à droite) et
le zoom de Leaflet (81–145, à gauche) ne se touchent pas.

Tests ajoutés — chacun rouge sur le code d'avant (ablation : `PropertyMap.tsx` de `HEAD` remis en
place → 6/6 rouges ; page d'avant → 5/7 rouges, les deux verts étant les témoins « rien de masqué
en liste » et « pas de pastille à partir de `lg` ») :
`src/components/map/__tests__/regroupement.test.ts` (seuil, AC1 sur 500 points et 12 zooms, AC2,
grappe inséparable), `src/components/map/__tests__/PropertyMap.regroupement.test.tsx` (Leaflet réel
sous jsdom : grappes posées, compte = points reçus, plafond, plein écran),
`src/components/property/__tests__/PropertiesDiscoveryPage.carte-mobile.test.tsx` (AC3 par ses
classes et la `nav` mesurée, AC4 côté page, AC5).
