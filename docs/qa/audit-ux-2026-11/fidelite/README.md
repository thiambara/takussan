# Fidélité au pixel — l'outil, les références gelées, la fiche d'un ticket

[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) : la maquette retenue fait foi
au pixel, à taille réelle. Ce dossier dit **comment le prouver**, écran par écran, avant d'ouvrir la PR
d'un ticket de page (TCK-2684 ; méthode : [annexe D](D-methode.md)).

| Quoi | Où | Versionné |
|---|---|---|
| L'outil (`releve`, `compare`, `geler`, `journal`, `jetons`, `balayer`) | `takussan-web/scripts/fidelite/` | oui |
| Rôles de coque communs | `takussan-web/scripts/fidelite/roles-coque.json` | oui |
| Personas (adresse, disposition attendue — **aucun jeton**) | `takussan-web/scripts/fidelite/personas.json` | oui |
| Références gelées (JSON des styles calculés) | [`references/<page>/<approche>-<écran>-<appareil>.json`](references/) | **oui** |
| Pages retenues, revue du porteur, pages dessinées à 1280 | [`references/retenues.json`](references/retenues.json) | oui |
| Journal du gel (généré) | [`references/JOURNAL.md`](references/JOURNAL.md) | oui |
| Images gelées (PNG) | `takussan-web/.fidelite/references/` | **non** (`.gitignore`) |
| Rapports d'une comparaison | `takussan-web/.fidelite/<TCK>/…` (conseillé) | non |
| Jetons des personas | `~/.takussan-fidelite/jetons.json` (0600) ou `$FIDELITE_JETONS` | **jamais** |
| Fiche de fidélité d'un ticket | `TCK-<n°>.json` ici — modèle [`TCK-NNNN.json`](TCK-NNNN.json), exemple [`exemple-notifications.json`](exemple-notifications.json) | oui |

## Installation

Rien à installer : Chrome (`/Applications/Google Chrome.app`, ou `$FIDELITE_CHROME`), Node ≥ 22 (WebSocket
natif) et `sharp` (devDependency de `takussan-web`). Il faut l'application servie (`./dev.sh`) : le front
sur `:3000`, l'API sur `:8002`, la base de démo.

Le compte **locataire** de l'outil (`locataire@agency1.demo.takussan.sn`) vient d'un seeder ciblé et
idempotent, rejouable sans `migrate:fresh` :

```bash
cd takussan-api && php artisan db:seed --class='Database\Seeders\Support\DemoTenantSeeder'
```

Les jetons se frappent seuls au premier relevé d'une persona (et de nouveau si le jeton a expiré).
Pour les frapper d'avance : `node scripts/fidelite/fidelite.mjs jetons` (`--renouveler` pour tout
refrapper). La sortie ne porte que des noms de personas.

## Les commandes (depuis `takussan-web/`)

```bash
F="node scripts/fidelite/fidelite.mjs"

# 1. Relever le produit, pour chaque écran × appareil de la fiche
$F releve --url /app/notifications --persona admin --device mobile  --out .fidelite/TCK-2634/prod-a-1-telephone
$F releve --url /app/notifications --persona admin --device desktop --out .fidelite/TCK-2634/prod-a-1-bureau-1440
$F releve --url /app/notifications --persona admin --device desktop --largeur 1280 --out .fidelite/TCK-2634/prod-a-1-bureau-1280

# 2. Comparer à la référence gelée
$F compare --maquette ../docs/qa/audit-ux-2026-11/fidelite/references/app-notifications/a-1-telephone.json \
           --produit .fidelite/TCK-2634/prod-a-1-telephone \
           --roles ../docs/qa/audit-ux-2026-11/fidelite/TCK-2634.json \
           --out .fidelite/TCK-2634/a-1-telephone
# → rapport.md, rapport.json, difference.png, superposition.png, cote-a-cote.png, rideau.html
```

Options de `releve` : `--maquette <page> --a <approche> --e <écran>` (une maquette, servie par
l'arbre principal) · `--defiler <px>` (tranche d'un écran long : document ou conteneur intérieur) ·
`--perturber <fichier>` (un corps de fonction évalué dans la page : ouvrir un menu, remplir un champ) ·
`--disposition <persona de coque>` (exige une autre disposition que celle du compte) · `--rem 14.4`
(ce que le porteur a vu dans la visionneuse au bureau, **pour mémoire seulement**) ·
`--via visionneuse` (relève dans l'iframe de la visionneuse plutôt que dans le cadre seul : mêmes
mesures, c'est un contrôle) · `--sans-attente-donnees` (relever un état de chargement).

### Depuis un worktree

Le worktree n'a pas les maquettes (elles sont exclues de git) : il n'en a pas besoin. Il a les
références gelées, versionnées.

```bash
npx next dev -p 3100            # le front de la branche ; même API, même base, mêmes jetons
$F releve --url /app/notifications --persona admin --device mobile --base http://localhost:3100 --out .fidelite/x/prod
$F compare --maquette ../docs/…/references/app-notifications/a-1-telephone.json --produit .fidelite/x/prod --out .fidelite/x/r
```

Sans les images gelées (`.fidelite/references/` n'existe que là où le gel a tourné), la comparaison
est **structurelle seule** et le rapport le dit ; `--image-maquette <png>` en donne une. Pour les pixels
et le rideau, lancez `compare` depuis l'arbre principal, ou copiez `takussan-web/.fidelite/references/`.

### Le gel des références

Réservé à la session principale, après la revue du porteur ; **une commande dure moins de 9 minutes**
(`--budget`, 480 s par défaut) et **reprend où elle s'est arrêtée** (une référence présente n'est pas
refaite sans `--force`) :

```bash
$F geler --page app-notifications        # une page
$F geler --toutes                        # à relancer tant qu'elle sort en 6 (« budget atteint »)
$F journal                               # régénère references/JOURNAL.md (geler le fait aussi)
```

`geler` recense les écrans **par la visionneuse elle-même** (la liste « Écrans » qu'elle rend pour
l'approche retenue ; `gel.json` de chaque page), relève chaque écran au téléphone (390 × 844),
au bureau 1440 et — pour les pages dessinées à 1280 (`retenues.json`) — au bureau 1280. Un écran
« sans version bureau » est sondé, compté et nommé au journal. Un relevé refusé n'arrête pas le lot :
il est nommé, la commande sort en 1, et le journal compte la page incomplète.

## Ce qu'un relevé garantit — sinon il échoue

Un relevé qui ne mesure pas ce qu'il prétend ne s'écrit pas (aucun fichier) :

- l'écran fait **exactement 390 × 844** (téléphone, DPR 2, tactile, `hover: none`, `pointer: coarse`
  des deux côtés) ou **W × 900** au bureau (W = 1440 ou 1280), **à l'échelle 1** ;
- `html` a le `rem` attendu et `--spacing` la densité attendue : téléphone rem 16, densité ×1 ; bureau
  densité ×0,9, rem 14,4 **avant** TCK-2692 et 16 **après** (ADR-0107) — le relevé porte `rem`,
  `spacingPx` et `densite` ;
- les polices sont chargées, le réseau est calme et aucune donnée ne charge encore (squelette,
  `aria-busy`, « Chargement… ») ;
- la page n'a pas répondu ≥ 400 et n'a pas été redirigée (jeton périmé → refrappé une fois) ;
- une maquette est bien celle demandée (la visionneuse retombe en silence sur la première page) ;
- la **disposition** de la coque est celle de la persona (liens de la navigation : un compte sans bail
  rend le menu d'un client, et un écran « Persona · locataire » le refuse) ;
- le relevé contient des nœuds : un relevé vide n'est pas un relevé conforme.

Les relevés sont **déterministes** : deux relevés successifs d'un même écran sont identiques à l'octet,
hors du champ `meta` (date, durée, commit, requêtes observées).

## Lire un rapport

La première ligne est celle qu'AC-F5 demande dans la PR : `conformes · écarts · absents · % pixels`.

- **Rôles** (déclarés par la fiche) : la boîte d'un composant de données, puis son **contenu sans le
  texte** — textes et icônes appariés par libellé puis par ordre de lecture, jugés sur la typographie
  et le retrait depuis le bord gauche de la boîte.
- **Ancres** : tout libellé d'interface (une valeur de `src/messages/fr.json`, ou une `ancre` déclarée)
  et toute icône lucide présents des deux côtés. Le reste est de la **donnée** et n'est pas comparé.
- **Absents** : un libellé ou une icône d'un seul côté. Un libellé renommé (vouvoiement) s'aligne par
  un `alias` de la fiche.
- **Pixels** : l'écran entier (indicatif : les données diffèrent) et les **zones** à contenu identique
  (coque, tête de page, barre de filtres), seules jugées.
- **Rideau** (`rideau.html`) : maquette à gauche, produit à droite, rideau glissant et opacité — c'est
  là que le porteur valide.

Un écart de `rem` entre une référence d'avant TCK-2692 et un produit d'après est un **avertissement**,
pas un écart : les références sont des styles calculés en px, valables des deux côtés de la bascule.

## Tolérances ([annexe D, § 6.3](D-methode.md#63-tolérances-proposées-et-pourquoi))

| Propriété | Tolérance |
|---|---|
| Police, taille, graisse, casse, rayon, épaisseur de bordure, ombre (chaîne exacte), trait et taille d'icône | exacte |
| Couleurs | ±3/255 par canal, alpha ±0,02 |
| Dimensions d'un élément d'interface, marges internes, `gap` | ±1 px |
| Position d'une ancre | ±2 px |
| Tailles dépendant des données | hors garde (le contenu d'un rôle ne se juge pas sur sa largeur) |
| Pixels d'une zone à contenu identique | ≤ 0,5 % au seuil RVB 40, à étalonner sur les trois premiers tickets |

Elles vivent dans `scripts/fidelite/comparer.mjs` (`TOLERANCES`) ; le test du dépôt
`src/__tests__/fidelite-comparer.test.ts` en éprouve chaque borne.

## Critères types à recopier dans un ticket de page

- [ ] **AC-F1 — Fiche de fidélité.** `docs/qa/audit-ux-2026-11/fidelite/TCK-NNNN.json` liste chaque écran de la maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état à reproduire, les rôles des composants de données (ligne, carte, panneau…), les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] **AC-F2 — Zéro écart non expliqué.** Pour chaque écran × {téléphone 390×844, bureau 1440×900, bureau 1280×900 si la page y est dessinée}, `fidelite compare` contre la référence gelée ne rend **aucun écart** au-delà des tolérances sur les rôles (boîte + contenu) et les ancres (libellés, icônes) — **ou** chaque écart restant figure dans la PR, au tableau « écarts acceptés », avec son motif : une des trois exceptions d'ADR-0106 § 2 (accessibilité mesurée, contrainte technique, incohérence des maquettes tranchée par la valeur majoritaire).
- [ ] **AC-F3 — Rien ne manque.** Aucun libellé ni aucune icône de la maquette n'est « absent du produit » sans alias ou motif écrit ; aucun élément d'interface « absent de la maquette » sans motif.
- [ ] **AC-F4 — Zones identiques.** Chaque zone déclarée (coque, tête de page, barre de filtres) a ≤ 0,5 % de pixels différents.
- [ ] **AC-F5 — Preuve dans la PR.** La PR porte, par écran et par appareil, la ligne `conformes · écarts · absents · % pixels` et le chemin local de `rideau.html` et de `cote-a-cote.png` ; le porteur valide sur le rideau.

## Ce que l'outil n'attrape pas ([annexe D, § 5](D-methode.md#5-ce-que-la-méthode-attrape-ce-quelle-nattrape-pas))

- les pseudo-éléments (`::before`, `::after`), `text-decoration`, les anneaux de focus ;
- un écart sous la tolérance (1 px de taille, 2 px de position) ;
- les tailles qui dépendent des données (largeur d'un titre, hauteur d'une ligne de deux lignes) ;
- une icône non lucide au-delà de sa taille ;
- un élément sans ancre ni rôle (séparateur, panneau de fond sans texte), sauf dans une zone de pixels ;
- les états non relevés : survol, focus, menu ouvert, vide, erreur, chargement — à relever par
  `--perturber`, une persona sans données, ou `--sans-attente-donnees` ;
- le mouvement (neutralisé), la justesse du texte (vouvoiement : ADR-0095) ;
- **les dates relatives** (« il y a 2 h ») : le serveur les calcule, et l'horloge du navigateur n'y peut
  rien ; un relevé du produit à quelques heures d'écart peut différer par elles.

L'outil n'est **pas** joué en CI (elle n'a ni l'application servie ni la base de démo) et ne lance
aucune suite de tests. Seule sa logique de comparaison est éprouvée par la suite du dépôt.

## Le balayage (débord, coupe, ellipse)

```bash
$F balayer --maquette app-biens --a a --largeurs 768,1024,1280,1440
$F balayer --url /app/properties --persona admin --largeurs 390,768,1024,1280,1440
```

Une ligne JSON par écran et par largeur : `debord` (défileur racine : `scrollWidth − clientWidth`),
`depasse` (éléments qui sortent de la fenêtre hors conteneur qui défile), `ellipses` (permises pour un
texte secondaire) et `coupes` (texte coupé net par un ancêtre `overflow: hidden|clip` — jamais).
