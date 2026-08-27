---
score: 22
max: 40
p0: 2
p1: 4
p2: 4
target: takussan-web/src/app/(dashboard)/admin
method: single-context (sub-agents disabled by session policy)
timestamp: 2026-08-26T18-40-00Z
slug: takussan-web-src-app-dashboard-admin
---
⚠️ DEGRADED: single-context (sous-agents interdits par consigne de session)

# Critique — console agence `/admin`

Cible : `src/app/(dashboard)/admin` + `src/components/admin` + `src/components/admin-agency` +
`src/components/admin-settings` + `src/components/dashboard/admin` + `src/components/layout/Admin*`
Périmètre mesuré : **63 fichiers `.tsx`** (hors tests), 12 routes, 13 entrées de menu.
**Aucune inspection navigateur** : docker arrêté, ni l'API ni le front ne répondent. Tout ce qui
suit est dérivé du code et de contrastes **calculés**, pas de captures.

> À ne pas confondre avec `/super-admin`, auditée le même jour
> ([rapport voisin](2026-08-26T12-48-11Z__takussan-web-src-app-super-admin.md)). Le layout
> super-admin le dit lui-même : *« le ticket parle de `/admin/*`, mais `/admin` appartient déjà
> au tableau de bord agency_admin »*.

## Le diagnostic est INVERSÉ par rapport à la console super-admin

| | `/super-admin` | `/admin` |
|---|---|---|
| Palette Tailwind brute | 231 | **72** |
| Vocabulaire `app-*` parallèle | 12 | **181** |
| Tableaux artisanaux | 11 | **5** |
| Qualité fonctionnelle | riche — 1 requête orpheline sur 90 | **4 fonctionnalités livrées côté API, sans écran** |

`/super-admin` est fonctionnellement complet et visuellement ingouverné. `/admin` est
**visuellement bien plus propre — et fonctionnellement troué.** Les tickets ne se recopient pas
d'une console à l'autre.

## Design Health Score — 22/40

| # | Heuristique | Score | Constat |
|---|---|---|---|
| 1 | Visibilité de l'état système | 2 | Trois rendus de chargement coexistent (`<Skeleton>` ×6, `animate-pulse` artisanal ×4, `Loader2` ×19) et trois rendus d'erreur (`ErrorState` ×5, `Card`+`text-destructive`, `div destructive/5`). **Aucun `loading.tsx` sous `/admin`** : les pages serveur attendent leur `fetch` sur un écran vide. |
| 2 | Correspondance avec le monde réel | 2 | Le journal d'audit affiche `Property #12` — le nom de classe et l'identifiant technique, sans lien. Les noms d'événement restent en anglais brut (`created`, `updated`, `deleted`) dans un produit fr/en/wo. |
| 3 | Contrôle et liberté | 2 | `/admin/team` et `/admin/finances` portent leur état dans l'URL ; les deux files de modération non — filtres en `useState`, perdus au rechargement, absents d'un lien partagé. Aucune pagination sur ces files : leur fin est inatteignable. |
| 4 | Cohérence et standards | 1 | **Le point le plus faible**, comme sur l'autre console. `PageHeader` existe : **3 pages sur 12** le montent, 9 recopient son balisage (12 occurrences), et **aucune** n'utilise son emplacement `actions`. Le statut « succès » s'écrit de **quatre** façons (`bg-emerald-100`, `bg-emerald-50…border`, `bg-emerald-500/10…border`, `bg-emerald-600`) — et la charte dit sage `#5d6e4f`. **Cinq** paginations dans le dépôt (3 composants existants + 2 réécrites inline). |
| 5 | Prévention de l'erreur | 3 | `ConfirmRemoveDialog` et `DeleteRoleDialog` sont bien posés. `CapabilityMatrix` grise les capacités réservées **avec leur motif** plutôt que de les masquer — décision juste, et documentée dans le code. |
| 6 | Reconnaissance plutôt que rappel | 3 | Les filtres sont de vrais `Select` (là où `/super-admin` demande de taper un ID d'agence à la main). Le journal d'audit offre date, action, type d'objet et recherche. |
| 7 | Flexibilité et efficacité | 2 | `AdminUsersTable` trie par colonne. Mais la recherche du journal d'audit n'a **aucun anti-rebond** : dix caractères = dix requêtes sur des pages de 50. Pas de sélection multiple. |
| 8 | Esthétique et sobriété | 2 | Le seul graphique de la console rend en `fill-emerald-500` / `sky` / `amber` / `rose` quand `--chart-1…5` existent en Lin, en clair **et** en sombre. |
| 9 | Aide au diagnostic d'erreur | 3 | `useMessageErreurApi` est employé largement et rend le message de l'API plutôt qu'un générique. |
| 10 | Aide et documentation | 2 | `/admin/settings/tags` redirige vers `/admin?notice=tags-platform-managed` et **rien ne lit `notice`** : l'utilisateur atterrit ailleurs sans explication. |

## P0 — deux défauts mesurés, pas estimés

**P0-1 · Les entrées de menu verrouillées sont sous le seuil de lisibilité.**
`AdminSidebar.tsx:104` compose `text-white/40` **et** `opacity-60` → alpha effectif 0,24 sur
`--app-topbar` (`#1f1812`). Rapport calculé : **2,18:1** contre 4,5:1 exigé. Le reste de la barre
est sain (inactif 9,04:1, actif 13,17:1) : le défaut porte précisément sur les lignes censées
donner envie de passer en `standard`. → TCK-371

**P0-2 · Sur mobile, `/admin/team` perd ses actions.**
`AdminUsersTable.tsx:122` enveloppe 7 colonnes — la dernière portant le menu d'actions de chaque
ligne — dans `overflow-hidden`. Pas `overflow-x-auto` : **`hidden`**. Coupé, sans défilement.
`OverduePaymentsTable.tsx:75` fait pareil sur 8 colonnes. → TCK-371

## P1 — l'API est payée, l'écran est absent

| Constat | Mesure | Ticket |
|---|---|---|
| Cycle de vie des invitations d'équipe | `GET /invitations`, `resend`, `revoke` existent et sont **déjà câblés dans `/app/owners` et `/app/maintenance/providers`** — jamais dans `/admin/team` | TCK-368 |
| Délégation temporaire de rôles | `RoleDelegationController` sert index/store/destroy depuis TCK-108 ; `grep -rl "role-delegations" src` → **aucun résultat** | TCK-369 |
| Intégrations inatteignables | `/admin/settings/integrations` n'est dans aucun menu ; son seul chemin est l'onglet de `/admin/settings`, réservé au super-admin, dont l'onglet « Général » éjecte un `agency_admin` | TCK-370 |
| Files de modération sans pagination | la requête ne porte pas de `page` | TCK-376 |

Deux gestes plus discrets, même forme : `regenerate-watermarks` sans bouton, et
`defaultCommissionRate` accepté par `AdminFinancesTabs` mais jamais passé par
`AdminFinancesClient` — le curseur de reversement démarre toujours au défaut. → TCK-370

## P2 — deux tickets `done` dont le problème est intact

**TCK-244** *(« Dashboard /app + /admin — migration tokens legacy → DS Lin », vague 27)*.
Ses critères rejoués **verbatim** le 2026-08-26 :

```
$ grep -RE "text-app-ink|bg-app-surface|text-app-accent|border-app-surface" 'src/app/(dashboard)'
7          ← AC1 exigeait « aucun résultat ». Elle échoue dans son propre périmètre.
$ grep -RnE "(fill|bg)-(emerald|sky|red|blue|rose|amber)-[0-9]+" src/components/charts
6          ← AC2 cherchait `stroke-`. La palette hors charte a survécu à un préfixe près.
```

Trois échappatoires, toutes structurelles : **le périmètre** (le grep vise
`src/app/(dashboard)` — les enveloppes serveur ; le vocabulaire vit dans les composants, **1049
occurrences**, dont **183 sur `/admin`**, pour 15 dans le répertoire audité) ; **le préfixe** ;
et **le « ou »** d'AC3 (« `PageHeader` *ou* `font-display` » — c'est la branche de droite qui a
été prise). *Un grep qui ne suit pas les imports mesure le répertoire, pas l'écran.* → TCK-372

**TCK-108** *(délégation temporaire)*. Son Delta listait quatre lignes de front — page,
composants, hooks, i18n `role_delegations.*`. Aucune n'existe. Ses dix AC portent toutes sur le
modèle, le job et les policies : **aucune ne mentionne un écran**, donc le ticket pouvait être
coché entier sans front. *Un critère d'acceptation qu'une livraison incomplète coche aussi
n'accepte rien.* → TCK-369

## Le doublon de tokens, à la source

`--app-bg`, `--app-ink`, `--app-ink-muted`, `--app-surface-1/2/3`, `--app-accent` sont définis
dans `globals.css` avec **exactement** les valeurs de `--background`, `--foreground`,
`--muted-foreground`, `--card`, `--muted`, `--border`, `--primary` — et n'apparaissent **dans
aucune** table de `docs/design-guidelines.md`. Deux mots pour une couleur, c'est deux endroits où
la changer, et un seul qui sera trouvé.

Divergence silencieuse en prime : le bloc `.dark` redéfinit `--background`, `--card`, `--sidebar`
et leurs voisins, **et pas un seul `--app-*`**. Le mode sombre n'est atteignable nulle part
aujourd'hui (aucun `ThemeProvider`, aucun `prefers-color-scheme`, 0 `dark:` dans `/admin` sur les
73 du produit) : **c'est une dette latente, pas un défaut vivant** — mais elle se réveillera sur
le shell entier de `/admin`, qui est bâti dessus. → TCK-372

## Hors périmètre, faute de spec

L'entrée de menu **« Biens »** du super-admin est
`export { default } from '../../app/properties/page'` — la page agent re-exportée, sans cadrage
administrateur. Corriger ou supprimer l'entrée demande de savoir ce qu'un admin doit y voir, et
`docs/features.md` ne le dit nulle part : **PR sur la spec avant tout ticket.**

## Faux positifs écartés

- Contraste des badges de statut : les quatre recettes emerald/amber/red/blue passent toutes
  4,5:1 (4,52 à 6,99). Le défaut est la **divergence**, pas la lisibilité.
- Barre latérale : 9,04:1 et 13,17:1. Seules les entrées verrouillées échouent.
- `AdminSidebar` sonde deux compteurs toutes les 60 s avec `staleTime` — mesuré, ce n'est pas
  un sur-appel.

## Tickets issus de cet audit — vague 47

TCK-368 · TCK-369 · TCK-370 · TCK-371 · TCK-372 · TCK-373 · TCK-374 · TCK-375 · TCK-376
