Annexe de [la synthèse](../fidelite-au-pixel.md) — relevé du 2026-11-10 ; les chemins `/private/tmp/…` désignent les relevés bruts de la session, non versionnés.

# D — Prouver la fidélité au pixel, ticket par ticket (méthode, 2026-11-10)

Dossier de travail : `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/`
(prototype `fidelite.mjs`, 538 lignes ; rôles communs `roles-coque.json` ; essais sous `notif/`).
Rien n'a été modifié dans le dépôt, dans les maquettes ni dans git.

## 0. En cinq lignes

1. **Recommandation : comparaison STRUCTURELLE comme garde, pixels seulement sur les zones à contenu identique, rideau pour l'œil du porteur** (option d). Le diff de pixels brut est inutilisable tant que la maquette et la base de démo n'ont pas les mêmes données — et on ne peut pas leur donner les mêmes : **66 pages de `/app` lisent leurs données côté serveur** (RSC) et 14 composants par server action, que l'interception CDP ne voit pas.
2. Le prototype marche de bout en bout sur `app-notifications` (approche A, « Historique ») contre `/app/notifications`, téléphone et bureau : **déterminisme parfait** (deux relevés de la même maquette : 0 octet différent sur 3,9 M ; idem pour le produit), **sensibilité 6 sur 6** sur des écarts injectés (rayon, marge +2 px, couleur, graisse, couleur de bordure, hauteur +4 px), 0 faux positif.
3. **Les maquettes doivent être gelées en références mesurées** (JSON des styles calculés, ~40-75 Ko par écran, versionnables) : la CI et les worktrees ne les ont pas, et elles peuvent encore bouger (TCK-2604 : « le téléphone a été redessiné le 2026-11-10 »).
4. **Un artefact de la visionneuse fausse toute mesure « téléphone » prise sur un bureau** : `globals.css:805-808` passe `html` à 90 % dès 64rem de **fenêtre** → la maquette téléphone y est rendue en rem = 14,4 px, le vrai téléphone en 16 px. Le porteur a validé des écrans téléphone vus à 90 % : **décision à prendre** (§ 8).
5. Coût : outil **M** (~1 jour : rendre le prototype propre, geler ~200 écrans × 2 appareils) ; puis **S par ticket** (fiche de rôles 15-30 min, relevés 2-5 min). Cinq critères d'acceptation types en § 7.

---

## 1. Les contraintes du terrain — mesurées

### 1.1 Les maquettes ne sont pas versionnées

| Fait | Source | Conséquence |
|---|---|---|
| Exclues par `.git/info/exclude`, n'existent que dans l'arbre principal | README de l'audit § Maquettes | Un worktree ne les a pas ; la CI GitHub non plus. **La CI ne peut rien prouver de la fidélité** — sauf à comparer à des références versionnées, et même alors elle n'a pas l'application qui tourne avec l'API (aucun job ne sert le front contre une base de démo). |
| « Le dossier se supprime avec le dernier ticket qui s'en sert » | même § | Elles vivent jusqu'à la fin des vagues 86-90 — mais **elles bougent** : TCK-2604 signale un téléphone « redessiné le 2026-11-10 ». Une référence qui change sous un ticket en cours n'est pas un contrat. |
| Un worktree peut quand même les lire par la visionneuse de l'arbre principal (`localhost:3000`) | essai : le relevé maquette ne passe que par HTTP | Le relevé de la maquette se fait toujours sur le `next dev` de l'arbre principal ; le relevé du produit sur celui de la branche (`--base http://localhost:3100` dans le prototype, même API, même cookie). |

**Ce qui reste possible** : geler, au moment où le ticket s'écrit (ou en une passe pour tous, maintenant), **le résultat** de chaque écran retenu — ce qui ne contredit pas « on en reprend le résultat, jamais le code » :

| Artefact gelé | Taille mesurée (un écran) | Total estimé (~200 écrans × 2 appareils) | Versionner ? |
|---|---|---|---|
| JSON des mesures (nœuds texte / boîte / icône + styles calculés) | 39 Ko téléphone, 73 Ko bureau (3,2 Ko gzip) | ~22 Mo bruts, **~1-2 Mo dans git** (compressé) | **Oui** — le worktree et la PR l'ont ; la comparaison n'a plus besoin des maquettes |
| PNG DPR 2 | 177 Ko téléphone, 406 Ko bureau | ~117 Mo | Non |
| WebP sans perte (même image) | 63 Ko / 139 Ko | ~40 Mo | Non (local, à côté des maquettes, exclu de git) |

Recensement des écrans : 33 pages ont une `retenue` ; leur approche retenue déclare **165 écrans** dans le fichier de page, dont 3 sans bureau ; 5 pages (agenda, assistants, fil commercial, réservations, visites) définissent leurs écrans dans un fichier voisin que mon recensement par motif ne lit pas → **~200 écrans** est un ordre de grandeur, pas un compte.

### 1.2 Les données

| Voie de données du produit | Fichiers (hors tests, hors playground) | Interceptable par CDP `Fetch.requestPaused` ? |
|---|---|---|
| Composant serveur qui `await` l'API (`apiRequest`, `get…Action`, `apiFetch`) | **66** sous `src/app/(dashboard)` | **Non** — la requête part du serveur Next, pas du navigateur |
| `useQuery` + server action (`getNotificationsAction`…) | 14 | Non en pratique : la réponse est un flux RSC, pas du JSON qu'on peut forger proprement |
| `useApiQuery` (navigateur → API) | 12 | Oui |

Relevé réseau du prototype sur `/app/notifications` : la liste arrive par server action, **aucune requête `/api/notifications` ne passe par le navigateur** ; seules les requêtes de la coque (compteurs, drapeaux) y passent.

⇒ **L'option (a) « même données des deux côtés par interception » ne se généralise pas.** Le prototype garde `--fixtures` (codé, non éprouvé faute de cible) et `--horloge` (Date figée côté navigateur — ne fige pas les dates rendues par le serveur, non éprouvé).

**Ce que la structure rend inutile** : comparer les données. La comparaison structurelle compare ce que le ticket doit rendre fidèle — la **forme** (marges, rayons, bordures, couleurs, typographie, hauteurs, espacements) — sur des éléments appariés par leur **rôle**, sans regarder le texte des données.

### 1.3 Déterminisme — mesuré

| Source de bruit | Mesure | Verdict |
|---|---|---|
| Deux relevés de la même maquette (téléphone) | **0 octet différent** sur 3 949 920 | Aucun bruit d'exécution |
| Idem, bureau | 0 sur 15 552 000 | idem |
| Deux relevés du produit à ~15 min d'écart | 0 octet différent | idem (base de démo stable ; les « il y a 2 h » bougeront sur des heures — dates absolues dans la liste actuelle) |
| Calque de composition de la visionneuse (`translateZ(0)` sur deux ancêtres de l'écran) → anticrénelage différent ? | 98 octets sur 3,9 M, écart max 23/255 | Négligeable, sous le seuil |
| Polices `next/font` | attente `document.fonts.ready` ; police relevée des deux côtés (`dmSansExt`, `bricolageExt`) | Maîtrisé |
| Animations, transitions, curseur | neutralisés par une feuille injectée avant tout script | Maîtrisé |
| Barres de défilement | `--hide-scrollbars` des deux côtés | Maîtrisé |
| DPR | 2 des deux côtés, bureau compris | Maîtrisé |
| `hover`/`pointer` | émulés `none`/`coarse` pour le téléphone des deux côtés (le produit a une variante `tactile:` — `globals.css:45`) | Maîtrisé |
| Images | `SEED_DOWNLOAD_MEDIA=false` : le produit n'a pas les photos ; la maquette a `public/maquettes/` | Zone à exclure des pixels ; la **boîte** de l'image (taille, ratio, rayon) se compare (`img` inventorié) |

### 1.4 Artefacts de la visionneuse — mesurés et neutralisés à l'exécution

| # | Artefact | Mesure | Neutralisation dans le prototype |
|---|---|---|---|
| 1 | **rem = 14,4 px dans la maquette téléphone vue sur un bureau** (`globals.css:805-808`, `html { font-size: 90% }` dès 64rem de fenêtre) | même écran : rem 14,4 px en fenêtre 1700 ; 16 px une fois `html` forcé à 100 % ; le titre de la tête passe de x = 43,2 à 48 ; les tailles en px (`text-[17px]`) ne bougent pas | `html{font-size:100%}` injecté pour le téléphone (`--rem 14.4` pour relever ce que le porteur a vu). Le bureau n'est pas touché : 2500 px de fenêtre comme 1440 → 14,4 des deux côtés |
| 2 | Cadre bureau de 1440 px **bordure comprise** → contenu à **1438 px** | relevé : « écran à 1438 × 1051 » | bordure et arrondi du cadre retirés → 1440 |
| 3 | Arrondis 40/50 px du cadre téléphone (coins coupés) | visibles sur la première capture | arrondis et ombre retirés |
| 4 | Échelle < 1 si la fenêtre est petite (`ScenePhone`, `SceneBureau`) | — | fenêtre 1700×1150 (téléphone) / 2500×1250 (bureau) ; l'outil **échoue** si l'écran n'est pas exactement 390×844 / 1440×≥900 à l'échelle 1 |
| 5 | Vue « téléphone réel » : barre de 44 px au-dessus → maquette haute de 800 px | lecture de `Visionneuse.tsx` (`VueTelephoneReel`, `h-11`) | non utilisée |

---

## 2. L'outillage disponible — vérifié

| Outil | État | Usage |
|---|---|---|
| Chrome `/Applications/Google Chrome.app` | présent | headless jetable par CDP |
| Node 24.18 | présent | `WebSocket` natif : aucune dépendance pour CDP |
| `sharp` 0.35.3 | présent **en dépendance transitive de `next`** (pas dans `package.json`) | décodage PNG, composition, côte à côte, superposition, diff maison |
| `capture.mjs` (audit) | présent | repris (Chrome jetable, créneaux à deux captures, cookie de persona) |
| pixelmatch, pngjs, playwright(-core), puppeteer(-core), odiff, looks-same, resemblejs, jimp, chrome-remote-interface, ws | **absents** | — |
| ImageMagick (`compare`, `magick`), ffmpeg | **absents** | — |
| Python PIL / numpy | **absents** | — |
| `sips` (macOS) | présent | inutile ici |

**Manque, et coût** : rien d'indispensable. Le diff de pixels maison (somme des écarts RVB > 40 ⇒ pixel différent) suffit pour des zones ; `pixelmatch` (détection d'anticrénelage) serait un confort à ~0 coût (devDependency de 2 paquets purs JS). Risque à noter : `sharp` n'arrive que par `next` ; l'outil versionné devrait le déclarer en devDependency explicite.

---

## 3. Les quatre options, jugées sur pièces

| Option | Ce qu'elle prouve | Ce qui la casse (mesuré) | Verdict |
|---|---|---|---|
| (a) Diff de pixels, mêmes données (fixtures CDP + horloge) | « même image » au sens fort | 66 pages RSC + 14 server actions hors d'atteinte du navigateur ; persona de la maquette ≠ persona de démo (onglets « Argent / Messages » contre « Demandes / Messagerie ») | **Rejetée comme garde générale.** Gardée en option pour les 12 écrans `useApiQuery` |
| (b) Comparaison structurelle par rôle (styles calculés) | chaque propriété de forme, en px, avec le nom de l'élément | appariement : texte des données différent → il faut des rôles explicites ; tutoiement de la maquette → alias de libellés | **Retenue comme garde** |
| (c) Superposition / rideau | l'impression d'ensemble, ce que le porteur regarde | rien ne la chiffre | **Retenue pour la validation du porteur** |
| (b′) Pixels sur les zones à contenu identique | ce que la structure ne voit pas (filet, pseudo-élément, icône non lucide) dans la coque, les têtes, les barres de filtres | nul ailleurs : 16,5 % de pixels différents sur l'écran entier, illisible (cf. `cote-a-cote.png`) | **Retenue, bornée aux zones** |

---

## 4. Le prototype

### 4.1 Ce qu'il fait

```bash
cd …/scratchpad/fidelite/methode
# 1. relever la maquette (approche retenue, un écran), artefacts neutralisés
node fidelite.mjs releve --maquette app-notifications --a a --e 1 --device mobile --out notif/maq
# 2. relever la vraie page, connectée à une persona   [--base http://localhost:3100 pour un worktree]
node fidelite.mjs releve --url /app/notifications --persona admin --device mobile --out notif/prod
#    options : --defiler 600 (tranche d'un écran long, document OU conteneur intérieur) · --perturber f.js
#              --fixtures f.json · --horloge 2026-11-10T09:30 · --rem 14.4
# 3. comparer
node fidelite.mjs compare --maquette notif/maq --produit notif/prod --roles notif/roles.json --out notif/rapport
```

- **Relevé** : capture de l'écran seul (390×844 ou 1440×900, DPR 2) + inventaire des nœuds visibles dans l'écran, coordonnées relatives à l'écran :
  - *texte* (élément qui porte un nœud texte) : police, taille, graisse, interligne, espacement, couleur, casse, chiffres ;
  - *boîte* (fond, bordure, ombre, contour ou `img`) : rectangle, fond, bordures, couleur de bordure, rayons, ombre, marges internes, `gap`, `data-slot` (shadcn), `data-fid` ;
  - *icône* : classe lucide (`lucide-bell`…), taille, couleur, `stroke-width` — **maquettes et produit utilisent tous deux lucide-react : la classe est une ancre gratuite** ;
  - chaque nœud porte la liste de ses boîtes ancêtres (appartenance par le DOM, pas par la géométrie — corrigé après qu'un texte passé SOUS la barre d'onglets s'y est fait compter).
- **Comparaison** :
  1. **rôles** déclarés par la fiche du ticket (`{ boiteDe: "texte de la maquette", min }`, `{ zone: {y,h} }`, `{ slot: "card" }`, `{ fid: "…" }`) : la boîte + son **contenu sans le texte** (textes et icônes de la boîte, appariés par libellé puis par ordre de lecture, comparés sur la typographie et le retrait depuis le bord gauche) ;
  2. **ancres automatiques** : textes et boîtes dont le texte est un **libellé d'interface** — une valeur de `src/messages/fr.json` — et icônes lucide. Le reste est classé « donnée » et ignoré (sinon : 54 faux « absents » sur l'écran de notifications) ;
  3. **alias** maquette → produit (`"Messages": "Messagerie"`, tutoiement → vouvoiement) ;
  4. **rôles de coque communs** (`roles-coque.json`, étendu par chaque fiche) : barre d'onglets, en-tête, barre latérale ;
  5. **pixels** : écran entier et zones déclarées ; sorties `difference.png`, `superposition.png` (produit à 50 % sur la maquette), `cote-a-cote.png` (maquette | produit | différence), `rideau.html` (rideau glissant + opacité, pour le porteur), `rapport.md`, `rapport.json`.

### 4.2 Les essais

| Essai | Résultat |
|---|---|
| E1 — déterminisme : maquette contre elle-même (téléphone, bureau), produit contre lui-même | **0 écart, 0 % de pixels, 0 octet différent** |
| E2 — sensibilité : six écarts typiques injectés dans la maquette, **chacun vérifié avant → après** (une première série mal choisie ne changeait rien : la couleur injectée était déjà la sienne — d'où la vérification) | **6 sur 6 attrapés, 0 faux positif** — tableau ci-dessous |
| E3 — produit réel contre maquette, téléphone | rapport lisible : 47 écarts, 26 absents du produit, 12 absents de la maquette, 16,5 % de pixels (l'écran n'est pas encore implémenté : c'est attendu) |
| E4 — bureau | fonctionne après correction de l'artefact n° 2 ; 52 écarts |
| E5 — tranche défilée (`--defiler 600`) | maquette : conteneur intérieur, plafonné à 351 px ; produit : `MAIN` à défilement intérieur, 600 px |

E2, le rapport produit par l'outil :

| Origine | Élément | Propriété | Maquette | « Produit » | Δ |
|---|---|---|---|---|---|
| rôle | coque · barre d'onglets | hauteur | 64px | 68px | 4 |
| rôle (contenu) | ligne « Bien à valider » › texte 1 | graisse | 600 | 500 | -100 |
| rôle (contenu) | intertitre de jour › texte 1 (« Cette semaine ») | couleur | rgb(110,101,90) | rgb(168,83,50) | ≠ |
| ancre boîte | Tout | marge gauche | 14px | 16px | 2 |
| ancre boîte | Confirmer | rayon | 10 10 10 10 | 8 8 8 8 | ≠ |
| ancre boîte | Répondre | couleur de bordure | rgb(235,229,213) | rgb(200,190,175) | ≠ |

E3, un extrait — ce que la méthode dit **aujourd'hui** de la barre d'onglets (relevés des deux côtés ; à recouper avec le rapport de la coque) :

| Élément | Propriété | Maquette | Produit |
|---|---|---|---|
| barre d'onglets | hauteur | 64 px | 56 px |
| icônes d'onglet | taille / trait | 18 px / 1,75 | 20 px / 2 |
| libellés d'onglet | interligne | 16,5 px | 13,8 px |
| zone de la barre | pixels différents | — | 13,85 % |

### 4.3 Temps mesurés et ce qui a cassé

| | Temps |
|---|---|
| Relevé, créneau libre, route déjà compilée | **4-6 s** |
| Relevé, première compilation de la route par `next dev` | 18-30 s |
| Relevé quand d'autres agents occupent les deux créneaux | jusqu'à 168 s d'attente |
| Comparaison + images | **< 1 s** |
| Un ticket de 3 écrans × 2 appareils (6 relevés produit, références gelées) | ~1 min machine |

Ce qui a cassé, et a été corrigé dans le prototype : URL du produit (`/app/…`, pas `/fr/app/…` → 404) ; coins arrondis du cadre (deux niveaux) ; cadre bureau à 1438 px (le premier élément à 1440 px n'était pas le bon) ; rem 90 % ; perturbations sans effet (non vérifiées) ; appartenance au rôle par géométrie ; superposition (`sharp.linear` refuse d'étendre les canaux).

Ce qui reste fragile : l'appariement du **contenu** d'un rôle par ordre de lecture se décale quand la structure diffère (un badge en plus d'un côté) — sans conséquence après implémentation, quand la structure est la même ; les sélecteurs de rôle par `zone` (y, h) sont approximatifs ; le relevé ne couvre qu'**un écran de haut** par appel (les pages longues se font par tranches `--defiler`).

---

## 5. Ce que la méthode attrape, ce qu'elle n'attrape pas

| Attrape (prouvé par E2 ou par E3) | N'attrape pas |
|---|---|
| Rayon, épaisseur et couleur de bordure, fond, ombre (chaîne exacte) | Les pseudo-éléments (`::before/::after`), `text-decoration`, anneaux de focus — non inventoriés |
| Marges internes, `gap`, hauteur d'un élément d'interface | Un écart **sous la tolérance** (1 px de taille, 2 px de position) |
| Police, taille, graisse, interligne, couleur, espacement des lettres | Les tailles qui dépendent des données (largeur d'un titre, hauteur d'une ligne de deux lignes) — exclues volontairement |
| Taille, trait, couleur des icônes lucide | Une icône non lucide (logo, SVG maison) au-delà de sa taille |
| Libellé ou icône de la maquette **absent** du produit (et l'inverse) | Un élément sans ancre ni rôle : séparateur, panneau de fond sans texte — sauf s'il tombe dans une zone de pixels |
| Les décalages de position (un élément qui descend de 8 px) | Les états non relevés : survol, focus, menu ouvert, vide, erreur, chargement — à relever par `--perturber` (ouvrir un menu), une persona sans données, ou une requête suspendue (non éprouvé) |
| Ce que les pixels voient dans les zones à contenu identique | Le mouvement (neutralisé), la justesse du texte (vouvoiement : ADR-0095) |

---

## 6. Intégration au flux

### 6.1 Où vit quoi

| Quoi | Où | Versionné |
|---|---|---|
| L'outil (`fidelite.mjs` : `releve`, `compare`, `geler`) | `takussan-web/scripts/fidelite/` (générique, ne contient aucune maquette) ; `sharp` en devDependency explicite | oui |
| Les rôles de coque communs | `takussan-web/scripts/fidelite/roles-coque.json` | oui |
| Les **références gelées** (JSON) | `docs/qa/audit-ux-2026-11/fidelite/references/<page>/<approche>-<écran>-<appareil>.json` | **oui** (~1-2 Mo dans git) |
| Les références gelées (PNG/WebP) | à côté des maquettes, `takussan-web/public/maquettes/references/` ou équivalent exclu par `.git/info/exclude` | non |
| La fiche de fidélité d'un ticket (écrans, persona, route, rôles, alias, zones) | `docs/qa/audit-ux-2026-11/fidelite/TCK-NNNN.json`, écrite **avec le ticket** | oui |
| Les rapports d'une PR (md, png, rideau) | `takussan-web/.fidelite/TCK-NNNN/`, exclu de git | non |

Jetons de persona : le prototype lit `personas.json` du dossier de session ; l'outil versionné doit les frapper lui-même (`jetons.php` par tinker, fichier 600 hors dépôt), sans jamais les imprimer.

### 6.2 Qui lance quoi

- **Gel des références** : une fois, maintenant, par la session principale (≈ 400 relevés × 5 s ≈ 35 min machine au repos, à découper en lots de < 9 min) ; puis à chaque retouche d'une maquette retenue (le gel date la référence ; une retouche après l'écriture du ticket = nouvelle référence, nommée dans la fiche).
- **L'implémenteur**, en local sous `./dev.sh`, avant d'ouvrir la PR : `releve` du produit pour chaque écran × appareil de la fiche, `compare` contre la référence gelée, itère jusqu'au vert. Depuis un worktree : son propre `next dev -p 3100`, `--base`. Les relevés ne lancent aucune suite de tests et pèsent un Chrome chacun (créneaux à deux).
- **La CI** : rien. Elle n'a ni l'application servie ni la base de démo. Une garde de dépôt peut seulement vérifier qu'une PR de ces tickets porte sa fiche et son tableau (option, plus tard).
- **Le porteur** valide sur la PR : il lit le tableau résumé, la liste des écarts acceptés et leur motif, et ouvre les rideaux (`rideau.html`, local — même machine).

### 6.3 Tolérances proposées, et pourquoi

| Propriété | Tolérance | Justification |
|---|---|---|
| Police, taille de police, graisse, rayon, épaisseur de bordure, ombre, trait et taille d'icône | **exacte** | Ce sont des jetons discrets : toute différence est une autre classe. Bruit d'exécution mesuré : 0. |
| Couleurs | **±3/255 par canal** (alpha ±0,02) | Le bruit mesuré est 0 ; la marge couvre des chemins de conversion différents vers sRGB (`bg-primary/90` contre `color-mix`) — **non mesurée**, à resserrer à 0 si les trois premiers tickets n'en ont pas besoin |
| Dimensions d'un élément d'interface (bouton, puce, barre, en-tête, champ), marges, `gap` | **±1 px** | Au bureau, rem = 14,4 : les tailles tombent sur des fractions (10,8 ; 77,9) et deux mises en page équivalentes peuvent arrondir différemment au demi-pixel d'appareil (DPR 2) ; 1 px CSS = 2 px d'appareil |
| Position d'une ancre | **±2 px** | Deux arrondis cumulés. Un décalage hérité se lit de haut en bas : corriger le premier |
| Tailles dépendant des données | **hors garde** | Elles décrivent la base de démo, pas l'implémentation |
| Pixels d'une zone à contenu identique (coque, tête de page, barre de filtres) | **≤ 0,5 %** au seuil RVB 40 | Mesuré : un changement de calque = 0,0025 % ; six petits écarts = 2 % de l'écran entier. **À étalonner** sur les trois premiers tickets |

---

## 7. Critères d'acceptation à ajouter à chaque ticket front des vagues 86-90

À recopier dans la section « Critères d'acceptation », avec les écrans du ticket :

- [ ] **AC-F1 — Fiche de fidélité.** `docs/qa/audit-ux-2026-11/fidelite/TCK-NNNN.json` liste chaque écran de la maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état à reproduire, les rôles des composants de données (ligne, carte, panneau…), les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] **AC-F2 — Zéro écart non expliqué.** Pour chaque écran × {téléphone 390×844, bureau 1440×900}, `fidelite compare` contre la référence gelée ne rend **aucun écart** au-delà des tolérances (§ 6.3) sur les rôles (boîte + contenu) et les ancres (libellés, icônes) — **ou** chaque écart restant figure dans la PR, au tableau « écarts acceptés », avec son motif : charte (la maquette a dévié), donnée, décision du porteur.
- [ ] **AC-F3 — Rien ne manque.** Aucun libellé ni aucune icône de la maquette n'est « absent du produit » sans alias ou motif écrit ; aucun élément d'interface « absent de la maquette » sans motif.
- [ ] **AC-F4 — Zones identiques.** Chaque zone déclarée (coque, tête de page, barre de filtres) a ≤ 0,5 % de pixels différents.
- [ ] **AC-F5 — Preuve dans la PR.** La PR porte, par écran et par appareil, la ligne `conformes · écarts · absents · % pixels` et le chemin local de `rideau.html` et de `cote-a-cote.png` ; le porteur valide sur le rideau.

Relu à la question « une régression le cocherait-elle aussi ? » : un rayon, une marge, une graisse, une couleur faux font rougir AC-F2 (E2 : 6 sur 6). Un **libellé changé** ferait passer un élément en « absent » : AC-F3 le refuse sans motif. Ce qu'une régression peut traverser : un écart sous tolérance, un élément sans ancre ni rôle hors zone — c'est le § 5, et c'est au porteur de le voir au rideau.

---

## 8. Ce qui revient au porteur

1. **Quelle référence pour le téléphone : la maquette à rem 16 (ce que son code dit, ce qu'un vrai téléphone rendra) ou à 90 % (ce que le porteur a vu sur son bureau) ?** Recommandation : **rem 16** — c'est la seule qui puisse être égale au produit sur un téléphone ; le porteur peut revoir un écran sur son téléphone (vue « téléphone réel », rem 16), ou dans la visionneuse si on lui ajoute un interrupteur « rem 100 % » sur le cadre téléphone (retouche locale des maquettes, à sa décision). Effet : sur un vrai téléphone, tout ce qui est en rem paraîtra ~11 % plus grand que ce qu'il a validé à l'écran.
2. **Versionner les références JSON** (recommandé : oui, ~1-2 Mo, c'est le résultat et pas le code ; le worktree et la PR en ont besoin) ; les images restent locales.
3. **Geler maintenant** les ~200 écrans retenus (recommandé), ou au fil de l'écriture des tickets.
4. Tolérances du § 6.3 ; seuil de pixels à étalonner sur les trois premiers tickets.

## 9. Coût

| Chantier | Effort | Contenu |
|---|---|---|
| Outil versionné (`releve`, `compare`, `geler`), à partir du prototype | **M** (~1 j) | jetons, créneaux, `--base`, sorties, `sharp` déclaré, doc d'en-tête, rôles de coque des deux appareils |
| Gel des références | **S** (machine ~35 min) | lot découpé, journal de ce qui a été gelé et quand |
| Par ticket | **S** | fiche 15-30 min (rôles + alias), relevés ~1-2 min, itérations |
| Option pixels à données identiques (fixtures) | S par écran, **seulement les 12 écrans `useApiQuery`** | non recommandé en général |

## 10. Fichiers

- `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/fidelite.mjs` — le prototype
- `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/roles-coque.json` — rôles communs
- `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/perturber.js` — l'essai de sensibilité (E2)
- `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/notif/rapport/` — E3 téléphone : `rapport.md`, `cote-a-cote.png`, `superposition.png`, `difference.png`, `rideau.html`
- `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/notif/rapport-b/` — E4 bureau
- `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/methode/notif/r-sensibilite/rapport.md`, `…/notif/r-determinisme/rapport.md` — E2, E1
