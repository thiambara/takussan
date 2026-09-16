# Revue design — H, console super-admin (2026-09-16)

**Verdict : Needs changes** — les 28 pages sont corrigées dans le périmètre et vertes, mais onze défauts restent dans des fichiers partagés (dont deux écrans, payouts et plans, rendus entièrement hors périmètre).
Pages couvertes : 28/28 · Corrections : 46 fichiers (dont 3 tests) · Collisions : 11 · Non mesuré : erreur d'hydratation à 390, états qui demandent d'écrire en base, trois composants non relevés

Mode impeccable : **Operate**. Rôle mesuré : `super_admin` (id 1). Port Chrome 9348, captures dans
`$S/shots/h` (`$S` = scratchpad de la session). Ids réels : agence 1, utilisateur 1, demande d'upgrade 1
(`pending`, la seule en base).

Revue antérieure lue : `.impeccable/critique/2026-08-26T12-48-11Z__takussan-web-src-app-super-admin.md`
(17/40). Ses P0 (trois vocabulaires de couleur, tables faites main) ont été traités depuis par
TCK-357/358 (primitives `components/console`, garde `check-super-admin-tokens.mjs`) ; ses P1 (accueil
en mur de nombres, files) par TCK-360. Cette passe vérifie ce qui en reste à l'écran.

## Pages

### /super-admin — super_admin
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ — aucune cible < 24 px hors
« Tout l'audit » (92×20).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/ConsoleQueues.tsx` (QueueCount) | à 390, « 339 signalements à trancher » à droite écrasait le nom de la file en « M… », « Demand… » | libellé d'unité `sr-only sm:not-sr-only` : sous `sm` la pastille parle seule à l'œil, le lecteur d'écran garde la phrase | texte écrasé = défaut responsive |
| MEDIUM | `ConsoleQueues.tsx` (QueueRow) | description `truncate` à toutes largeurs (« Vérifications d'iden… ») | `text-pretty sm:truncate` : s'enroule sur mobile, reste sur une ligne en bureau | l'information tronquée à 390 ne disait plus rien |
| LOW | `ConsoleQueues.tsx` | ligne-lien sans anneau de focus, survol de la dernière ligne qui dépasse les coins arrondis | `focus-visible:ring-2 ring-inset ring-ring`, `overflow-hidden` sur la section, `px-4 gap-3` sous `sm` | focus visible (guidelines § États interactifs), rayons |
| MEDIUM | `components/admin/super/SystemMetricsGrid.tsx` | `lg:grid-cols-4` : à 1024 (sidebar 256 px) ~170 px par tuile, le revenu « 6 176 568 203 F CFA » se casse ; déjà sur deux lignes à 1366 | `xl:grid-cols-4` | TCK-505 : `lg` n'est pas « large » dans une coque à barre latérale |
| MEDIUM | `SystemMetricsGrid.tsx` (tuile « Vérifiées ») | `toFixed(1)` → « 100.0 % de vérification » (point décimal en français, à côté de « +0,4 % ») | `fmt.nombre(…, { maximumFractionDigits: 1 })` → « 100 % » | locale incohérente dans la même grille |
| LOW | `SystemMetricsGrid.tsx` (tuile revenu, signalement du groupe A) | « 6 176 568 203 F / CFA » : le symbole coupé en deux | espace du symbole rendue insécable (`F\u00a0CFA`) ; la coupure de la valeur elle-même relève de `StatCard` (C6) | symbole monétaire indivisible |
| LOW | `components/admin/super/ConsoleRecentActivity.tsx` | lien « Tout l'audit » 92×20 | `min-h-10 -my-2` (cible 40 px sans bouger la mise en page), `underline-offset-4` | cible ≥ 40 px en bureau dense |

### /super-admin/agencies — super_admin
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ mais cartes écrasées à l'œil · 1024 ✓ · 1366 ✓.
Cibles < 24 px : les liens-noms d'agence (21 px de haut, doublés par « Ouvrir »).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/super/AgencyModerationCard.tsx` | une agence **vérifiée et active** proposait « Vérifier » à côté de « Déverifier », et une agence suspendue « Suspendre » | seules les transitions qui changent quelque chose : `verify` si non (vérifiée ET active) — c'est aussi la réactivation —, `suspend` si non suspendue, `unverify` si vérifiée | état trompeur : deux actions contradictoires, dont une sans effet |
| MEDIUM | `AgencyModerationCard.tsx` | pastille « Vérifiée » en ton `attention` (ocre = avertissement) | ton `info` | une agence vérifiée n'est pas une alerte (guidelines § couleurs sémantiques) |
| MEDIUM | `app/(super-admin)/super-admin/agencies/page.tsx` | grille de cartes `sm:grid-cols-2` : à 768, deux cartes de 226 px tronquent nom, email, dates | `lg:grid-cols-2` (squelette aussi) | TCK-505 |
| MEDIUM | `agencies/page.tsx` | deux champs date affichant tous deux « Choisir une date » | `placeholder` = « Créée à partir du » / « Créée jusqu'au » (clés existantes) | les deux bornes ne se distinguaient qu'au lecteur d'écran |
| LOW | `AgencyModerationCard.tsx` | `dl` en `lg:grid-cols-3` (3 × 105 px dans une carte de 354 px à 1024) ; dates en chiffres proportionnels ; nom sans anneau de focus ni `font-display` | `xl:grid-cols-3`, `tabular-nums`, `truncate` sur la licence, focus-visible, `font-display` (h3) | densité, guidelines typo |
| LOW | `messages/*.json` `superAdmin.agencyCard.license`, `…actions.unverify.label` (+ `agencyDetail.actions.unverify.label`) | « License », « Déverifier » | « Licence », « Dévérifier » (fr seulement ; en/wo inchangés) | orthographe française |

### /super-admin/agencies/1 — super_admin
Relevé avant : 360-1366 ✓ (docOverflow 0), aucune cible < 24 px.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/super/agency-detail.tsx` (`AgencyModerationActionsMenu`) | mêmes trois actions contradictoires que la carte | mêmes règles `canVerify/canSuspend/canUnverify` ; `mr-2` des icônes retiré (le bouton porte déjà `gap`) | état trompeur |
| MEDIUM | `agency-detail.tsx` (`AgencyHealthStrip`) | `md:grid-cols-3 xl:grid-cols-6` : à 1366 six tuiles de 165 px, « 181 623 872 F CFA » et « 26 sept. 2026 » cassés, libellés sur deux lignes ; à 768, 3 × 145 px | `sm:grid-cols-2 lg:grid-cols-3` (squelette de chargement aligné) | TCK-505, valeur illisible |
| MEDIUM | `agency-detail.tsx` (`AgencyDetailHeader`) | statut en `<Badge variant="secondary">` (ocre pâle) alors que la liste le rend vert ; « Vérifiée » en `success` ici, en `attention` dans la liste | `StatusBadge` avec la même table de tons que la carte (`active` → success…), « Vérifiée » en `info` des deux côtés | même donnée, même couleur d'un écran à l'autre |
| MEDIUM | `agency-detail.tsx` | aucune voie de retour (seul écran de profondeur 2 sans, cf. critique du 2026-08-26) | lien « Retour aux agences » (clé neuve `superAdmin.agencyDetail.backToList`, 3 langues), cible 40 px | contrôle et liberté |
| MEDIUM | `agency-detail.tsx` | erreurs de chargement en `Card` + `text-destructive` faits main | `<ErrorState>` (`@/components/feedback`) | guidelines § états d'erreur |
| LOW | `agency-detail.tsx` | onglet Transactions `md:grid-cols-3` ; montants/dates proportionnels ; membres sans `min-w-0` | `lg:grid-cols-3`, `tabular-nums`, `truncate` | densité, débordement d'emails longs |
| MEDIUM | `agency-detail.tsx:168` (onglets, collision signalée par le groupe G) | `TabsList className="h-auto flex-wrap"` : à 390, « Transactions » seul sur une deuxième rangée | ruban défilant : `w-full max-w-full flex-nowrap justify-start overflow-x-auto pb-2 group-data-horizontal/tabs:h-auto sm:w-fit`, onglets en `flex-none` (le primitif les met en `flex-1`) | rangée orpheline ; mesuré : 5 onglets à la même ordonnée de 360 à 1366, ruban de 480 px qui défile dans 328 px à 360, rendu inchangé à 1366 |
| LOW | `__tests__/agency-detail-contrast.test.tsx` | fixture `active` + vérifiée (qui n'offre plus que 2 boutons), libellé « Déverifier » | fixture `inactive` + vérifiée (les 3 variantes restent mesurées), « Dévérifier » | intention du test gardée |

### /super-admin/agency-upgrade-requests — super_admin
Relevé avant : 360-1366 docOverflow 0 ; `narrowText` à 360/390/768 (nom d'agence, date sur 4 lignes) ;
« Examiner » (seule action de la ligne) hors champ à 390, au bout d'une table qui défile.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/(super-admin)/super-admin/agency-upgrade-requests/page.tsx` | nom d'agence en texte ; la fiche ne s'ouvrait que par « Examiner », hors écran sur mobile | nom = lien vers la fiche (focus-visible), `min-w-40` sur la cellule | commande inatteignable sans défilement horizontal |
| MEDIUM | idem | date « 29 / août / 2026, / 23:59 » sur quatre lignes | `whitespace-nowrap tabular-nums` sur Date et Délai | texte écrasé |
| MEDIUM | idem | « 1 demandes » (clé `totalRequests` sans pluriel) | `console.filterBar.results` (pluriel ICU existant) | accord |
| LOW | idem | pagination faite main (« Page 1 / 1 » + deux boutons désactivés) | `<Pagination>` de la console (masquée sur une seule page, comme partout ailleurs) | deux paginations dans la même console (critique) |
| LOW | idem | filtres sur trois colonnes dès `md` (défaut de `FilterBar`) | `md:grid-cols-1 lg:grid-cols-3` (le `md:` écrase le défaut de la primitive, cf. collision C8) | TCK-505 |

### /super-admin/agency-upgrade-requests/1 — super_admin
Relevé avant : 360-1366 ✓ ; « Retour aux demandes » 161×20.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `agency-upgrade-requests/[id]/page.tsx` (`HistorySection`) | « Type actuel : individual » — valeur d'énumération brute | « Compte individuel » / « Agence standard » (clés neuves `…history.kinds.*`, 3 langues), valeur inconnue affichée telle quelle | le front possède le texte affiché (principe 5) |
| LOW | idem | quatre tuiles en `sm:grid-cols-3` → la quatrième seule sur sa ligne | `sm:grid-cols-2 xl:grid-cols-4` | rythme |
| LOW | idem | lien retour 20 px de haut, sans anneau de focus ; chiffres proportionnels | `min-h-10 -my-2`, focus-visible, `tabular-nums` | cible, focus |

### /super-admin/alerts — super_admin
Relevé avant : 360-1366 ✓ (docOverflow 0). À l'œil : base vide → la table ne rendait que ses en-têtes.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/super/alerts.tsx` | « Supprimer » une règle partait au premier clic | `ConfirmActionDialog` (phrase `SUPPRIMER`, libellé de la règle dans la description ; clés neuves `superAdmin.alerts.deleteTitle/deleteDescription`) | action destructive sans confirmation (guidelines § micro-copie) ; une règle perdue ne se voit que le jour où l'alerte aurait dû partir |
| MEDIUM | `app/(super-admin)/super-admin/alerts/page.tsx` | liste vide = rangée d'en-têtes seule ; chargement en `div animate-pulse` ; erreur en `div bg-destructive/10` fait main | `DataState` + `EmptyState` avec CTA « Nouvelle règle » (clés neuves `emptyTitle/emptyDescription`) + `ErrorState` avec « Réessayer » | état vide qui enseigne ; composants d'état uniques |
| LOW | `alerts.tsx` | compteur d'échecs proportionnel ; actions `flex` sans retour à la ligne ; erreur du dialogue sans `role` | `tabular-nums`, `flex-wrap`, `role="alert"` | |
| MEDIUM | `components/admin/super/ConfirmActionDialog.tsx` (toutes les doubles confirmations de la console) | `<label>` non relié au champ ; `<input>` nu (`outline-none`, pas d'anneau de focus, pas de fond de jeton) | `<Label htmlFor>` via `useId`, primitive `<Input>`, `autoCapitalize="characters"`, `spellCheck={false}` | champ sans nom accessible, focus invisible (guidelines § états interactifs, règle « toujours `<Input>` ») |

### /super-admin/announcements — super_admin
Relevé avant : docOverflow 0 partout — **mais à 390 et 768 les deux cartes sortaient de l'écran**, coupées
par la coque (donc invisibles à la sonde, visibles sur la capture : « Aucune annonce pour le mom… »).
Cibles < 24 px : cases à cocher 16 px (le `<label>` qui les porte faisait 32 px).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/super/announcements.tsx` | `grid gap-6 xl:grid-cols-[…]` : sous `xl`, la piste implicite prenait la largeur minimale de la table et du formulaire | `grid-cols-1` + `min-w-0` sur les deux sections | contenu et commandes (publier) coupés hors écran sur mobile et tablette |
| MEDIUM | `announcements.tsx` (ciblage rôles / agences) | étiquettes-cases de 32 px ; lignes d'agence `py-1` | `min-h-10` / `min-h-9`, survol, anneau `has-focus-visible` | cibles, focus |
| LOW | `announcements.tsx` | corps d'annonce non borné dans la table ; fenêtre de diffusion qui se casse ; en-têtes sans `flex-wrap` | `line-clamp-2 text-pretty`, `whitespace-nowrap tabular-nums`, `flex-wrap` | densité |

### /super-admin/audit — super_admin
Relevé avant : 360-1366 ✓. À l'œil : deux champs « Choisir une date » indistincts, champs texte sans nom
accessible, placeholder coupé à 1366.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/CrossTenantAuditTable.tsx` | `<Input>` événement et auteur avec placeholder pour seul nom | `aria-label` (clés neuves `eventAria`, `causerAria`) | champ sans nom accessible |
| MEDIUM | idem | une requête par frappe dans le champ événement | `DebouncedSearchInput` (primitive console) avec indicateur `busy` | la critique du 2026-08-26 le relevait ; le journal entier était requêté à chaque touche |
| MEDIUM | idem | bornes de date identiques à l'œil | `placeholder` = « Date depuis » / « Date jusqu'à » (clés existantes) | |
| LOW | idem | pas de compte ni de « Réinitialiser » ; pagination faite main | `FilterBar` avec `resultCount` (pluriel ICU) + `onReset` ; `<Pagination>` de la console ; `xl:grid-cols-4` | cohérence avec les autres listes |
| LOW | `messages/*.json` `superAdmin.audit.colCauser`, `causerPlaceholder` | « Causer », « ID du causer » (anglicisme) | « Auteur », « ID de l'auteur » (fr ; en/wo : `Causer ID` / `ID ki ko def` pour le placeholder) | micro-copie |

### /super-admin/enums — super_admin
Relevé avant : 360-1366 ✓. À 1366 la liste de gauche s'étirait sur toute la hauteur de la table.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/(super-admin)/super-admin/enums/page.tsx` | chargement `div animate-pulse` ; erreur `div bg-destructive/10` faite main | `<Skeleton>` + `<ErrorState>` avec « Réessayer » | composants d'état uniques |
| MEDIUM | idem | `lg:grid-cols-[280px_1fr]` : à 1024, 424 px pour une table de six colonnes | `xl:` + `items-start` | TCK-505 |
| LOW | `components/admin/super/business-enums.tsx` | compteurs d'usage proportionnels ; erreur du dialogue sans `role` | `tabular-nums`, `role="alert"`, `text-pretty` | |

### Même motif corrigé sur d'autres pages (chargement / erreur faits main)
`settings/page.tsx`, `system/maintenance/page.tsx`, `feature-flags/page.tsx`, `templates/page.tsx`,
`integrations/page.tsx` (ce dernier en `DestructiveBanner`) : `div animate-pulse` → `<Skeleton>`,
erreur → `<ErrorState onRetry retryLabel>`. `templates/page.tsx` : même passage `xl:` + `items-start`
que `/enums`.

### /super-admin/feature-flags — super_admin
Relevé avant : 360-1366 ✓. À 390, « Configurer » (seule commande utile) au bout de la table qui défile.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/feature-flags.tsx` | libellé du flag en texte | bouton `variant="link"` qui ouvre la configuration ; clé en `font-mono` | commande atteignable sans défilement horizontal |
| MEDIUM | idem | bascule « Activé/Désactivé globalement » et « Tester » sans état annoncé | `aria-pressed` | bouton-bascule dont l'état n'était que visuel |
| LOW | idem | erreur du dialogue sans `role` ; pourcentage proportionnel ; actions sans retour à la ligne | `role="alert"`, `tabular-nums whitespace-nowrap`, `flex-wrap` | |

### /super-admin/integrations — super_admin
Relevé avant : 360-1366 ✓. À 768 : deux colonnes de 226 px, « Orange / Money » sur deux lignes.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/integrations.tsx` + `integrations/page.tsx` | intitulés de catégorie écrits en français dans le code (`categoryLabels`) ; pastille de santé = code brut anglais « unknown » | clés neuves `superAdmin.integrations.categories.*` et `statuses.*` (3 langues) ; `StatusBadge` (healthy → success, failed → danger, disabled/unknown → neutral) | principe 5 ; l'écran restait français en `en`/`wo` et anglais en `fr` |
| MEDIUM | `integrations/page.tsx` | `md:grid-cols-2` | `lg:grid-cols-2 xl:grid-cols-3` | TCK-505 |
| MEDIUM | `integrations.tsx` | « Tester » en bouton plein sur chacune des huit cartes | `variant="outline"` | un seul CTA principal par écran (guidelines § composants) |
| LOW | idem | résultat du test (latence) non annoncé ; nom de fournisseur en corps de texte | `aria-live="polite"`, `tabular-nums` ; fournisseur en `font-mono text-xs`, titre `truncate` | |

### /super-admin/kyc — super_admin (+ état `?filter[status]=pending` avec dossier sélectionné)
Relevé avant : 360-1366 ✓ (file vide par défaut). État « à compléter » mesuré (1 dossier en base) :
**à 390, le panneau de décision sortait de l'écran** (« Manquante » coupé), coupé par la coque.
Console : une erreur d'hydratation React à 390 (message tronqué par la sonde, non reproduite aux autres
largeurs — non attribuée, voir « Non mesuré »).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `app/(super-admin)/super-admin/kyc/page.tsx` | `grid xl:grid-cols-[1fr_360px]` sans piste sous `xl` | `grid-cols-1` + `min-w-0` | panneau de décision coupé sur mobile |
| LOW | idem | deux tuiles empilées à 390 (180 px de hauteur avant la file) ; sélecteur dans une grille à 3 colonnes | `grid-cols-2` dès le mobile ; sélecteur en `max-w-sm` | la file remonte au-dessus de la ligne de flottaison |

### /super-admin/moderation — super_admin
Relevé avant : 360-1366 docOverflow 0 — **mais à 768 la table sortait de l'écran sans défiler** (même
défaut de piste implicite). À 1366, filtre « agence » décalé de 20 px par rapport à ses voisins.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `app/(super-admin)/super-admin/moderation/page.tsx` | `grid xl:grid-cols-[1fr_360px]` sans piste sous `xl` | `grid-cols-1` + `min-w-0` | colonnes « Raison », « Âge » et « Traiter » inatteignables à 768 |
| MEDIUM | `components/admin/super/moderation.tsx` (`ModerationStats`) | retard > 7 jours dans un aplat `primary/10` (terracotta de marque) | `<WarningBanner>` (jeton `--warning`) | un retard est un avertissement, pas la marque |
| MEDIUM | `moderation.tsx` (`ModerationFilters`) | combobox d'agence sans intitulé visible, triggers `h-8` à côté d'un champ `h-10` | intitulé visible (`aria-hidden`, le nom reste l'`aria-label`), triggers `data-[size=default]:h-10`, `md:grid-cols-2 xl:grid-cols-4` | rangée de filtres désalignée ; TCK-505 |
| MEDIUM | `moderation.tsx` (`ModerationQueueTable`) | à 1366, sujet et agence cassés sur 3-4 lignes, âge « 14 / jours » | `min-w-48` / `min-w-32`, âge `whitespace-nowrap tabular-nums` (la table défile dans son cadre si besoin) ; lien du sujet avec focus-visible | texte écrasé |
| LOW | `moderation.tsx` (`ModerationStats`) | trois tuiles empilées sur mobile | `grid-cols-3` | |
| LOW | `moderation/page.tsx` | squelette `div animate-pulse` ; pagination faite main | `<Skeleton>` ; `<Pagination>` de la console | composants uniques |

### /super-admin/payouts — super_admin
Relevé avant : 360-1366 docOverflow 0 ; `narrowText` à 768 (« 0 reversement — tri par fin de période
décroissante » écrasé dans la troisième colonne). La page est un simple emballage : tout le rendu est
`components/billing/AdminPayoutsClient.tsx` (groupe G) → **aucune correction appliquée ici**, voir
« Collisions » C1-C3.

### /super-admin/plans — super_admin (TCK-505 #7)
Relevé avant : 360-1366 ✓ (TCK-505 #7 tient : aucun champ sous 120 px à 768). À l'œil : les lignes de
plan existantes sont **quatre champs sans aucun nom** (« free », « Free », « 0 », « 0 » — impossible de
savoir lequel est le prix et lequel la commission). Rendu par `components/billing/AdminPlansClient.tsx`
→ collision C4-C5.


### /super-admin/properties — super_admin
Relevé avant : 360-1366 docOverflow 0 ; cibles < 24 px : cases à cocher 13×13 (sélection et « Tout
sélectionner »), en-têtes triables de 16 px (intégrés à la ligne d'en-tête, écartés). À l'œil : type et
statut du bien en jetons d'API bruts (« apartment », « published ») ; prix et dates cassés sur deux lignes.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/SuperAdminPropertiesTable.tsx` | type et statut affichés en jeton d'API | `property.types.*` / `property.status.*` (clés existantes) via `t.has()`, jeton brut en repli | principe 5 |
| MEDIUM | idem | prix « 45 000 000 / F CFA » et dates cassés ; agence écrasée | `whitespace-nowrap tabular-nums` (prix, dates), `whitespace-nowrap` (ville, type), `min-w-32` (agence) — la table défile dans son cadre | texte écrasé |
| LOW | idem | cases 13 px aux couleurs du navigateur ; lien du titre sans anneau | `size-4 accent-primary` ; focus-visible | cible, focus |
| LOW | `SuperAdminPropertiesFilters.tsx` | `SelectTrigger className="h-10"` sans effet (voir C9) | `data-[size=default]:h-10` | filtres alignés sur le champ de recherche |

Contre-relevé : 360-1366 docOverflow 0 (passe du lot complet).

### /super-admin/reports — super_admin (4 onglets)
Relevé avant : 360-1366 docOverflow 0. À l'œil : **à 360, le repère du graphique fait 720 px réduit à
296 : graduations de 5 px, barres de 17 px** ; à 1366 le graphique ne remplit pas sa carte ; à 390
« Funnel » seul sur une deuxième rangée d'onglets **qui recouvrait la carte suivante** (la `TabsList`
garde sa hauteur fixe `h-8`) ; total et « Exporter CSV » séparés par le retour à la ligne ; taux de
conversion « 9.8% » (point décimal, pas d'espace) ; deux bornes « Choisir une date » identiques.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/reporting/ReportingShell.tsx` | `TabsList className="h-auto flex-wrap"` : `h-auto` perdait contre `group-data-horizontal/tabs:h-8` ; la 2ᵉ rangée débordait sur la carte | `grid w-full grid-cols-2 gap-y-2 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit` : grille 2×2 sur mobile, rangée en `sm` | onglet recouvrant le contenu |
| MEDIUM | `components/reporting/TimeSeriesChart.tsx` | `viewBox` fixe de 720 px mis à l'échelle (texte de 5 px à 360) | largeur du repère mesurée (`ResizeObserver` via réf de rappel, 720 avant mesure, 280 minimum) ; nombre d'étiquettes X borné par la largeur (96 px par étiquette) ; `h-70 w-full`, axes en `text-[11px]` | texte illisible sur mobile, graphique étriqué en bureau — `viewBox` mesuré : 296 à 360, 1030 à 1366 |
| MEDIUM | `components/reporting/FunnelChart.tsx` | `${(x * 100).toFixed(1)}%` → « 9.8% » | `fmt.nombre(x, { style: 'percent', maximumFractionDigits: 1 })` + `tabular-nums` ; `reporting.funnel.conversion` fr « Conversion globale : » (espace insécable) | locale |
| LOW | `GrowthChart.tsx`, `RevenueChart.tsx` | total et export séparés au retour à la ligne | groupe `ml-auto` qui garde total et export ensemble | rythme |
| LOW | `ReportWindowControls.tsx` | deux bornes « Choisir une date » | `placeholder` = « Début de la plage » / « Fin de la plage » (clés existantes) | |
| LOW | `GrowthChart`, `FunnelChart`, `ReportWindowControls`, `AgencyOnboardingDialog` | `SelectTrigger className="h-9"` sans effet (C9) | `data-[size=default]:h-9` | alignement sur les `DatePicker` h-9 |

Contre-relevé : 360-1366 docOverflow 0 ; onglets Revenu, Cohortes (table défilante dans son cadre),
Funnel mesurés à 360 et 1366. Preuve de version : `TabsList` rendue avec `grid-cols-2`, hauteur 66 px
à 390 (32 px avant) ; `viewBox` = `0 0 296 280` à 360.

### /super-admin/settings — super_admin
Relevé avant : docOverflow 0 partout — **mais à 768, cibles de 20 px de large** (`currency`,
`format.date`…) : la grille de ligne en trois colonnes `md:grid-cols-[minmax(220px,…)_minmax(0,1.2fr)_minmax(180px,…)]`
ne laissait que 20 px au sélecteur, et « Valeur par défaut » passait **par-dessus** les boutons de devise.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/super/platform-settings.tsx` (`SettingField`) | trois colonnes dès `md` (464 px de contenu) | `grid-cols-1` puis `lg:grid-cols-[minmax(200px,…)_minmax(0,1.2fr)_minmax(160px,…)]`, `min-w-0` | commandes réduites à 20 px, texte superposé |
| MEDIUM | idem (devises supportées) | devises sélectionnées en boutons pleins terracotta (trois CTA à côté d'« Enregistrer ») ; état non annoncé | `variant="secondary"` + anneau + coche, `aria-pressed` | un seul CTA principal ; état de bascule accessible |
| MEDIUM | idem (`SettingsSection`) | avertissement « redémarrage requis » en `text-primary` (marque) ; confirmation d'enregistrement cochée en `text-accent` | `text-warning` ; `text-success` | couleur sémantique (TCK-450) |
| LOW | idem | actions d'en-tête sans retour à la ligne ; descriptions sans `text-pretty` | `flex-wrap`, `text-pretty` | |

Contre-relevé : 360-1366 docOverflow 0, sélecteurs pleine largeur à 768 (capture). Preuve :
`lg:grid-cols-[minmax(200px` lu dans le DOM, 3 boutons `aria-pressed=true`.

### /super-admin/super-admins — super_admin
Relevé avant : 360-1366 ✓. Chargement en carte « Chargement… » ; erreur sans « Réessayer ».

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/(super-admin)/super-admin/super-admins/page.tsx` | chargement = texte dans une carte ; erreur sans action | deux `<Skeleton>` (libellé `sr-only role="status"`) ; `ErrorState onRetry` | états uniques |
| LOW | idem | nom et email sans `min-w-0` (un email long poussait la pastille 2FA hors carte) ; icône d'invitation compressible ; actions « Relancer / Annuler » en `size="sm"` (28 px) | `min-w-0 truncate`, `shrink-0`, taille par défaut, `flex-wrap` | débordement, cible |

Dialogue « Inviter un super-admin » (`components/super-admin/InviteSuperAdminModal.tsx`) mesuré à 390 et
1366 : 358 px de large à 390, champs étiquetés, CTA pleine largeur — rien à corriger.
Contre-relevé : 360-1366 docOverflow 0.

### /super-admin/system — super_admin
Relevé avant : 360-1366 ✓, capture propre (cartes-liens, icônes cohérentes). Aucune correction.

### /super-admin/system/health — super_admin
Relevé avant : 360-1366 docOverflow 0. **À 768, cinq tuiles de 80 px** (`md:grid-cols-5`) : « BASE DE
DONNÉES », « E-MAIL » coupés en syllabes ; **pendant le chargement, les cinq sondes s'affichaient en
pastille rouge `danger`** (« … ») et les files à « 0 » ; « Échecs 24h : 0 » en rouge.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/super/system-health.tsx` | sonde sans statut = ton `danger` : chaque chargement annonçait cinq pannes | `StatCard loading` (squelette) pendant la requête ; sonde sans statut = `neutral` ; erreur de requête → `ErrorState onRetry` (avant : « … » rouges indéfiniment) | faux signal d'incident sur l'écran qui sert à en détecter |
| MEDIUM | idem | `md:grid-cols-5` / `md:grid-cols-3` | `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5` / `sm:grid-cols-3` | TCK-505, libellés coupés |
| MEDIUM | idem | « Échecs 24h » toujours en `danger`, même à 0 | `danger` seulement si > 0 ; valeurs via `fmt.nombre` | le rouge doit signaler |

Contre-relevé : 360-1366 docOverflow 0 ; capture 768 : 3 + 2 tuiles, pastilles « OK » vertes, file « 1 ».
Preuve : `xl:grid-cols-5` lu dans le DOM.

### /super-admin/system/jobs — super_admin
Relevé avant : 360-1366 ✓. File vide : `EmptyState` dans la table, « Rejouer tout » désactivé à 0,
confirmation par phrase déjà en place (`ConfirmActionDialog`, `RETRY_ALL_PHRASE`) — la note de la passe
précédente (« rejouer tout sans confirmation ») était fausse. Aucune correction.

### /super-admin/system/maintenance — super_admin
Relevé avant : 360-1366 docOverflow 0. À 768 : trois messages FR/EN/WO en colonnes de 130 px (texte sur
5 lignes), bornes « Choisir une date et un… » tronquées ; sélection du mode et de la sévérité en
boutons pleins terracotta (trois CTA pleins avec « Programmer ») ; « Annuler la fenêtre » rouge désactivé
affiché sans fenêtre ; à 1366 la carte « État courant » étirée sur toute la hauteur.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/maintenance.tsx` | messages `md:grid-cols-3`, dates `md:grid-cols-2` | messages empilés ; dates `xl:grid-cols-2` | texte écrasé, placeholder tronqué |
| MEDIUM | idem (`Segmented`) | choix en `variant="default"`, état non annoncé, pas de groupe | `secondary` + anneau, `aria-pressed`, `role="group" aria-labelledby` | un seul CTA ; bascule accessible |
| LOW | idem | bouton destructif désactivé sans fenêtre ; mode rendu en jeton (`banner`) ; erreur sans `role` ; carte étirée | bouton rendu seulement s'il y a une fenêtre ; `modes.*` via `t.has()` ; `role="alert"` ; `items-start` | bruit rouge, principe 5 |

Contre-relevé : 360-1366 docOverflow 0 ; capture 1366 : messages pleine largeur, dates lisibles.
Preuve : `items-start gap-4 lg:grid-cols` lu dans le DOM, 2 `aria-pressed=true`.

### /super-admin/system/scheduler — super_admin
Relevé avant : 360-1366 docOverflow 0. **À 390, la colonne « Tâche » prenait tout l'écran** avec le chemin
du binaire (`'/opt/homebrew/Cellar/php/8.4.6/bin/php' 'artisan' …`), statut et durée hors champ ;
pendant le chargement, table réduite à ses en-têtes ; durées « 695ms ».

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/scheduler.tsx` | ligne de shell complète | `artisan <commande>` (le chemin du binaire est un détail de la machine) ; toute autre forme (classe de job) inchangée ; `font-mono text-xs break-all min-w-56` | colonne écrasante, information utile noyée |
| MEDIUM | idem | chargement = en-têtes seuls | trois `<Skeleton>` dans le cadre de la table | état de chargement |
| LOW | idem | « 695ms » ; date et durée qui cassent | clé neuve `superAdmin.scheduler.durationMs` (« {ms} ms », 3 langues) + `fmt.nombre` ; `whitespace-nowrap tabular-nums` | locale |
| LOW | `__tests__/ScheduledTaskTable.test.tsx` | assertion « 0ms » | « 0 ms » + nouveau cas (commande artisan raccourcie, classe de job intacte) | intention gardée |

Contre-relevé : 360-1366 docOverflow 0. Preuve : `min-w-56` lu dans le DOM.

### /super-admin/tags — super_admin
Relevé avant : la première mesure est tombée pendant qu'un autre groupe cassait la compilation
(`PropertyCardCompact.tsx`, `FALLBACK_IMAGE`) → remesurée. **À 768, le champ de recherche réduit à 55 px**
(« Re ») à côté de « Nouveau tag » ; slugs cassés en deux ; filtre actif en terracotta plein à côté du
CTA.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin-tags/TagsManager.tsx` | barre `md:flex-row` | `xl:flex-row` ; recherche `min-w-0 flex-1` (`xl:w-64`), `h-9` | champ inutilisable à 768 |
| MEDIUM | idem | filtre actif `variant="default"` (deux terracotta pleins) ; puces `size="sm"` (28 px) | `secondary` + anneau (`aria-selected` déjà posé), `h-9 px-3.5` | un seul CTA ; cible |
| LOW | idem | slug et type qui cassent ; nom écrasé ; actions icône en `size="sm"` | slug `font-mono whitespace-nowrap`, type `whitespace-nowrap`, nom `min-w-40` ; `size="icon"` | |

Contre-relevé : 360-1366 docOverflow 0 ; capture 768 : recherche pleine largeur. Preuve : `xl:w-64`.

### /super-admin/templates — super_admin
Relevé avant : même compilation cassée par un autre groupe → remesurée. À 768 : en-tête du modèle en deux
colonnes (boutons empilés à droite) ; « Actif », « EMAIL » et « FR » en terracotta plein avec
« Enregistrer » (quatre CTA pleins) ; événement sélectionné en terracotta plein dans la liste.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/notification-templates.tsx` | bascule Actif, canal et langue en `default` sans état annoncé | `secondary` + anneau, `aria-pressed` ; taille par défaut (au lieu de `sm`), `min-w-*` | un seul CTA ; état accessible |
| LOW | idem | événement sélectionné en `default` ; domaine en `opacity-75` | `secondary` + `aria-current` ; `text-muted-foreground` | jetons plutôt qu'opacité |
| LOW | idem | en-tête `md:flex-row` ; variables en police de texte ; erreur sans `role` | `xl:flex-row`, `font-mono`, `role="alert"` | |

Contre-relevé : 360-1366 docOverflow 0, 3 `aria-pressed=true`.

### /super-admin/users — super_admin
Relevé avant : 360-1366 docOverflow 0 ; erreur d'hydratation à 390 (voir « Non mesuré »). À 768 : combobox
d'agence « Toutes ag » (140 px) ; sélecteurs à 32 px à côté d'un champ de 40 px ; rôles et statut en jetons
(« super_admin », « active »).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/(super-admin)/super-admin/users/page.tsx` | rôles et statut en jeton d'API | `superAdmin.pages.users.roles.*` / `statuses.*` (clés existantes) via `t.has()`, jeton en repli | principe 5 |
| MEDIUM | idem | filtres `md:grid-cols-3` (défaut de `FilterBar`) | `sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`, recherche `sm:col-span-2` | TCK-505 |
| MEDIUM | idem + `kyc/page.tsx`, `agencies/page.tsx`, `moderation.tsx`, `SuperAdminPropertiesFilters.tsx` | `SelectTrigger className="h-10"` **sans effet** : la hauteur de base vit sous `data-[size=default]:h-8`, plus spécifique | `data-[size=default]:h-10` | les « h-10 » de la console ne s'appliquaient nulle part (C9) |
| LOW | idem | cellule utilisateur `min-w-0` (écrasée par la table) ; date, sécurité qui cassent ; actions qui s'empilent | `min-w-56`, `whitespace-nowrap tabular-nums`, actions sur une ligne | |
| LOW | `users/__tests__/page.test.tsx` | assertait « agent » et « active » (le jeton) | assert « Agent », « Actif », et l'absence de « active » | l'intention (rôle et statut visibles) gardée, le jeton n'est plus attendu |

Contre-relevé : 360-1366 docOverflow 0. Preuve : `md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6` et
`data-[size=default]:h-10` lus dans le DOM.

### /super-admin/users/1 — super_admin
Relevé avant : 360-1366 docOverflow 0. Statut « active » et rôle « super_admin » en jetons ; profils
« Agent » / « Owner » écrits en anglais dans le code ; activité « created / created » (description
répétée) ; « Voir dans l'audit » sous le titre au lieu d'à droite ; **grille `xl:grid-cols-[1fr_420px]`
sans `grid-cols-1`** (même piste implicite que announcements/kyc).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/super/user-detail.tsx` | grille sans piste sous `xl` | `grid-cols-1 items-start … xl:grid-cols-[minmax(0,1fr)_420px]`, `min-w-0` | débordement latent (session/email longs) |
| MEDIUM | idem | statut `Badge secondary` en jeton ; rôles et types de profil en jeton / anglais en dur | `StatusBadge` (même table de tons que la liste) + libellés `superAdmin.pages.users.*` ; type de profil porté par sa clé | principe 5, cohérence avec la liste |
| MEDIUM | idem | erreur en `Card text-destructive` | `ErrorState onRetry` | |
| LOW | idem | description d'activité répétée ; action d'en-tête en `flex-row` sur une grille ; `mr-2` sur les icônes ; titre long sans `text-balance` | description masquée quand identique ; `CardAction` ; `mr-2` retiré ; `text-balance break-words`, email `truncate` | |

Contre-relevé : 360-1366 docOverflow 0 ; capture 1366 : « created » une fois, « Actif » vert. Preuve :
`[data-slot=card-action]` présent, `xl:grid-cols-[minmax(0,1fr)_420px]` lu dans le DOM.

### Banc corrigé (CORS) — tout re-mesuré sur localhost:3000
Le chef d'équipe a signalé que le banc servait les pages sur `127.0.0.1:3000`, origine refusée par l'API
(CORS) : toute liste chargée côté client y rendait son état d'erreur. **Les relevés « avant » des pages à
données client sont donc à lire avec cette réserve** (les défauts de mise en page relevés restent vrais :
ils ont été constatés sur des pages rendues avec leurs données, via le BFF). Le contre-relevé ci-dessous
a été refait en entier sur `localhost:3000` (`location.host` lu dans chaque mesure).

### Contre-relevé global
**Passe finale sur localhost:3000 (après correction du banc), 28 pages × 5 largeurs** : docOverflow 0
partout, `clip` 0 partout, **aucun `role="alert"` rendu** (aucune liste en erreur), données client chargées
(audit 25 lignes, enums 16, users 20, tags 22, scheduler 13, upgrade 1). Tuile revenu à 1366 :
« 6 176 568 203 F CFA » sur une ligne. Seule correction issue de cette passe : dans `feature-flags.tsx`, le
libellé-bouton du flag passe à `min-h-9` (22 px de haut, relevé à 768-1366).

Passe précédente (sur 127.0.0.1, avant la correction du banc) : docOverflow 0 partout. Les pages
corrigées après cette passe ont été remesurées seules (sections ci-dessus), avec une classe propre au
correctif lue dans le DOM. `clip` (éléments hors écran non contenus par un défileur) = 0 sur toutes les
pages remesurées. Captures 1366 comparées aux captures « avant » (`$S/shots/h-before`) : aucune
régression de bureau relevée ; les seuls changements visibles à 1366 sont voulus (graphique pleine
largeur, sélections en aplat neutre, carte de maintenance non étirée).

## Collisions (hors périmètre — NON appliquées)

| # | Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|---|
| C1 | `components/billing/AdminPayoutsClient.tsx:63` | `md:grid-cols-[180px_180px_1fr]` | `lg:` | à 768 le compteur « 0 reversement — tri… » est écrasé dans la 3ᵉ colonne (TCK-505) | /super-admin/payouts |
| C2 | `AdminPayoutsClient.tsx:64` | filtre agence = `<Input type="number">` (saisir un id) | `AgencyCombobox` (comme users/moderation, TCK-363) | on ne demande pas de taper un id | /super-admin/payouts |
| C3 | `AdminPayoutsClient.tsx` (liste, filtres) + `PayoutCloseDialog` | état vide en texte simple ; `SelectTrigger` h-9 (sans effet, C9) ; date tronquée à 768 dans le dialogue de clôture | `EmptyState` ; `data-[size=default]:h-10` ; champs empilés sous `lg` | composants d'état uniques, alignement | /super-admin/payouts |
| C4 | `components/billing/AdminPlansClient.tsx:87-90` | quatre `<Input>` sans label ni `aria-label` sur chaque plan existant | `aria-label` (code, libellé, prix mensuel, commission) — ou `<Label>` visible en `sm:sr-only` | quatre champs anonymes : impossible de savoir lequel est le prix | /super-admin/plans |
| C5 | `AdminPlansClient.tsx:45-48`, `:50/92/96` | nouveau plan : placeholders pour seul nom ; `mr-2` sur les icônes de bouton | labels ; retirer `mr-2` (le bouton a déjà `gap`) | nom accessible ; espacement doublé | /super-admin/plans |
| C6 | `components/console/StatCard.tsx:64` | valeur `text-2xl` sans garde : « 6 176 568 203 F CFA » se casse dans une tuile étroite | `text-balance` ou `text-xl @[14rem]:text-2xl` (requête de conteneur) | valeur illisible | /super-admin (accueil), agencies/1 |
| C7 | `components/kyc/kyc-components.tsx:222` (et `:55`) | pièces en `md:grid-cols-3` dans un panneau de 360-420 px | `grid-cols-1 sm:grid-cols-2` (le panneau ne suit pas la largeur de l'écran) | « Pièce dirigeant » coupé | /super-admin/kyc |
| C8 | `components/console/FilterBar.tsx:52` | défaut `md:grid-cols-3 xl:grid-cols-4` | défaut `lg:grid-cols-3 xl:grid-cols-4` | chaque appelant doit écraser `md:` pour respecter TCK-505 ; `lg:` seul dans `controlsClassName` ne suffit pas (piège relevé ici sur trois écrans) | users, moderation, upgrade requests, properties, agencies, audit |
| C9 | `components/ui/select.tsx:49` | hauteur de base sous `data-[size=default]:h-8` : un `className="h-10"` d'appelant **n'a aucun effet**, sans erreur | exposer `size="lg"` (h-10), ou documenter la forme `data-[size=default]:h-10` dans la doc de la primitive, ou une garde | quatorze « h-9/h-10 » sans effet trouvées dans ce seul périmètre ; la même forme existe sûrement ailleurs | console entière |
| C10 | `components/ui/button.tsx:43` | `size="sm"` = h-7 (28 px) utilisé pour des actions de ligne | cible ≥ 44 px sous `sm` (`max-sm:min-h-11` ou taille dédiée) | cibles tactiles | users/1, super-admins, tags… |
| C11 | `components/ui/date-picker.tsx:133` | placeholder par défaut « Choisir une date » identique pour les deux bornes d'une plage | accepter une prop `range="start" | "end"` ou un défaut neutre ; ici corrigé appelant par appelant | bornes indistinctes | agencies, audit, reports, maintenance (date-time) |

## Écartés

| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| liens-noms dans les tables (upgrade requests, moderation, properties) | cibles de 18 px signalées par la sonde | liens en ligne dans du texte de cellule : exception « inline » de WCAG 2.5.8 ; la ligne a une action pleine taille |
| barres du graphique (`rect` 17×230) | cibles < 24 px | éléments de lecture, pas des commandes |
| `TagsManager.tsx` suppression | confirmation avant suppression | changerait le comportement (le test attend l'appel direct) ; l'API refuse déjà un tag utilisé (409, message en ligne). À décider par ticket |
| `super-admins/page.tsx` | badge « Actif (2FA off) » en `attention` | un super-admin sans 2FA est peut-être un risque, mais le ton est un choix produit, pas un défaut de rendu |
| `integrations/page.tsx` | retirer l'import `DestructiveBanner` | encore utilisé 3 fois, dont la bannière `criticalDown` légitime |
| `system-health.tsx` | libellé « … » (`status.loading`) | conservé pour une sonde absente de la réponse ; le chargement passe désormais par le squelette |
| `AgencyModerationCard.tsx` | contour d'image (`outline-scrim/10`) sur le logo | essayé puis retiré : la bordure existante fait déjà le travail |

## Non mesuré
- **Erreur d'hydratation React** à 390 sur `/super-admin/users` et `/super-admin/kyc?filter[status]=pending`,
  et une fois sur `/super-admin/reports` au moment où une modification recompilait : message tronqué par la
  sonde, non reproduite aux autres largeurs, non attribuée (probablement une date formatée côté serveur et
  côté client à des instants différents, ou la recompilation) — à reprendre avec la trace complète.
- États qui demandent d'écrire en base : fenêtre de maintenance active, invitations en attente ou expirées,
  règle d'alerte existante, modèle en erreur de sauvegarde, sonde de santé en panne, job échoué. Rendus
  vérifiés par les tests unitaires seulement.
- Dialogues des actions de support de `users/1` (reset, 2FA, sessions) : non ouverts, rien envoyé.
- `components/super-admin/ReviewActionsModal.tsx` (dialogue d'approbation/refus de
  `agency-upgrade-requests/1`) : non ouvert, pour ne rien risquer d'envoyer. `SuperAdminOnboardingWizard.tsx`
  n'est monté que par `/onboarding/super-admin`, hors des 28 pages ; `components/files/PdfViewer.tsx`
  n'est importé par aucune page. Non relevés.
- L'efficacité du détecteur `clip` (éléments coupés par la coque) : il a vu 0 partout après correction,
  mais n'a pas été éprouvé par ablation sur un défaut réintroduit.

## Vérification
Depuis `takussan-web/` sauf mention.

- `npx vitest run src/components/admin/super src/components/admin-tags src/components/super-admin src/components/reporting src/components/files "src/app/(super-admin)"`
  → **42 fichiers, 241 tests, tous verts**.
- `npx eslint <les 46 fichiers modifiés>` → **0 erreur, 0 avertissement**.
- `npx tsc --noEmit` (projet entier) → **propre**, deux fois (après les lots, puis en fin).
- Gardes (racine) :
  - `check-app-tokens` ✓ · `check-feedback-states` ✓ · `check-destructive-contrast` ✓ (18 couples ≥ 4,5:1).
  - `takussan-web/scripts/check-classes-emises.mjs` ✓ (1723 classes, toutes émises — dont `h-70`,
    `text-[11px]`, `has-focus-visible:ring-2`, `data-[size=default]:h-9/h-10`,
    `group-data-horizontal/tabs:h-auto`).
  - `check-super-admin-tokens` ✗ — **hors périmètre** : ses deux échecs sont des cliquets à *redescendre*
    (« tableau de bord /app » 19 < 25, « assistants d'onboarding » 0 < 24) sur des fichiers d'autres
    groupes ; aucun échec sur `super-admin`.
  - `check-status-badge-unique` ✗ — **hors périmètre** :
    `components/announcements/GlobalAnnouncementBanner.tsx:14,15` (table de tons en dur).
- Détecteur impeccable : `node …/impeccable/scripts/detect.mjs --json <les 46 fichiers>` → `[]` (0 trouvaille).
- i18n : toutes les clés passées par `$S/i18n-set.mjs` en fr/en/wo (liste dans les sections) ; aucune
  édition directe de `src/messages/*.json`.
- Chrome du port 9348 tué en fin de passe.
