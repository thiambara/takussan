# Revue design — d-app-catalogue (2026-09-16)

**Verdict : corrigé** — 6 HIGH et 21 MEDIUM corrigés sur 16 écrans ; aucun débordement de document à 360, 390, 768, 1024 ni 1366, avant comme après. 5 besoins hors périmètre consignés en Collisions.

## Pages

### /app (accueil) — agent, owner, tenant, provider, no_profile, agency_admin
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ — pour les six rôles. Aucune erreur console.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/dashboard/DashboardEmpty.tsx` | état vide local (`rounded-2xl p-12`), phrase en `text-xs` (12 px), icône sans `aria-hidden` | passe par `<EmptyState>` partagé (h2 display, description 14 px `text-pretty`, icône `aria-hidden`) | guidelines « un seul composant rend les états vides » ; corps ≥ 14 px (provider, no_profile) |
| MEDIUM | `components/dashboard/DashboardShortcuts.tsx:103` | `transition hover:bg-muted`, aucun focus visible | `transition-[background-color,scale] duration-150 ease-out`, `focus-visible:ring-3 ring-ring/50`, `active:scale-[0.96]`, icône `shrink-0`, libellé `min-w-0 text-pretty` | lien sans indicateur de focus clavier ; pression tactile ; pas de `transition` générique |
| LOW | `components/dashboard/DashboardMeKpis.tsx:36` | chiffres proportionnels | `tabular-nums` posé sur la grille (hérité par la valeur de `charts/StatCard`) | KPI de tableau de bord — sans toucher `charts/` (groupe A) |
Contre-relevé : voir § Vérification.

### /app/properties — agent, owner
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ (table défilante dans son conteneur) · 1024 ✓ · 1366 ✓. `lt24` : cases à cocher 16 px (natives, cf. Écartés).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/property-dashboard/PropertyList.tsx` (carte mobile) | « Modifier ⋯ » en `absolute right-2 top-2` **recouvrait le titre** à 360-390 (capture : « Studio économique à Oudkr.. Modifi.. ») | actions en pied de carte, dans le flux (`mt-auto pt-2`), carte en `flex-col` | commande et titre illisibles sur mobile |
| HIGH | `components/property-dashboard/PropertyRowActions.tsx` | messages de retour `hidden md:inline` → **aucun retour d'erreur/succès sous md** | prop `layout="card"` : messages visibles, sur leur propre ligne (`order-last w-full`) | une action rapide échouée ne disait rien sur mobile |
| MEDIUM | `PropertyList.tsx` table | table dès `md` (464 px utiles) : prix cassé « 2 210 000 F / CFA », table défilant de côté | table dès `lg`, cartes en dessous (TCK-505) ; prix `whitespace-nowrap` (table et carte) ; activité `tabular-nums` | `md` n'est pas bureau dans la coque |
| MEDIUM | `PropertyListFilters.tsx` | Select de tri et selects avancés **sans nom accessible** (`<label>` non associé) | `aria-label` sur chaque `SelectTrigger` | a11y |
| MEDIUM | `PropertyListFilters.tsx` | hauteurs mêlées : champ 32, bascules 36, « Filtres avancés » 28 px | bascules `h-8`, bouton taille par défaut (32) ; recherche pleine largeur sous `sm` | rangée de contrôles alignée |
| LOW | `PropertyListFilters.tsx` puces / « Tout effacer » / bascules | aucun focus visible | `focus-visible:ring-3` (`has-focus-visible` pour la bascule), `transition-colors` | clavier |
| LOW | `PropertyKpiStrip.tsx` | tuile active signalée par le seul anneau ; pas de focus visible ; `hover:bg-success/10` = état de repos | `aria-current`, `focus-visible:ring-3`, `hover:bg-success/15` (fond seul, texte non teinté) | état non visuel + survol inerte |
Contre-relevé : voir § Vérification.

### /app/properties/47 — agent (bien de Dakar Immo), onglets Aperçu / Édition / Médias / Historique
Relevé avant : 360-1366 ✓ (docOverflow 0) sur les quatre onglets.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/property-dashboard/PropertyHeaderActions.tsx:200-231` | `DropdownMenuItem onSelect={…}` ×6 — **aucune action du menu d'en-tête ne s'exécutait** (base-ui n'a pas de `onSelect` ; la prop tombait sur l'événement DOM `select`). Mesuré : « Supprimer » n'ouvre pas le dialogue ; même séquence sur le menu de ligne (`onClick`) → dialogue ouvert | `onClick` | commande inatteignable (publier, dépublier, dupliquer, changer le statut, archiver, supprimer) |
| HIGH | `app/(dashboard)/app/properties/[id]/page.tsx:84-96` | « **Rented** » et « Studio · **For Rent** · Dakar » en anglais sous l'interface FR (`status_label`, `type_label`, `contract_type_label` de l'API) | codes traduits côté front (`enumLabel` + `PROPERTY_ENUM_NAMESPACES`), repli sur le libellé API si code absent | principe n° 5 : le front possède le texte |
| MEDIUM | `PropertyOverviewPanel.tsx` + `PropertyDetailTabs.tsx` (historique des prix) | date ISO brute `2026-09-02`, raison en code `market_adjustment`, liste recopiée deux fois | `PropertyPriceHistoryList` partagé : `formatDate(locale)`, raison traduite (`property.priceChangeReasons.*`, 6 clés ×3 langues), montants `whitespace-nowrap tabular-nums`, flèche Lucide | le front possède le texte ; duplication |
| MEDIUM | `PropertyForm.tsx` barre d'enregistrement | la bulle de messagerie recouvrait « Enregistrer les modifications » (390 et 1366) | la barre revendique un slot `bottom-full` du dock (73 / 105 px), rembourrage bas `calc(1rem + env(safe-area-inset-bottom))` | CTA principal masqué |
| MEDIUM | `components/media/MediaManager.tsx` tuile photo | « Couverture » / « Supprimer » révélés au **seul survol** | visibles par défaut, masqués-au-survol seulement sous `pointer-fine` ; boutons 32 px | introuvables au doigt |
| MEDIUM | `MediaManager.tsx` ligne de progression | `w-40` + `w-20` fixes (240 px) dans une carte de ~232 px à 360 | nom `min-w-0 flex-1`, taille `tabular-nums`, barre sur sa ligne sous `sm` | débordement (non mesurable sans téléverser = écrire) |
| MEDIUM | `PropertyMediaPanel.tsx` chargement | texte « Chargement… » puis saut de 60 px | squelette à la forme du gestionnaire (`aria-busy`, libellé `sr-only`) | guidelines : chargement = `Skeleton` |
| LOW | `MediaManager.tsx` zones de dépôt | input `sr-only` sans focus visible | `has-focus-visible:ring-3 border-primary` ; pastille couverture `text-primary-foreground` | clavier ; jeton sémantique |
| LOW | `PropertyOverviewPanel.tsx` | glyphes « ✓ » / « ○ » dans la checklist ; tuiles `p-6` empilées à 360 | `CheckCircle2` / `Circle` Lucide ; tuiles `p-4 sm:p-6`, `tabular-nums` ; coordonnées `tabular-nums` | pas de glyphe à la place d'une icône |
| LOW | `PropertyHeaderActions.tsx` | à 768, « ⋯ » passait seul sur une seconde ligne | bouton document + menu groupés (`shrink-0`) | action et prolongement séparés |
Contre-relevé : voir § Vérification.

### /app/properties/new — agent (parcours, étape 1, sans envoi)
Relevé avant : 360-1366 ✓ (docOverflow 0). `smallText` : libellés de groupe 11 px en capitales (autorisé par les guidelines).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `wizard/steps/StepBien.tsx` + `wizard/ChoiceChips.tsx` | 16 **emojis** comme icônes de type (rendu différent par OS, couleurs hors palette, ne suivent pas l'état actif) | icônes Lucide (`LandPlot`, `House`, `Building2`…) en `currentColor` ; `icon` devient `ReactNode` (les emojis d'étiquettes servis par l'API restent acceptés) | guidelines « Lucide React uniquement » |
| MEDIUM | `wizard/WizardShell.tsx` pied | bulle de messagerie posée sur « Continuer » en mobile | slot `bottom-full` du dock (73 px) + zone sûre | CTA masqué |
| LOW | `ChoiceChips.tsx` | `active:scale-[0.95]` et `transition-[…transform]` (Tailwind 4 écrit `scale`, non transitionné) | `active:scale-[0.96]`, `transition-[…,scale] ease-out` | presse tactile |
| LOW | `WizardShell.tsx` | « ✓ » texte dans le rail ; « Quel bien publiez-vous / ? » (orphelin) ; titre/sous-titre sans habillage | `Check` Lucide ; libellés `text-pretty` ; h2 `text-balance`, sous-titre `text-pretty` ; « Étape 1 sur 6 » `tabular-nums` | typographie |
Contre-relevé : voir § Vérification.

### /app/overview (+ agency, agent, owner, tenant, alerts, exports, kpis)
Relevé avant : 360-1366 ✓ (docOverflow 0) pour agency_admin (agency, alerts, exports, kpis), agent, owner, tenant. `/app/overview` en provider redirige vers `/app` (sensé : aucun tableau de pilotage pour ce profil) ; une erreur d'hydratation passagère à 768 sur cette redirection, non reproduite (cf. Écartés).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `overview/kpis/KpiConfigList.tsx` | codes bruts à l'écran (`occupancy_rate`, `number`) ; champs nus sans `Label`/`Input` ; bouton maison ; état vide en phrase seule | métriques et formats traduits (`dashboard.kpis.metrics.*` ×14, `formats.*` ×3, 3 langues) ; `Label` + `Input` + `Button` ; formulaire `grid lg:grid-cols-[1fr_1fr_12rem_auto]` ; `EmptyState` ; suppression = bouton fantôme avec `aria-label` nominatif (`deleteAria`) ; erreur `role=alert` | le front possède le texte ; a11y ; primitives du DS |
| HIGH | `overview/alerts/AlertList.tsx` | codes d'opérateur / de sévérité / de métrique affichés bruts, sévérité sans couleur de sens ; champs nus | libellés traduits (`severities.*`, `operators.*`, métriques partagées avec les KPI) ; sévérité en `StatusBadge` (info→info, warning→attention, critical→danger) ; symbole ≥/≤ ; formulaire `sm:grid-cols-2 lg:grid-cols-3` en `Label`/`Input` ; délai avec aide reliée par `aria-describedby` (`cooldownHint`) ; `EmptyState` ; suppression nominative | idem |
| MEDIUM | `overview/exports/ExportForm.tsx` | libellés d'entité / de format codés en dur en français ; notice « complète » qui citait le locataire alors que la page ne lui est pas ouverte | `entities.*` / `formats.*` traduits ; `Button` avec icône `Download` / `Loader2` ; notice `scopeNotice` `text-pretty` | le front possède le texte ; notice fausse pour ce public |
| MEDIUM | `overview/owner/page.tsx` | dates ISO brutes (période, reversements) ; taux d'occupation `87.5%` ; « Aucun reversement retourné par l'API » | `formatDate(…)` ; `formatPercent(rate/100)` ; copie « Aucun reversement programmé pour l'instant. » (3 langues) ; CTA vide en `buttonVariants` ; lignes-liens `min-h-11` avec focus visible ; `tabular-nums` | jargon technique à l'utilisateur ; dates lisibles ; cible tactile |
| MEDIUM | `overview/agency/page.tsx` | période en ISO ; taux à 6 décimales | `formatDate` ; `formatNumber(…, {maximumFractionDigits: 2})` ; grilles `tabular-nums` | lisibilité des chiffres |
| MEDIUM | `overview/agent/page.tsx` | titres de tâche longs poussant le badge de priorité hors carte ; liens sans focus visible | tâche `min-w-0` + `text-pretty`, badge `shrink-0 whitespace-nowrap` ; `focus-visible:ring-3` sur clients / visites / métriques ; `MetricLink` `min-h-11` ; chiffres `tabular-nums` | débordement ; clavier ; cible tactile |
| LOW | owner / agency / agent | titres h2 mêlés, listes serrées | h2 `text-base`, `space-y-2`, fonds `bg-muted/60` | rythme |
Contre-relevé : voir § Vérification.

### /app/favorites — agent, tenant · /app/saved-searches — agent, tenant
Relevé avant : 360-1366 ✓ (docOverflow 0), aucune erreur. Les deux pages ne portent qu'un `PageHeader` et délèguent à `components/favorites/*` (hors périmètre : aucun groupe ne le liste — cf. Collisions). États vides (tenant, saved-searches) propres : icône, titre, description, CTA.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| — | `app/(dashboard)/app/favorites/page.tsx`, `saved-searches/page.tsx` | — | aucun changement | rien à corriger dans le périmètre ; les textes 11 px relevés (« En location », « il y a 3 mois ») sont ceux des cartes publiques (groupe B) |

### /app/owners — agent
Relevé avant : 360-1366 ✓ (docOverflow 0) ; table défilante dans son conteneur sous `lg`. `LT24` = champ de recherche de la barre du haut (groupe A).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/owners/OwnersList.tsx:43,134` | statut en `Badge` : « Actif » en **terracotta primaire** (la couleur de l'action), brouillon/inactif indistincts | `StatusBadge` + table de SENS `STATUS_TONE` (active→success, draft→attention, inactive→neutral, blocked→danger), `whitespace-nowrap` | la couleur d'un statut se décide à un seul endroit (TCK-472) ; « actif » n'est pas un appel à l'action |
| MEDIUM | `OwnersList.tsx:137` | en-tête « ACTIONS » visible au-dessus d'une colonne vide (seul un brouillon porte des actions ; l'agent n'en voit aucune) | `headerSrOnly` — la colonne reste (ordre gardé par le test TCK-380), l'en-tête va aux lecteurs d'écran | en-tête orphelin |
| LOW | `OwnersList.tsx:182` | état vide local (`border-dashed p-10`) | `EmptyState` partagé, icône `UserRound`, description `text-pretty` | un seul composant d'état vide |
Contre-relevé : voir § Vérification.

### /app/settings/agency/upgrade — agency_admin (l'agent est redirigé vers `/app`, attendu : page réservée à l'admin d'agence)
Relevé avant : 360-1366 ✓ (docOverflow 0). L'agence de démo est déjà `standard` : seul le panneau de confirmation est mesurable ; le formulaire et le panneau de statut ne le sont pas sans écrire en base (**non mesuré**).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `settings/agency/upgrade/page.tsx` | `<main>` **imbriqué** dans le `<main>` d'`AppShell` ; `mx-auto max-w-3xl p-6` : titre décalé de 171 px à 1366 par rapport à toutes les autres pages, 48 px de rembourrage en plus à 360 | `<div className="max-w-3xl">` + `PageHeader` (sur-titre, titre, description `text-pretty`) | un seul repère principal ; alignement de la coque |
| MEDIUM | `components/agency/UpgradeRequestStatus.tsx:90` | badge de statut maison (`uppercase tracking-wider`, même gris pour « en attente », « acceptée », « refusée ») | `StatusBadge` + `STATUS_TONE` (pending→attention, approved→success, rejected→danger, revoked→neutral) ; h2 `text-lg text-balance`, carte `p-4 sm:p-6` | statut sans couleur de sens ; décideur unique |
| MEDIUM | `components/agency/UpgradeRequestForm.tsx` | messages d'erreur de champ non reliés à leur champ | `id` + `aria-describedby` sur les 7 champs ; carte `p-4 sm:p-6` | a11y (lecteur d'écran) |
| LOW | `upgrade/page.tsx` avantages | puces « • » tapées dans le texte ; ligne SLA en capitales espacées 12 px | icône `Check` (success) `aria-hidden` ; SLA en casse normale `text-pretty` | pas de glyphe à la place d'une icône ; une phrase ne se met pas en capitales |
Contre-relevé : voir § Vérification.

### Collision entrante (signalée par F) — `components/property-dashboard/PropertyPagination.tsx`
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `PropertyPagination.tsx` | « Page 1 sur 1 », Précédent/Suivant grisés et sélecteur de densité sous une table de 5 lignes (/app/payments, locataire) | rien n'est rendu quand `last_page <= 1` **et** `total <= 10` (la plus petite densité) ; au-delà de 10 lignes le résumé reste, car réduire la densité ouvre alors une seconde page | la proposition « `last_page <= 1` seul » contredisait un test délibéré (le sélecteur de densité doit rester atteignable sur une page unique) ; test mis à jour : 15 lignes → résumé présent, 5 lignes → rien |
Tests : `src/components/property-dashboard` (5 fichiers, 17 tests) + appelants `payments`, `documents`, `customers`, `primitives-elargies-tck-380` (8 fichiers, 36 tests) → verts.


## Collisions (hors périmètre — NON appliquées)
| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `components/charts/StatCard.tsx` (valeur) — groupe A | valeur en chiffres proportionnels, `text-2xl` fixe, sans protection de coupure | `tabular-nums` ; `text-xl sm:text-2xl` ; `break-words` (ou `min-w-0` sur le conteneur) | « 132 693 386 F CFA » dans une tuile `grid-cols-2` à 360 frôle le débordement ; les chiffres ne s'alignent pas d'une tuile à l'autre (atténué ici en posant `tabular-nums` sur les grilles parentes, qui en héritent) | /app (agent, agency_admin), /app/overview/* |
| `components/charts/LineChart.tsx` (axe Y) — groupe A | étiquettes rognées à gauche (« ¦00 342 ») à 1366 ; graduations non arrondies | marge gauche calculée sur la plus longue étiquette ; graduations « jolies » (1-2-5 ×10ⁿ) formatées compactes | valeur illisible | /app/overview/agency, /app/overview/owner |
| `components/console/PageHeader.tsx` (bloc `actions`) — groupe A | `flex flex-wrap` sans `shrink-0` : à 768 un groupe d'actions se casse, « ⋯ » passe seul à la ligne | `shrink-0` sur le conteneur d'actions, ou `flex-nowrap` par groupe | action et prolongement séparés — atténué ici en groupant bouton + menu dans `PropertyHeaderActions` | /app/properties/47 |
| `components/chat/*` (bulle de messagerie) — groupe E (ou A) | la bulle `fixed` couvrait les barres d'action collantes | — (atténué ici : `PropertyForm` et `WizardShell` réclament un slot `bottom-full` du dock ; contre-relevé : bulle top 664 au-dessus de la barre top 747 à 390) | tout autre écran à barre collante hors de mon périmètre reste exposé | /app/properties/47?tab=edit, /app/properties/new |
| `components/favorites/*` (hors de tout groupe listé) et cartes `components/property/cards/*` (groupe B) | libellés 11 px (« En location », « il y a 3 mois ») sur les cartes de favoris | ≥ 12 px | corps de carte sous le plancher de lisibilité | /app/favorites |

## Écartés
| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| `PropertyList.tsx` cases à cocher | cibles natives 16 px (`LT24`) | la ligne entière est cliquable autour ; élargir la case change le rythme de la table — hors raffinement |
| `MediaManager.tsx` | `h3` sans `h2` parent dans le panneau autonome | le `h2` est porté par `PropertyMediaPanel` ; le composant est aussi monté ailleurs |
| étiquettes de bien (API) | emojis servis comme icônes d'étiquette | donnée, pas code : `ChoiceChips` les accepte toujours (`icon: ReactNode`) |
| `WizardShell.tsx` | libellés de groupe 11 px en capitales | autorisés par `docs/design-guidelines.md` (sur-titres) |
| `/app/overview/*` | tuiles en 2 colonnes à 360 | les montants F CFA ne tiennent pas dans une demi-largeur (cf. collision StatCard) |
| `PropertyForm.tsx` | copie `createError` | juste et traduite ; la changer n'apporte rien |
| `/app/settings/agency/upgrade` (déjà standard) | lien de sortie vers la gestion d'équipe | aucune route d'équipe sûre dans mon périmètre ; demanderait une clé et une décision produit |
| `UpgradeRequestStatus.tsx` | `useMemo` manuel, `formatDate` local en `fr-FR` | fonctionne ; hors raffinement visuel |
| `/app/overview` provider à 768 | erreur d'hydratation une fois, pendant la redirection vers `/app` | non reproduite au relevé suivant ; d'autres agents éditaient le socle au même moment |
| `/app/settings/agency/upgrade` en agent | redirection vers `/app` | voulue (`layout.tsx` : réservé à l'admin d'agence) |
| **Non mesuré** | ligne de progression de téléversement ; barre d'actions groupées ; formulaire et panneau de statut d'upgrade | exigerait d'écrire en base (téléverser, sélectionner puis agir, créer une demande) |

## Vérification
**Contre-relevé** (une passe, `$S/shots/d/apres/<page>/`, 5 largeurs, captures 390/768/1366) — `docOverflow` 0 partout ; la nouvelle version est prouvée par le DOM (`preuve.js`) :
| Page | Preuve DOM relevée |
|---|---|
| /app agent, provider | 5-6 liens `active:scale-[0.96]` (raccourcis) ; `tabular-nums` présents ; 1 seul `<main>` |
| /app/properties agent, owner | `aria-current="true"` ×1 (tuile active) ; liste de cartes `lg:hidden` ×1 et table `hidden lg:block` ; `StatusBadge` `data-tone` info/success |
| /app/properties/47 | capture 1366 : « Loué », « Studio · Location · Dakar », « 2 sept. 2026 », « Négociation », « Ajustement au marché », icônes de checklist ; `tabular-nums` ×10 |
| /app/properties/47?tab=edit | barre `padding-bottom: calc(1rem + env(safe-area-inset-bottom))` ; à 390 la bulle (top 664) est **au-dessus** de la barre (top 747) |
| /app/properties/new | 16 `svg` Lucide dans les puces de type ; pied `padding-bottom` du dock ; bulle top 696 > pied top 751 |
| /app/overview/kpis · alerts | `#kpi-metric` ×1, `#alert-metric` ×1 ; capture 390 : « Biens (total) », « Nombre », état vide partagé |
| /app/overview/agency · agent · owner · tenant | `tabular-nums` ×11 / ×21 / ×14 / ×5 |
| /app/owners | `data-tone` = success ×6 (« Actif » en vert sourd) ; en-tête « Actions » retiré de l'écran (capture 1366) |
| /app/settings/agency/upgrade (agency_admin) | `main` ×1 (était 2) ; titre aligné à x = 280 comme les autres pages (capture 1366) |
| onglet Médias | `pointer-fine:*` ×0 — le bien 47 n'a aucune photo : la tuile n'est pas rendue (**non mesuré au navigateur**, couvert par le code) |

**Relevé refait sur `http://localhost:3000`** (banc corrigé pour le CORS ; `$S/shots/d/local/`) sur toutes les pages à données client : /app (agent, owner, tenant), /app/properties (agent, owner), /app/properties/47 (aperçu, médias), /app/favorites et /app/saved-searches (agent, tenant), /app/owners, /app/overview/{kpis,alerts,exports}, /app/properties/new. Résultat aux 5 largeurs : `origin` = localhost:3000, `docOverflow` 0, **aucun ErrorState** (aucun `role=alert`, aucun texte « Impossible… / Erreur… » dans `<main>`), aucune erreur console. Les données client se chargent : favoris agent (2 cartes), 206 biens, 11 propriétaires. Les états vides relevés (favoris du locataire, recherches sauvegardées, KPI, alertes) sont de **vrais** états vides et non des erreurs masquées. Les constats des relevés précédents restent donc valables.

**Commandes**
- `npx vitest run src/components/property-form src/components/property-dashboard src/components/dashboard/__tests__ src/components/media src/components/floating-dock src/components/agency src/components/owners src/components/console/__tests__/colonnes-des-tables-converties-tck-380.test.tsx "src/app/(dashboard)/app/properties" "src/app/(dashboard)/app/overview" "src/app/(dashboard)/app/__tests__"` → **35 fichiers, 364 tests, verts**. Le test TCK-380 (groupe A) garde l'ordre des colonnes d'`OwnersList` : vert avec la colonne d'actions conservée.
- Nouveau test `components/property-dashboard/__tests__/PropertyHeaderActions.test.tsx` → vert ; **ablation** (`onSelect` remis sur « Supprimer ») → rouge ; fichier restauré (`grep -c "onSelect="` → 0).
- `npx eslint <29 fichiers>` → **0 erreur**, 5 avertissements tous antérieurs (imports `useEffect`/`useState` inutilisés et dépendance `useCallback` dans `PropertyDetailTabs.tsx` et `PropertyList.tsx`, `<img>` dans `MediaManager.tsx` — présents dans `HEAD`).
- `npx tsc --noEmit` → 4 erreurs, **toutes hors périmètre** : `src/components/admin/roles/CapabilityMatrix.tsx:107-112` (`Button` non importé — groupe G).
- Gardes : `check-app-tokens` ✓ · `check-public-chrome-tokens` ✓ · `check-feedback-states` ✓ · `check-destructive-contrast` ✓ · `check-classes-emises` ✓ · `check-status-badge-unique` ✗ **hors périmètre** (`components/announcements/GlobalAnnouncementBanner.tsx:14,15`, table de tons en dur) · `check-super-admin-tokens` ✗ **hors périmètre** (cliquet « assistants d'onboarding » 24 → 0 à redescendre — groupe C).
- Détecteur impeccable sur les 29 fichiers → **0 constat**.
- `check-i18n` (lecture) → 4 écarts, aucun sur mes fichiers (`PropertyLocationMapInner`, `OverduePaymentsTable`, `SuperAdminPropertiesTable`). Si le cliquet par fichier voit baisser `KpiConfigList`, `AlertList` ou `ExportForm` (textes en dur retirés), la session principale lance `npm run check:i18n -- --update`.
- i18n : 44 clés ajoutées et 2 corrigées (`dashboard.owner.noPayouts`, `dashboard.alerts.cooldown`), toutes par `i18n-set.mjs` en fr/en/wo.

**Fichiers modifiés (31)** : `app/(dashboard)/app/overview/{agency,agent,owner}/page.tsx`, `overview/alerts/AlertList.tsx`, `overview/exports/ExportForm.tsx`, `overview/kpis/KpiConfigList.tsx`, `properties/[id]/page.tsx`, `settings/agency/upgrade/page.tsx` ; `components/agency/{UpgradeRequestForm,UpgradeRequestStatus}.tsx` ; `components/dashboard/{DashboardEmpty,DashboardMeKpis,DashboardShortcuts}.tsx` ; `components/media/MediaManager.tsx` ; `components/owners/OwnersList.tsx` ; `components/property-dashboard/{PropertyPagination,__tests__/PropertyPagination.test,PropertyDetailTabs,PropertyHeaderActions,PropertyKpiStrip,PropertyList,PropertyListFilters,PropertyMediaPanel,PropertyOverviewPanel,PropertyRowActions}.tsx` + **neufs** `PropertyPriceHistoryList.tsx`, `__tests__/PropertyHeaderActions.test.tsx` ; `components/property-form/PropertyForm.tsx`, `wizard/{ChoiceChips,WizardShell}.tsx`, `wizard/steps/StepBien.tsx`. En plus, les trois `messages/*.json` ont été modifiés par `i18n-set.mjs`.
