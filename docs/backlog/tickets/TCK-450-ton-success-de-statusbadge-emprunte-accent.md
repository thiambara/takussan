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

- [ ] Trancher la décision de charte, et l'écrire dans `docs/design-guidelines.md` — y compris si
      la décision est de NE PAS séparer les deux teintes
- [ ] Si séparation : `TONE_CLASSES.success` de `src/components/console/StatusBadge.tsx` passe de
      `bg-accent/15 text-accent` à `bg-success/15 text-success`
- [ ] Vérifier que le docblock de `StatusBadge` ne conserve aucune affirmation invalidée par le
      changement (il explique aujourd'hui pourquoi `attention` a cessé d'emprunter `--primary` :
      le même récit vaut pour `success`)
- [ ] Mesurer le contraste sur la surface RÉELLE de chaque famille d'appelant, pas seulement sur
      `--card` : la pastille se pose aussi sur `bg-muted/30` (téléverseur KYC) et dans des
      cellules de `DataTable`
- [ ] Vérifier à l'écran, dans les DEUX thèmes (cf. AC4)

## Critères d'acceptation

- [ ] **AC1** — `TONE_CLASSES.success` ne cite plus `accent`, et aucun autre ton ne change.
      L'assertion porte sur la table entière, pas sur la seule ligne modifiée : une substitution
      qui déplacerait un second ton passerait un contrôle ligne à ligne.
- [ ] **AC2** — le contraste du ton `success` est **≥ 4,5:1 dans les deux thèmes**, mesuré sur la
      surface réelle (aplat à 15 % sur `--card` ET sur `bg-muted/30` aplati sur `--background`),
      et le chiffre est écrit dans le fichier avec sa date. Vérifié par calcul, jamais à l'œil.
- [ ] **AC3** — les 21 sites du tableau ci-dessus rendent toujours un badge, et **aucun n'a gagné
      d'exception locale de couleur**. Le vérifier par relevé (`grep`), pas par lecture.
- [ ] **AC4** — ⚠ **VÉRIFICATION À L'ÉCRAN, et c'est la raison d'être de ce ticket.** Au moins
      **trois** écrans capturés dans les **deux** thèmes : un qui porte plusieurs tons côte à côte
      (`/super-admin/kyc` ou `/super-admin/agency-upgrade-requests`), un qui porte le badge
      *featured* et un statut positif sur la même page (fiche d'agence), et un assistant
      d'onboarding (la pastille de TCK-385). *Un changement de couleur sur 21 badges validé par un
      ratio et aucune capture n'est pas une livraison* — c'est exactement pourquoi TCK-385 a sorti
      cette décision de son lot.
- [ ] **AC5** — la décision de charte figure dans `docs/design-guidelines.md`, avec la mesure qui
      la motive, **quelle qu'elle soit** — y compris « on garde `--accent`, et voici pourquoi le
      contraste sous AA est accepté ».
- [ ] **AC6** — ablation : rétablir `bg-accent/15 text-accent` fait rougir AC1 **et** AC2.
- [ ] **AC7** — `npm run lint`, `npx tsc --noEmit` et les tests des répertoires touchés sont verts.

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

## Notes d'implémentation

_(à remplir par implementing-specs)_
