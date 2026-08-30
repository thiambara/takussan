---
id: TCK-450
title: "Le ton `success` de `StatusBadge` emprunte `--accent` — décider la charte, et le vérifier à l'écran"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-27
updated: 2026-08-27
depends_on: [TCK-385]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, design-system, tokens, a11y, charte]
---

## Objectif utilisateur

Un statut positif — « approuvé », « actif », « vérifié », « payé » — se lit sans effort dans les
trois consoles, et ne porte pas la couleur qui veut dire « mis en avant ».

## Contexte

`src/components/console/StatusBadge.tsx` est **le seul endroit du dépôt où la couleur d'un statut
est décidée** — c'est sa raison d'être, et elle tient. Mais son ton `success` rend :

```
success: 'bg-accent/15 text-accent',
```

`--accent` est l'accent de MARQUE, documenté dans `docs/design-guidelines.md` comme « sage discret
pour badges *featured* ». `--success` existe depuis TCK-381, créé exactement pour ce cas — le
docblock de `globals.css` le dit en toutes lettres : *« un accent de marque et une confirmation ne
sont pas la même chose, et les confondre retire au produit le moyen de dire ça a marché »*.
TCK-381 a créé le jeton sans reprendre ce ton-là.

**Deux défauts, pas un**, et le second n'est visible qu'en mesurant :

1. **Sémantique.** Un ton nommé `success` rendu avec le jeton `accent` est faux par construction,
   et il fait porter la même teinte à deux sens différents : « mis en avant » (site public) et
   « approuvé » (console).
2. **Contraste.** Mesuré le 2026-08-27 pendant TCK-385, sur la surface RÉELLE — la pastille est un
   aplat à 15 % posé sur le conteneur `bg-muted/30` du téléverseur KYC, lui-même sur la page :

   | | clair | sombre |
   |---|---|---|
   | `--accent` sur `accent/15` (aujourd'hui) | **4,19:1 ✗** | **3,71:1 ✗** |
   | `--success` sur `success/15` | 4,61:1 ✓ | 5,73:1 ✓ |

   Le seuil applicable est **4,5:1 (WCAG 2.2 §1.4.3, texte normal)** : la pastille porte du
   `text-xs`. Le ton actuel échoue dans les DEUX thèmes ; le jeton d'état passe dans les deux.

**Ce ticket existe séparément de TCK-385 pour une raison de portée, pas de difficulté.** Le delta
tient en une ligne. Mais TCK-385 a mesuré son rayon d'action et il n'est pas modeste — voir le
tableau ci-dessous — et surtout : *un changement de couleur sur 21 badges validé par un seul ratio
de contraste, sans une capture, n'est pas une livraison.* C'est l'exigence que TCK-385 ne pouvait
pas tenir (aucun serveur de développement dans son lot) et que celui-ci porte.

### Le rayon d'action, relevé le 2026-08-27

**20 sites de résolution dans 19 fichiers**, dont **14 passent par une table** — un `grep` de
`tone="success"` n'en voit que 6 et fait croire à un rayon trois fois plus petit.

⚠ Ce tableau a compté **21 sites dans 20 fichiers** pendant une demi-journée. Le 21ᵉ était
`app/(dashboard)/app/properties/page.tsx:148`, et il n'en est pas un : son `tone: 'success'` est
une prop de `PropertyKpiStrip`, dont l'union est `'neutral' | 'success' | 'accent' | 'muted'` —
un type HOMONYME de `StatusTone`, pas le même — et sa table rend déjà `bg-success/10`. *Deux
unions qui partagent un nom de membre se ressemblent dans un `grep` et n'ont rien à voir.*

| Fichier | l. | Mode | Ce qui devient `--success` |
|---|---|---|---|
| `app/(super-admin)/super-admin/super-admins/page.tsx` | 363 | littéral | l'invitation acceptée |
| `components/kyc/KycUploader.tsx` | 190 | littéral | « document fourni » (TCK-385) |
| `components/admin/super/user-detail.tsx` | 126 | littéral | le compte |
| `components/admin/super/agency-detail.tsx` | 262 | littéral | l'agence |
| `components/admin/super/system-health.tsx` | 71 | littéral (ternaire) | `ok` |
| `components/admin/super/feature-flags.tsx` | 44 | littéral (ternaire) | `enabled` |
| `app/(super-admin)/super-admin/agency-upgrade-requests/page.tsx` | 70 | table | `approved` |
| `app/(super-admin)/super-admin/agency-upgrade-requests/[id]/page.tsx` | 301 | table imbriquée | `approved` |
| `app/(super-admin)/super-admin/users/page.tsx` | 67 | table | `active` |
| `components/admin/users/AdminUsersTable.tsx` | 42 | table | `active` |
| `components/admin/super/AgencyModerationCard.tsx` | 24 | table | `active` |
| `components/admin/super/kyc-queue.tsx` | 26 | table | `verified` |
| `components/kyc/kyc-components.tsx` | 264 | table | `verified` |
| `components/dashboard/admin/AgencyQueues.tsx` | 82 | table | `verified` |
| `components/admin/ModerationQueueList.tsx` | 26 | table | `approved` |
| `components/admin/super/SuperAdminPropertiesTable.tsx` | 42 | table | `available` |
| `components/billing/PayoutTable.tsx` | 41 | table | `paid` |
| `components/admin/super/announcements.tsx` | 41 | table | la sévérité `success` |
| `components/admin/super/announcements.tsx` | 74 | table | l'état `live` |
| `components/admin/AuditTrail.tsx` | 89 | fonction | l'événement `created` |

Le relevé se reprend, il ne se recopie pas :

```bash
# ⚠ Deux filtres, et il en faut DEUX. Le premier restreint aux fichiers qui connaissent le type ;
# le second ne retient que les FORMES qui résolvent un ton — pas la chaîne `'success'`, qui est
# aussi un ton de toast (`type: 'success'`), un membre de l'union homonyme de `PropertyKpiStrip`,
# un état de `useCompare` et une entrée du tableau `SEVERITIES`.
cd takussan-web
grep -rln "StatusTone\|StatusBadge" src --include="*.tsx" --include="*.ts" \
  | grep -v __tests__ \
  | xargs grep -nE "tone=\"success\"|tone[:=]\{[^}]*'success'|tone: 'success'|^[[:space:]]*[a-zA-Z_]+: 'success',|return 'success';" \
  | grep -vE "^[^:]+:[0-9]+: *\*" \
  | grep -vE "type: 'success'"
# → 20 lignes, 19 fichiers (mesuré le 2026-08-28). Les deux `grep -v` finaux ne sont pas du
# confort : sans le premier, le DOCBLOCK de `KycUploader` (qui cite `<StatusBadge tone="success">`
# pour l'expliquer) compte pour un site ; sans le second, huit toasts entrent.
```

⚠ **La version précédente de cette commande filtrait sur le FICHIER puis grepait la chaîne**, et
son commentaire promettait pourtant de filtrer sur le type. Rejouée, elle rendait **31 lignes dont
11 de bruit** — le bruit qu'elle nommait comme motif de sa propre correction était toujours là,
seulement confiné aux fichiers qui importent `StatusBadge`. *Un ticket dont la commande de relevé
est fausse produit un compte faux à chaque re-mesure* : c'est la commande qu'il fallait corriger,
pas le nombre.

## Contrat de données

Aucun. Ce ticket ne touche ni endpoint, ni modèle, ni forme de réponse.

## Direction UX / Artistique

Le statut positif doit se distinguer du badge *featured*. `--success` (`#3f6b45` en clair,
`#8fbf87` en sombre) est une teinte de la famille Lin, posée par TCK-381 avec ses contrastes
mesurés — ce n'est pas un vert Tailwind.

⚠ **Ce ticket sépare deux couleurs qui sont aujourd'hui la même.** Il faut regarder les deux côtés
avant de trancher : le sage `--accent` reste-t-il assez distinct du vert `--success` sur une même
page ? Un écran qui porte les deux existe — une fiche d'agence avec un badge de mise en avant et
un statut « active ».

## Contraintes strictes (métier)

- **La décision est une décision de CHARTE**, et elle se tranche explicitement, pas par effet de
  bord : *« un statut positif et une mise en avant ne partagent plus la même teinte »*. Elle
  s'écrit dans `docs/design-guidelines.md`, quelle qu'elle soit.
- **`StatusBadge` reste le seul endroit où la couleur d'un statut est décidée.** Aucun appelant ne
  gagne une exception ; si un appelant a besoin d'une couleur que le ton ne donne pas, c'est qu'il
  lui manque un TON, pas une classe.
- Le seuil applicable à la pastille est **4,5:1** (texte normal), pas 3:1 — c'est du texte, pas un
  objet graphique.
- Les quatre autres tons (`neutral`, `attention`, `danger`, `info`) ne bougent pas.

## Delta à produire

- [x] Trancher la décision de charte, et l'écrire dans `docs/design-guidelines.md` — y compris si
      la décision est de NE PAS séparer les deux teintes
- [x] Si séparation : `TONE_CLASSES.success` de `src/components/console/StatusBadge.tsx` passe de
      `bg-accent/15 text-accent` à `bg-success/15 text-success`
- [x] Vérifier que le docblock de `StatusBadge` ne conserve aucune affirmation invalidée par le
      changement (il explique aujourd'hui pourquoi `attention` a cessé d'emprunter `--primary` :
      le même récit vaut pour `success`)
- [x] Mesurer le contraste sur la surface RÉELLE de chaque famille d'appelant, pas seulement sur
      `--card` : la pastille se pose aussi sur `bg-muted/30` (téléverseur KYC) et dans des
      cellules de `DataTable`
- [x] Vérifier à l'écran, dans les DEUX thèmes (cf. AC4)

## Critères d'acceptation

- [x] **AC1** — `TONE_CLASSES.success` ne cite plus `accent`, et aucun autre ton ne change.
      L'assertion porte sur la table entière, pas sur la seule ligne modifiée : une substitution
      qui déplacerait un second ton passerait un contrôle ligne à ligne.
- [x] **AC2** — le contraste du ton `success` est **≥ 4,5:1 dans les deux thèmes**, mesuré sur la
      surface réelle (aplat à 15 % sur `--card` ET sur `bg-muted/30` aplati sur `--background`),
      et le chiffre est écrit dans le fichier avec sa date. Vérifié par calcul, jamais à l'œil.
- [x] **AC3** — les 21 sites du tableau ci-dessus rendent toujours un badge, et **aucun n'a gagné
      d'exception locale de couleur**. Le vérifier par relevé (`grep`), pas par lecture.
- [x] **AC4** — ⚠ **VÉRIFICATION À L'ÉCRAN, et c'est la raison d'être de ce ticket.** Au moins
      **trois** écrans capturés dans les **deux** thèmes : un qui porte plusieurs tons côte à côte
      (`/super-admin/kyc` ou `/super-admin/agency-upgrade-requests`), un qui porte le badge
      *featured* et un statut positif sur la même page (fiche d'agence), et un assistant
      d'onboarding (la pastille de TCK-385). *Un changement de couleur sur 21 badges validé par un
      ratio et aucune capture n'est pas une livraison* — c'est exactement pourquoi TCK-385 a sorti
      cette décision de son lot.
- [x] **AC5** — la décision de charte figure dans `docs/design-guidelines.md`, avec la mesure qui
      la motive, **quelle qu'elle soit** — y compris « on garde `--accent`, et voici pourquoi le
      contraste sous AA est accepté ».
- [x] **AC6** — ablation : rétablir `bg-accent/15 text-accent` fait rougir AC1 **et** AC2.
- [x] **AC7** — `npm run lint`, `npx tsc --noEmit` et les tests des répertoires touchés sont verts.

## Hors périmètre

- **Les quatre autres tons de `StatusBadge`.** `attention` a déjà cessé d'emprunter `--primary`
  (TCK-358) ; `neutral`, `danger` et `info` ne sont pas en cause.
- **`components/profile/ProfileBadge.tsx`**, qui rend `bg-chart-N/20 text-chart-N` sur cinq types
  de profil et dont huit couples (type × thème) sur dix sont sous 4,5:1. C'est un motif VOISIN —
  un aplat d'une couleur sous son propre texte — mais une autre table, d'autres jetons, et un
  ticket à part.
- **Le jeton `--success` lui-même**, dont les valeurs et les contrastes ont été posés et mesurés
  par TCK-381. Ce ticket le CONSOMME.
- **`components/announcements/GlobalAnnouncementBanner.tsx`**, et c'est l'exclusion qui mérite un
  ticket à elle seule. Il rend la MÊME donnée que l'entrée `success` de
  `admin/super/announcements.tsx` — `Announcement['severity']` — mais en palette Tailwind BRUTE :
  `border-emerald-300 bg-emerald-900 text-emerald-50`, trois familles pour une sévérité. Deux
  rendus d'un seul concept, dont un seul passe par `StatusBadge`. Il échappe de surcroît à
  `check-super-admin-tokens.mjs` parce qu'il est monté par `src/app/layout.tsx`, la racine de tout
  le site : c'est le trou T5 que la garde déclare (« la bannière de maintenance globale »
  échappe au compte). **Corriger `StatusBadge` sans lui laisserait la console en `--success` et
  la bannière publique en émeraude.** À traiter dans un ticket qui l'aura mesuré.
- Le vocabulaire des toasts (`toast.add({ type: 'success' })`), qui passe par `ui/toast.tsx` et
  porte déjà `--success` depuis TCK-384.

## AC4 — la vérification à l'écran, prise le 2026-08-29

`next dev` sur `127.0.0.1:3000`, API sur `:8002`, Chrome à 1440×900, sessions réelles (super-admin,
puis administrateur d'agence), jetons Sanctum émis pour la mesure puis **révoqués**. Les valeurs
ci-dessous sont lues par `getComputedStyle` sur les pastilles rendues — pas estimées à l'œil.

### Écran 1 — `/super-admin/properties` : QUATRE tons côte à côte

Le ticket proposait `/super-admin/kyc` ou `/super-admin/agency-upgrade-requests`. **Les deux sont
inexploitables sur ce jeu de données** : la file KYC est vide (« Rien à instruire ») et les demandes
d'upgrade ne portent qu'une seule pastille, en `attention`. `/super-admin/properties` en porte
**quinze, de quatre tons**, sur des données réelles : `success` ×10 (*Available*), `attention` ×2
(*Under Maintenance*), `neutral` ×2 (*rejected*), `info` ×1 (*Rented*). *Un écran choisi pour ce
qu'il devrait montrer vaut moins qu'un écran choisi pour ce qu'il montre.*

```
                clair                          sombre (forcé, cf. plus bas)
success   #3f6b45 sur success/10        #8fbf87 sur success/10
attention #8a5410 sur warning/12        #e0a458 sur warning/12
info      --secondary plein             --secondary plein
neutral   #6e655a sur --muted           #b8aa97 sur --muted
```

Les quatre se distinguent nettement les uns des autres **et** de la terracotta `--primary` du
chrome (barre latérale, onglet actif). Le vert `success` ne se confond avec rien à l'écran.

### Écran 2 — `/super-admin/agencies/1` : le statut positif en tête de fiche

`success` (*Vérifiée*, `#3f6b45` clair / `#8fbf87` sombre) et `neutral` (*À compléter*) dans le
même bandeau. Lisible dans les deux thèmes.

⚠ **La prémisse du ticket est fausse sur cet écran, et il fallait l'ouvrir pour le voir.** Il
annonçait « une fiche d'agence avec un badge de mise en avant et un statut *active* » : la fiche ne
porte **aucun** élément `bg-accent`/`text-accent` (`nbAccents = 0`, mesuré). Le sage y entre
seulement par le `<CheckCircle2 className="text-accent">` de `KycReviewPanel`
(`kyc-components.tsx:200`) — une **icône**, pas un badge, et qui ne s'affiche que pour une pièce
DÉJÀ déposée. Sur ce jeu de données les trois pièces manquent, donc les trois icônes sont les
`XCircle` rouges. **Le sage et le vert ne se sont donc jamais touchés à l'écran** ; quand ils le
feront ce sera une icône de 20 px contre une pastille de texte, ce qui est le cas le moins risqué
des deux qu'on redoutait.

### Écran 3 — `/admin/agency/kyc` (session administrateur d'agence)

Trois pastilles *Manquant* en `neutral` et la timeline en `neutral`. **La pastille `success` de
TCK-385 n'y est PAS observable, et ce n'est pas un défaut** : `KycUploader` ne rend son
`<StatusBadge tone="success">` que sur son état local `uploaded`, c'est-à-dire dans la seconde qui
suit un téléversement, et le composant lui-même vit dans les assistants d'onboarding — inaccessibles
à un compte déjà onboardé. Une pièce attachée en base pour la mesure n'a rien fait apparaître (elle
alimente la liste de `AgencyKycClient`, pas l'état local de l'uploader) ; elle a été **supprimée**.
Ce qui couvre ce cas est `KycUploader.pastille-tck-385.test.tsx`, qui monte le composant réel et lit
ses classes rendues — et dont l'ablation C (`bg-emerald-100 text-emerald-800`) rougit sur 8 cas.

### ⚠ Le « thème sombre » de cette application est une PORTÉE, pas une préférence

Mesuré, et ça change la lecture d'AC2 : **aucun sélecteur de thème n'existe**, et la classe `.dark`
n'est posée que sur deux surfaces — `SuperAdminTopbar.tsx:49` et `SuperAdminSidebar.tsx:224`, dont
le propre docblock dit « La classe `dark` n'est PAS le mode sombre de l'utilisateur : c'est une
surface sombre ». Relevé sur `/super-admin/properties` : **`pastillesSousDark = 0`** — les deux
portées sombres de la page ne contiennent aucune pastille.

Les colonnes « sombre » ci-dessus ont donc été prises en **posant `.dark` sur `<html>` à la main**.
Ce n'est pas une triche, c'est la seule forme possible : les treize ratios sombres d'AC2 sont une
**garantie pour le jour où** une portée sombre entourera une pastille, pas la description d'un écran
d'aujourd'hui. Écrit ici pour qu'on ne relise pas ce ticket comme une mesure de l'existant.

## Ce que l'AC4 a trouvé EN PLUS, et qui ne relève pas de ce ticket

**Un contrôle invisible sur `/super-admin/agencies/[id]`, contraste 1,00:1.** Le bouton
*Déverifier* rend `color: #fcf9f3` sur `background-color: #fcf9f3` — les deux mesurés identiques
au `getComputedStyle`. Il est illisible en thème clair, sur un écran de production.

Cause, remontée à la ligne : `agency-detail.tsx:300` pose `<section className="… bg-foreground …
text-background">`. Ce couple retourne **deux propriétés**, il ne retourne pas les jetons : tout
enfant qui tire son fond d'une variante continue de lire la palette CLAIRE. `variant="default"` et
`variant="destructive"` s'en sortent parce qu'ils posent leur propre `color` ; `variant="outline"`
prend `bg-background` de sa variante et **hérite** `text-background` de la section — d'où
`#fcf9f3` sur `#fcf9f3`. C'est exactement ce que `SuperAdminSidebar` évite en écrivant `dark`, qui
bascule les jetons pour tout le sous-arbre.

Ampleur mesurée : `bg-foreground` apparaît dans 33 fichiers, mais un seul est un CONTENEUR qui
impose `text-background` à des enfants — `agency-detail.tsx:300`. Les trois autres couples
(`Navbar.tsx:314` et `:369`, `ContractTypeChip.tsx:69`) sont des feuilles qui portent les deux
classes sur elles-mêmes. **Un site, un contrôle.** À traiter dans son propre ticket.

## Notes d'implémentation

_(à remplir par implementing-specs)_
