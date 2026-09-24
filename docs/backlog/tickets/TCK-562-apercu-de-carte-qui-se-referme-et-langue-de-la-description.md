---
id: TCK-562
title: "Carte : l'aperçu d'un bien ou d'une grappe se refermait au rechargement qui suit l'autoPan ; fiche bien : la description, texte de l'annonceur, n'annonçait pas sa langue"
status: done
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, carte, leaflet, fiche-bien, i18n, a11y, react-compiler, retour-testeur]
---

## Objectif utilisateur

Sur la carte de recherche, un visiteur touche un prix ou une grappe : l'aperçu s'ouvre et **reste
ouvert** jusqu'à ce qu'il le ferme, même quand la carte se recale et recharge ses biens.

Sur la fiche d'un bien lue en anglais ou en wolof, le visiteur comprend que la description est le
texte de l'annonceur, rédigé en français, et non une traduction manquée ; son lecteur d'écran la
prononce en français.

## Contexte

Retour testeur du 2026-09-23 (preview.takussan.com, compte propriétaire « Fa Diop »), deux points
pour ce ticket.

### W2 — « Quand tu cliques sur un point ça ouvre un petit popup de détails mais il se referme automatiquement » — **partiel** : non reproduit sur le build de preview, reproduit sur `dev`

**Sur le build servi par preview, le défaut n'est pas reproduit.** Le front de preview est derrière
une authentification Basic (401, `www-authenticate: Basic realm="traefik"`) : il a été rejoué hors
ligne, `PropertyMap.tsx` d'`origin/preview` (`fc4faee1`, le `X-Build-Sha` de
`preview.api.takussan.com`) monté par Vite avec le CSS Tailwind réel du dépôt, contre **les données
réelles de `preview.api.takussan.com/api/public/properties/map`**, piloté par Chrome headless (CDP,
clics souris `Input.dispatchMouseEvent`, état de `.leaflet-popup` relevé à chaque image pendant 5 s).
Treize scénarios — vue ajustée, dézoomée de 2 et 3 crans (218 biens, l'amas de la capture),
marqueurs du bord haut, du milieu de l'amas — : **l'aperçu reste ouvert dans les treize**, une seule
requête `/map` après l'autoPan.

Ce symptôme avait déjà été signalé et corrigé : le lot « retours d'administration » du 2026-09-16
(`cfe92ba8`) porte le même popup (« ouvert à 250 ms, fermé à 500 ms » : `data` repassait à
`undefined` pendant la requête, les marqueurs se démontaient) avec **les mêmes voisins que ce
retour** — `/agents/owner.agency4`, boutons retour manquants, clic sans retour visuel. Il a atteint
preview le 2026-09-16 à 12:27 (`c62dc702` contient `cfe92ba8` ; `e40a0d9d`, le déploiement
d'avant, non). La date des captures n'est pas lisible dans le document (aucune métadonnée) : il
est probable, **non établi**, que ce point a été observé avant ce déploiement.

**Sur `dev`, le symptôme revient par deux chemins neufs, ouverts par le regroupement de TCK-553**
(pas encore promu sur preview : la capture montre des étiquettes empilées, sans grappes). Tous deux
passent par le même enchaînement — ouvrir un aperçu déplace la vue (`autoPan`) → nouvelles bornes →
nouvelle réponse de `/map` → nouvel index → le marqueur qui porte l'aperçu est démonté, et Leaflet
ferme l'aperçu d'un marqueur retiré :

1. **une grappe ouverte en liste change de clé React** : `supercluster` numérote ses grappes à partir
   du nombre de points indexés, un bien de plus dans la réponse suffit à changer `grappe-<id>` ;
2. **un bien isolé est absorbé par une grappe** quand la réponse suivante apporte un voisin qui
   était juste hors de la vue — le cas même d'un bien au bord, dont l'aperçu fait bouger la carte.

Mesuré au navigateur sur le même montage, jeu de données contrôlé (le voisin n'arrive qu'avec la
réponse qui suit le clic) ; non compilé à 1400 × 900 et 390 × 844, **compilé par le React Compiler
comme en production** à 1400 × 900 — même verdict partout (chiffres du relevé non compilé à 1400) :

| scénario | `HEAD` | corrigé |
|---|---|---|
| liste d'une grappe inséparable, un bien de plus | ouvert à 23 ms, **fermé à 639 ms** | ouvert à 5 s |
| bien isolé absorbé par un voisin | ouvert à 26 ms, **fermé à 642 ms** | ouvert à 5 s |

**Défaut trouvé en chemin, dans le premier état du correctif (jamais commité)** : l'épingle posée
à l'ouverture provoquait un rendu PENDANT l'animation d'autoPan ; le marqueur recevait à chaque
rendu une position neuve (`[lat, lng]` littéral), donc un `setLatLng()` qui relance
`_adjustPan` et arrête l'animation — `moveend` → nouvelles bornes → rendu → … Mesuré, code non
compilé : **14 413 `panBy` et 187 requêtes `/map` en 5 s** pour un aperçu ouvert. Compilé, le React
Compiler mémoïse ces valeurs et la tempête n'a pas lieu (1 requête) : elle n'aurait pas atteint le
build, mais la suite de tests, qui ne compile pas, ne voyait que ce code-là.

### M9 — « Je suis en anglais et pourtant cette description est en français » — **confirmé** (décision du porteur : signaler, ne pas traduire)

- `Property` ne connaît pas la langue de sa description et ne porte aucune traduction : ni colonne,
  ni relation (`app/Models/Property.php`, migrations de `properties`, `docs/models-spec.md`) ; la
  traduction automatique des contenus utilisateurs est au backlog en P3 (`docs/features.md` § 2.8).
- La langue de saisie est donc **supposée** : le français. Relevé sur `preview.api.takussan.com`,
  un bien sur trois des 243 publics (81 fiches, `GET /api/public/properties/{slug}`) : **81
  descriptions sur 81 en français**.
- Sur la fiche `/en/…`, la description héritait du `lang="en"` de `<html>` (`app/layout.tsx`) : un
  lecteur d'écran la prononçait avec une voix anglaise, et rien ne disait au visiteur qu'il lisait
  un texte d'annonceur non traduit.

## Contrat de données

Aucun changement d'API. La langue supposée vit en un seul point du front,
`properties/[slug]/components/langue-de-saisie.ts` : c'est là que se branchera une langue connue
de l'API.

## Ce qui a été fait

- **Épingle de l'aperçu ouvert** (`PropertyMap.tsx`, `CoucheDesBiens`) : à `popupopen`, le bien ou
  la liste qui porte l'aperçu est retiré de l'index et posé tel qu'il était, **sous la même clé
  React** ; à `popupclose`, il retourne au regroupement. Les comptes restent justes, aucun bien
  n'est posé deux fois. La clé d'une liste dérive de ses biens (`liste-<plus petit id>`), plus de
  l'identifiant de `supercluster` : stable d'un index à l'autre, et unique puisque les grappes d'un
  index sont disjointes et que la liste épinglée est retirée de l'index. Une fermeture ne lève que
  sa propre épingle (`autoClose` ferme le précédent) : garde **défensive** — Leaflet 1.9.4 ferme l'ancien aperçu avant d'ouvrir le nouveau
  (`Popup.openOn`, `leaflet-src.js` l. 10217-10242), donc avec cet ordre elle ne décide de rien ;
  elle empêche l'épingle de dépendre de l'ordre des événements d'une bibliothèque tierce.
- **Identités stables pour Leaflet** : position, icône et contenu d'aperçu mémoïsés dans
  `MarqueurDeBien`, `MarqueurDeGrappe`, `MarqueurDeListe`. La mémoïsation porte une sémantique
  (react-leaflet compare par identité et pilote Leaflet), ce que `takussan-web/CLAUDE.md` réserve
  aux `useMemo` légitimes ; `react-hooks/preserve-manual-memoization` passe, le composant compile.
- **Description** (`PropertyDescription.tsx`) : `lang="fr"` sur le seul bloc de texte (ni le titre,
  ni la mention, ni « Lire la suite ») ; une mention discrète — icône `Languages`, `text-sm
  text-muted-foreground` — dans la langue de l'interface, affichée seulement quand elle diffère de
  la langue du texte : « Description written in French by the lister », « Boroom yégle bi moo bind
  leeral bii ci farañse ». Clé `property.detail.descriptionLanguageNotice` (ICU `select` sur la
  langue, trois locales).

## Critères d'acceptation

- [x] AC1 — l'aperçu d'une grappe ouverte en liste reste ouvert quand la réponse suivante compte un
      bien de plus. *(Test ; navigateur : fermé à 639 ms avant, ouvert à 5 s après — non compilé à
      1400 et 390 px, compilé à 1400.)*
- [x] AC2 — l'aperçu d'un bien reste ouvert quand la réponse suivante lui apporte un voisin qui le
      regrouperait. *(Test ; navigateur : fermé à 642 ms avant, ouvert à 5 s après.)*
- [x] AC3 — l'aperçu reste ouvert même si la réponse suivante ne contient plus le bien.
- [x] AC4 — fermé, l'aperçu rend le bien au regroupement : une grappe de 2, aucun bien en double.
- [x] AC4 bis — une LISTE épinglée est retirée de l'index, pas seulement ajoutée par-dessus : après
      la réponse suivante, une seule icône de liste et chaque bien au loin une seule fois.
      *(Ajouté à la réparation 1 : sans cette assertion, retirer l'exclusion de la liste la posait
      deux fois sous la clé `liste-1` et AC1 restait vert — relevé par la vérification adverse.)*
- [x] AC4 ter — fermée, une LISTE retourne au regroupement : un cinquième appartement du même
      immeuble arrivé pendant qu'elle était ouverte la rejoint (« 5 biens », plus d'étiquette de
      prix à côté), et un filtre qui exclut l'immeuble la retire. *(Ajouté à la réparation 2 :
      sans lui, retirer `popupclose` du marqueur de liste laissait les 7 tests verts — relevé par
      la vérification adverse, reproduit avant correction.)*
- [x] AC4 quater — une fermeture ne lève que sa propre épingle : livrée EN RETARD (après
      l'ouverture d'un autre aperçu, par `Evented.fire`), la fermeture d'une liste ne lève pas
      l'épingle d'un bien, ni celle d'un bien l'épingle d'une liste. *(Ajouté à la réparation 2 ;
      l'ordre inverse n'est pas celui de Leaflet 1.9.4 : le test garde le contrat, pas un chemin
      observé.)*
- [x] AC4 quinquies — deux immeubles de même taille dans la vue : deux listes distinctes, chaque
      icône ouvre SA liste, et l'aperçu de l'une survit au rechargement pendant que l'autre reste
      posée à sa place. *(Ajouté à l'étape finish : une clé qui ne dirait que la taille,
      `liste-${biens.length}`, laissait les 27 tests de carte verts alors que les deux listes
      partageaient la clé `liste-4` et que la liste du premier immeuble devenait inatteignable —
      relevé par la vérification adverse, reproduit avant correction.)*
- [x] AC5 — un rendu qui ne change rien au bien ouvert ne relance pas le recadrage de son aperçu
      (`_adjustPan` jamais appelé). *(Navigateur, jeu contrôlé : 1 requête `/map` et 2 `panBy`
      après le clic, contre 187 et 14 413 sans la mémoïsation.)*
- [x] AC5 bis — un rendu qui ne change rien au bien ouvert garde le BOUTON de son étiquette de prix,
      et le focus qu'il porte (`setIcon` jamais appelé). *(`DivIcon.createIcon` garde le `div` de
      l'icône mais réécrit son `innerHTML` : sans la mémoïsation de l'icône, le bouton focalisé est
      détruit et le focus retombe sur `body` — constaté par ablation, même sans l'espion.)*
- [x] AC5 ter — un rendu qui ne change rien à la liste ouverte ne la redessine pas
      (`popup.update()`, que react-leaflet rappelle quand `children` change), ne la recadre pas
      (`_adjustPan`) et ne remplace pas son icône (`setIcon`).
- [x] AC6 — sur données réelles de preview, le correctif ne change rien à ce qui marchait : trois
      aperçus de bien ouverts à 5 s et une grappe qui zoome, une seule requête `/map` chacun.
- [x] AC7 — fiche en anglais ou en wolof : le texte porte `lang="fr"`, la mention est dans la langue
      de l'interface, sur une ligne à 360 px, sans débordement horizontal. *(Re-mesuré en DM Sans
      14 px, la fonte réelle, par la vérification adverse : en 268,1 px, wo 294,3 px pour 306 px
      disponibles.)*
- [x] AC8 — fiche en français : aucune mention, rien de caché.
- [x] AC9 — la mention, le titre et « Lire la suite » ne portent pas `lang="fr"`.
- [ ] AC10 — relevé sur preview après promotion : aperçu de grappe et de bien ouverts à 5 s ; fiche
      `/en/…` avec mention et `lang="fr"`. *(Non vérifiable avant déploiement ; le front de preview
      demande une authentification que ce travail n'a pas.)*

Ablations (fichier corrigé copié, correctif retiré, rouge constaté, restauré et vérifié par `md5`) —
matrice rejouée à la réparation 1 sur les 7 tests de carte : `HEAD` → 7 rouges sur 7 ; liste non
exclue de l'index → AC1 et AC5 ter rouges ; icône de prix non mémoïsée → AC5 bis et AC5 ter ; contenu
de liste non mémoïsé → AC5 ter ; icône de liste non mémoïsée → AC5 ter ; position littérale → AC5 et
AC5 ter ; contenu d'aperçu de bien non mémoïsé → AC5. Aucun mutant de mémoïsation ne survit.
Réparation 2, sur les 10 tests de carte, non compilé ET compilé : `popupclose` retiré du marqueur de
liste → AC4 ter seul rouge (la liste reste « 4 biens ») ; fermeture de bien sans garde → « liste
ouverte après un bien » seul rouge ; fermeture de liste sans garde → « bien ouvert après la liste »
seul rouge ; `HEAD` → 10 rouges sur 10.
Étape finish, sur les 11 tests de carte, non compilé ET compilé : clé de liste réduite à la taille
(`liste-${biens.length}`) → AC4 quinquies seul rouge (`expected [ 'B', 'B' ] to deeply equal
[ 'A', 'B' ]` : les deux icônes ouvrent la liste du second immeuble ; React : « two children with
the same key, `liste-4` »). Restauré par `cp`, md5 `d62001b74d81d65e574752fbd80af126`.
Côté description : description d'`HEAD` → 5 sur 6 rouges ; sans
`lang` → 4 rouges ; mention toujours affichée → 1 rouge (AC8). Sous le React Compiler (configuration
hors dépôt appliquant `babel-plugin-react-compiler` aux deux composants, compilation vérifiée) : les
13 tests passent, et `HEAD` y reste rouge 7 sur 7 (carte).

## Hors périmètre

- La traduction des descriptions (décision du porteur ; P3 de `docs/features.md` § 2.8).
- Connaître la langue réelle d'une annonce (colonne ou détection à l'écriture, depuis la locale de
  l'auteur) : ticket à part — la mention dirait « français » d'une description rédigée en anglais.
- Le titre du bien, lui aussi texte de l'annonceur, ne porte pas encore `lang`.
- La cause du symptôme sur le build de preview (`fc4faee1`, sans grappes) reste **non établie** :
  ce ticket ferme les deux chemins que le regroupement ouvre sur `dev`, pas une cause inexpliquée
  de preview. Rejoué sur données réelles de preview, dézoomé de 2 et 3 crans (209 et 218
  marqueurs) : aperçu ouvert à 5 s dans tous les essais, par l'implémentation comme par la
  vérification. Le document du testeur n'a pas de date lisible (ni `core.xml`, ni `tIME` dans
  les images) : seule l'AC10 pourra trancher.
- Le compte « N biens sur la carte » compte la réponse : un bien épinglé absent de la réponse
  suivante est affiché sans être compté, le temps que son aperçu reste ouvert.
- **Tant que son aperçu est ouvert, un bien épinglé n'est pas compté dans la grappe voisine** —
  voulu : il est retiré de l'index (`PropertyMap.tsx`, `CoucheDesBiens`, l'`index` filtré par
  `idsEpingles`) et posé à part (l'`epingle` ajoutée aux marqueurs). La grappe affiche un bien de
  moins et le bien est visible à côté d'elle : le total posé est juste, rien n'est compté deux
  fois ; à la fermeture, il rejoint la grappe.

## Restes de la vérification — soldés le 2026-09-24

- **« La carte locale ne charge rien (CORS) »** — note d'environnement, *ne se reproduit plus* :
  la pile locale sert désormais le front sur `localhost:3000`, l'origine que l'API
  `127.0.0.1:8002` autorise (`Access-Control-Allow-Origin: http://localhost:3000`, relevé par
  `curl`). Re-mesuré au navigateur (Chrome headless, CDP, SANS `--disable-web-security`), 1366 ×
  900, `/fr/properties` en vue carte : deux réponses `/map` en 200, 9 grappes ; après deux zooms
  par grappe, 4 étiquettes de prix ; clic souris sur l'une : **aperçu ouvert à 300 ms, 1 s, 2,5 s
  et 5 s, une seule requête `/map` après le clic.**
- **Grappe voisine qui ne compte pas le bien épinglé** — documenté ci-dessus (Hors périmètre) :
  comportement voulu, démontré par le code.
- **« Une clé tirée de `biens[0].id` passerait aussi »** — *sans objet, démontré* : la clé ne doit
  être stable qu'entre le rendu de l'index au moment du clic et le rendu épinglé, et les deux la
  calculent sur le MÊME tableau (`marqueurDeListe(biens)` puis `epinglerLaListe(biens, …)` →
  `marqueurDeListe(epingle.biens)`). Tant que l'épingle tient, les réponses suivantes ne la
  recalculent pas ; à la fermeture, un remontage est sans effet (l'aperçu est déjà fermé). Toute
  fonction déterministe du tableau convient ; le plus petit identifiant a en plus l'avantage de ne
  pas dépendre de l'ordre de `getLeaves`, et AC4 quinquies garde qu'il distingue deux immeubles.
- **Langue supposée `fr` (M9)** et **AC10 (preview)** — inchangés : le premier demande un ticket
  d'API (Hors périmètre), le second une promotion et l'accès authentifié à preview.

