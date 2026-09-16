# Revue design — G console d'administration d'agence (2026-09-16)

**Verdict : Approve** — toutes les pages du périmètre sont corrigées et contre-mesurées, sans débordement de 360 à 1366 (document et `<main>`), ni erreur console, ni régression à 1366 ; collisions C1-C7 du groupe H traitées dans `components/billing` et `components/kyc` ; le reste relève d'autres groupes (Collisions).
Pages couvertes : 15/15 (13 routes, plus 2 redirections relevées) · Corrections : 29 fichiers (28 composants + 1 test), plus 16 clés i18n via `i18n-set` · Collisions : 6 · Non mesuré : abonnement actif et reversements remplis (`/admin/agency/billing`), file de modération remplie — il faudrait écrire en base

> Note de banc : le premier relevé (≈ 19:00) a été pris sur `127.0.0.1:3000`, origine que le CORS
> de l'API refuse (`FRONTEND_URL=http://localhost:3000`) — toutes les requêtes client vers Laravel
> y échouaient (« Compte indisponible », « Impossible de charger le journal d'audit », « La
> connexion au serveur a échoué » sur `/admin/finances`). Ces erreurs sont un artefact du banc,
> **pas** des défauts produit ; le relevé a été repris sur `localhost:3000` une fois la sonde
> corrigée. Les mesures de débordement (0 partout) ne dépendent pas de ce point.
>
> Les pages de la coque défilent dans `<main class="overflow-y-auto">`, pas dans le document :
> `--full` rend le seul viewport. Les captures de revue sont donc prises avec `--height 2200`
> (dispositif `$S/g/run.sh`), les mesures aux hauteurs par défaut.

## Pages

### /admin — agency_admin
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ — aucun débordement ; défauts visuels à 390/768/1366.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/dashboard/admin/AgencyKpis.tsx:26` | `grid-cols-2 md:grid-cols-3 xl:grid-cols-6` | `grid-flow-row-dense grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6`, montants en `col-span-2 lg:col-span-1` | À 768 (464 px utiles, TCK-505) trois tuiles de 140 px : « 132 693 386 F » touchait la tuile voisine ; à 1366 et 390 le montant des impayés se cassait entre « F » et « CFA » |
| MEDIUM | `components/dashboard/admin/AgencyActivityFeed.tsx` | libellé d'action à droite en `text-xs`, cible 16 px de haut, cassé sur 2 lignes à 390 | ligne entière = lien (`min-h-11`), libellé d'action dès `sm`, chevron dessous — même grammaire qu'`AgencyQueues` | cible < 24 px (sonde `lt24`), titre écrasé à 390, deux grammaires différentes pour deux blocs voisins |
| LOW | `components/dashboard/admin/AgencyActivityFeed.tsx` | compte en chiffres proportionnels | `tabular-nums` | principe 9 |
| LOW | `components/dashboard/admin/AgencyRevenueSnapshot.tsx:62` | en-tête `flex justify-between` sans retour | `flex-wrap gap-x-4 gap-y-1`, total `whitespace-nowrap tabular-nums` | à 390, titre et total se cassaient chacun sur deux lignes côte à côte |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. Preuve de version : `grid-flow-row-dense` lu dans le DOM.

### /admin/agency — agency_admin
Relevé avant : 360 ✓ (0) · 390 ✓ · 768 ✓ (mais libellés cassés, champs désalignés) · 1024 ✓ · 1366 ✓

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin-agency/AgencyConfigForm.tsx:187,222,305` | `md:grid-cols-2` / `md:grid-cols-3` | `lg:grid-cols-2` / `lg:grid-cols-3` | À 768 la carte n'a que ~416 px : « Identifiant URL (non modifiable) » et « Commission par défaut (%) » passaient sur deux lignes et décalaient verticalement les champs de la rangée (règle TCK-505) |
| MEDIUM | `components/admin-agency/AgencyConfigForm.tsx:196` | `<input>` natif `h-9 rounded-md` | primitive `<Input disabled readOnly>` | deux hauteurs et deux rayons sur la même rangée que `FormInput` (`h-8 rounded-lg`) ; guideline « toujours préférer un composant `ui/` » |
| MEDIUM | `components/admin-agency/AgencyConfigForm.tsx:340` | seule la case 13×16 px et le titre sont cliquables | tout l'encadré cliquable (`after:absolute after:inset-0` sur le libellé), survol `hover:bg-muted/40`, aide reliée par `aria-describedby`, `text-pretty` | cible < 24 px (sonde) ; le nom accessible reste le seul titre |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. Preuve : `#moderation_required-hint` présent.

### /admin/agency/billing — agency_admin
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0). État vide seul atteignable (aucun abonnement, aucun reversement pour Dakar Immo) ; l'état rempli est **non mesuré** (il faudrait écrire en base).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/billing/SubscriptionSummary.tsx:17` | `<Card>` + phrase grise « Aucun abonnement actif. » | `<EmptyState>` (icône, titre, description neuve `billing.subscription.noneDescription`) | guideline « un seul composant rend les états vides » ; la page entière n'était que deux boîtes de texte gris |
| MEDIUM | `components/billing/PayoutTable.tsx:90` | idem pour « Aucun reversement… » | `<EmptyState icon={Banknote}>` | idem — ⚠ composant partagé avec `/super-admin/payouts` (groupe H) |
| MEDIUM | `components/billing/SubscriptionSummary.tsx:33` | `<Badge>{subscription.status}</Badge>` — valeur d'enum brute (`past_due`) | `StatusBadge` + `billing.subscription.status.*` (fr/en/wo) et une table de tons | texte non traduit affiché à l'utilisateur, couleur primaire pour un statut |
| MEDIUM | `components/billing/AgencyBillingClient.tsx:16` | `Card` en `text-destructive` sans reprise | `<ErrorState onRetry>` | guideline « états d'erreur inline » ; aucune voie de reprise |
| LOW | `components/billing/PayoutTable.tsx` | colonne « Agence #1 » sur la console de l'agence elle-même ; montants et dates cassables | prop `hideAgency` (posée par `AgencyPayoutsClient`), `whitespace-nowrap tabular-nums` sur période, montants, date | colonne sans information ; alignement des chiffres |
| LOW | `components/billing/SubscriptionSummary.tsx` | `md:grid-cols-3` ; chiffres proportionnels | `sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3`, `tabular-nums` | TCK-505 |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. Preuve : `EmptyState` rendu à la place de la `Card`.

### /admin/agency/kyc — agency_admin
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0) — dossier `pending`, trois pièces manquantes.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/kyc/kyc-components.tsx:122` | `<Input type="file">` visible : le navigateur écrit « Choose File · No file chosen » **en anglais** dans une interface française | champ natif conservé en `sr-only`, bouton `outline` « Choisir un fichier » (nom du fichier choisi à sa place, `aria-label` par pièce), formats acceptés en aide | texte non localisable affiché, contrôle natif hors charte |
| MEDIUM | `components/kyc/kyc-components.tsx:113` | `Badge outline` « Manquant » / `secondary` « Fourni » | `StatusBadge` `attention` / `success` | vocabulaire de pastilles unique (TCK-358) ; « manquant » est une action attendue |
| MEDIUM | `components/kyc/kyc-components.tsx:110` | cartes bordées dans une carte bordée, `md:grid-cols-[1fr_auto]` | aplats `bg-muted/40`, grille dès `lg` | cartes imbriquées ; TCK-505 |
| LOW | `components/kyc/kyc-components.tsx` | « Ajouter » en `outline` à côté du nouveau bouton de choix ; `mr-2` sur les icônes de boutons qui ont déjà `gap-1.5` | « Ajouter » en `secondary`, marges retirées (4 boutons, dont ceux de `KycReviewPanel`) | double espacement icône/texte |
| LOW | `messages/*.json` `kyc.timeline.title` | « Timeline KYC » | « Suivi du dossier KYC » (`--force`, en/wo alignés) | anglicisme dans un titre ; clarification de micro-copie |
| LOW | `components/kyc/kyc-components.tsx:57` | étapes bordées `md:grid-cols-3` | aplats, `sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3`, dates `tabular-nums` | idem |

⚠ `KycDossierTimeline` et `KycReviewPanel` sont aussi montés par `/super-admin/agencies/[id]` (groupe H) : vérifié au contre-relevé.

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. Preuve : `#kyc-file-rccm` en `sr-only`. Vérifié aussi `/super-admin/agencies/1` (super_admin, 390 et 1366) : 0 débordement, timeline en aplats, `KycReviewPanel` intact.

### /admin/audit — agency_admin
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0). Journal vide sur la période par défaut.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/AuditTrail.tsx:213-305` | contrôles de 36 / 32 / 40 / 28 px alignés par le bas (mesuré) → libellés sur quatre lignes différentes | tous à 40 px (`buttonClassName="h-10"`, `data-[size=default]:h-10`, bouton `h-10`) | alignement de la barre de filtres ; cible ≥ 40 px en bureau dense |
| MEDIUM | `components/admin/AuditTrail.tsx:283` | recherche `w-56` fixe sur mobile | `w-full sm:w-56`, conteneur `w-full sm:w-auto` | champ tronqué à 390 alors que la ligne était libre |
| LOW | `components/admin/AuditTrail.tsx:304` | export en bouton primaire `sm` | `outline` | un seul CTA principal par écran ; l'export est secondaire |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. Preuve : recherche en `sm:w-56`.

### /admin/finances — agency_admin (onglets Encaissements et Impayés)
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0), mais tables écrasées à 768.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/finances/OverduePaymentsTable.tsx` | chaque cellule sur deux lignes à 768 (« LPY- / QOWGDC », « 595 395 F / CFA », « 5 août / 2026 ») | `whitespace-nowrap` (+ `tabular-nums` sur montants/dates) : la table défile dans son cadre | table illisible à la tablette |
| MEDIUM | `components/admin/finances/FinanceKpis.tsx` | `sm:grid-cols-2` → à 768, « 132 693 386 F / CFA » coupé, icône collée au libellé | montants en `md:col-span-2 lg:col-span-1`, icône `shrink-0`, `items-start gap-3`, `tabular-nums`, classes composées par `cn()` | TCK-505 ; même arrangement que `/admin` |
| LOW | `components/admin/finances/AdminFinancesTabs.tsx` | `TabsList` au ras du bord à 360 ; `mr-1` en plus du `gap` des boutons | ruban dans un conteneur `overflow-x-auto`, marges retirées, boutons en `flex-wrap` | débordement latent ; double espacement |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. (onglets Encaissements et `?tab=impayes`). Preuves : `md:col-span-2` sur les KPI, `whitespace-nowrap` dans la table des impayés.

### /admin/moderation/properties — agency_admin (et /admin/moderation — super_admin)
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0). File vide (état rempli **non mesuré** : aucun bien en attente en base). `/admin/moderation` redirige l'admin d'agence vers `/admin` (attendu : réservé super_admin).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/PropertyModerationWorkspace.tsx:83`, `components/admin/ModerationWorkspace.tsx:153` | spinner centré dans une carte pendant le chargement | squelette file + détail à la forme de l'écran, libellé conservé en `sr-only` dans un `role="status"` | charte : pas de spinner hors première charge ; pas de saut de mise en page à l'arrivée des données |
| MEDIUM | idem | erreur en `div` rouge sans reprise | `<ErrorState onRetry={refetch}>` | guideline « états d'erreur inline » |
| LOW | `PropertyModerationWorkspace.tsx:73` | recherche `w-72` à 390 | `w-full sm:w-72` | champ tronqué sur mobile |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. `/admin/moderation` en super_admin : idem ; en agency_admin : redirection vers `/admin` confirmée.

### /admin/properties — agency_admin
Relevé : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0). La page **ré-exporte** `app/(dashboard)/app/properties/(liste)/page.tsx` (groupe D) : aucun fichier de rendu n'est dans le périmètre G. Rien corrigé ici ; les vignettes vides viennent de la base sans médias (`SEED_DOWNLOAD_MEDIA=false`), pas d'un défaut.

### /admin/roles — agency_admin
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ selon `docOverflow` — **mais la sonde ne voit pas ce défaut** : la coque défile dans `<main class="overflow-y-auto">` (donc `overflow-x: auto`), et à 390 la colonne de rôles mesurait 378 px dans une grille de 358 px (mesuré : `NAV 16-394`), soit un défilement horizontal **dans `<main>`**, invisible pour `document.scrollWidth`.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/admin/roles/AgencyRolesConsole.tsx:83,124` | `grid gap-6 lg:grid-cols-[320px_1fr]` (piste implicite `auto` sous `lg`, `1fr` = `minmax(auto,1fr)` au-dessus) | `grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]` | la piste prenait la largeur min-content de la matrice : cartes de rôle coupées au bord droit, défilement horizontal de toute la zone à 360/390. Contre-mesure : `main.scrollWidth == clientWidth` à 390 |
| MEDIUM | `components/admin/roles/CapabilityMatrix.tsx:160` | ligne `flex` sans retour : la pastille « Réservé à la plateforme » sortait de la carte à 360 (right = 374) | `flex-wrap gap-x-3 gap-y-1`, texte `min-w-0 flex-1 basis-40`, code `break-all` | débordement |
| MEDIUM | `components/admin/roles/CapabilityMatrix.tsx:160` | `opacity-60` sur toute ligne en lecture seule ou réservée — un rôle système (lecture seule) rendait **toute** la matrice à 60 %, le code en `text-muted-foreground` passait sous 4,5:1 | plus d'opacité ; la case désactivée porte l'état, le libellé d'une capacité réservée passe en `text-muted-foreground` | contraste WCAG 1.4.3 |
| MEDIUM | `messages/*.json` `admin.roles.capabilities.team.delegate_role` | clé absente : la ligne affichait `team.delegate_role` comme libellé | « Déléguer un rôle » / « Delegate a role » / « Delege wàll » | texte technique affiché à l'utilisateur (capacité ajoutée par TCK-395 sans libellé) |
| LOW | `CapabilityMatrix.tsx:105` | deux `<button>` faits main de 24 px | `Button variant="outline" size="sm"` | charte (primitives `ui/`) ; cible |
| LOW | `AgencyRolesList.tsx`, `AgencyRolesConsole.tsx` | `mr-1` sur les icônes de boutons qui ont déjà un `gap` | retiré | double espacement |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. À 360/390 : `main.scrollWidth == clientWidth` (défaut HIGH fermé), pastille « Réservé » dans la carte. Preuve : `minmax(0,1fr)` lu.

### /admin/team (et /admin/users → 308 vers /admin/team) — agency_admin, dialogue « Inviter un agent » ouvert
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0 ; la table défile dans son cadre). Dialogue : 358×635 à 390, 384×523 à 768/1366, pas de défilement interne.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin/users/AdminUsersTable.tsx:127-230` | cellules alignées en haut (défaut `DataTable`) à côté d'un avatar de 36 px : e-mail, statut, dates 6 px au-dessus du nom ; noms cassés sur 2-3 lignes à 390 (« Admin / Dakar / Immo ») | `align-middle` sur les 7 colonnes, `whitespace-nowrap` sur membre, e-mail, dates ; `tabular-nums` sur les dates et le total | alignement de ligne ; lisibilité mobile (la table défilait déjà) |
| MEDIUM | `components/admin/InviteMemberButton.tsx:59` | à 1366, « Inviter » décroché AU-DESSUS de « Ajouter un compte existant » | `lg:flex-nowrap` ; `mr-1` retirés (le `Button` a déjà `gap-1.5`) | les deux actions de l'en-tête se lisaient comme deux blocs |
| LOW | `components/admin/InviteAgentDialog.tsx` | `Select` 32 px sous des champs de 36 px ; aucun état d'erreur visuel sur les champs | `data-[size=default]:h-9` ; `aria-invalid` posé, `aria-invalid:border-destructive`, anneau `focus-visible:border-ring ring-3` comme la primitive | hauteurs cohérentes, erreur visible autrement qu'au texte |

Note : la colonne « Rôle » affiche « — » pendant ~1 s, le temps que `role-assignments` réponde (mesuré : les rôles arrivent ensuite) — pas un défaut.

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. Dialogue ouvert : 328×659 à 360, 358×659 à 390, 384×527 à partir de 768, sans défilement interne ; champs à 36 px et `Select` aligné. `/admin/users` → `/admin/team`.

### /admin/settings — super_admin (l'admin d'agence est renvoyé sur `/admin`, attendu)
Relevé avant : 360 ✗ (colonne valeur écrasée, `narrowText` ×4) · 390 ✗ (idem) · 768 ✗ (idem) · 1024 ✓ · 1366 ✓

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin-settings/SettingsManager.tsx:157-175` | à 390 la colonne VALEUR tombait à ~40 px : le JSON `branding` s'écrivait quatre caractères par ligne (15 lignes par réglage) | `min-w-64` sur la valeur, `whitespace-nowrap` sur clé et portée : la table défile dans son cadre | texte écrasé (sonde `narrowText`) |
| LOW | `components/admin-settings/SettingsManager.tsx:254` | filtre de portée actif en terracotta plein, comme la navigation au-dessus et le CTA à droite | aplat doux `border-primary/40 bg-primary/10 text-primary`, anneau de focus plein, `cn()` | trois pastilles pleines pour trois rôles ; accent réservé à l'action et à la navigation |
| LOW | `components/admin-settings/SettingsTabs.tsx:51` | onglet actif sans bordure (2 px plus petit que ses voisins), pas d'anneau de focus déclaré | `border` sur les deux états, `transition-colors`, anneau plein | saut de mise en page ; focus visible |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. (super_admin) `narrowText` 0 : la colonne valeur tient ses 256 px et la table défile dans son cadre. Preuve : `min-w-64`. En agency_admin : redirection vers `/admin` confirmée.

### /admin/settings/integrations — agency_admin et super_admin
Relevé avant : agency_admin 360-1366 ✓ ; super_admin 768 ✗ (`narrowText` « Active • dernier test … » dans une carte de 200 px).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/admin-settings/IntegrationsManager.tsx:234` | `md:grid-cols-2` | `lg:grid-cols-2` | TCK-505 : deux cartes de 220 px à 768 |
| MEDIUM | `components/admin-settings/IntegrationsManager.tsx:291` | résultat de test réussi en `text-accent` | `text-success` | TCK-450 : « ça a marché » se dit `--success`, l'accent sage est réservé au *featured* |
| LOW | idem `:240-320` | bordure `border-input` (couleur de champ), icône compressible, suppression en noir | `border-border`, `shrink-0`/`min-w-0`, `tabular-nums text-pretty` sur la ligne d'état, corbeille `text-muted-foreground hover:text-destructive` | cohérence des jetons ; l'action destructive se signale au survol |

Contre-relevé (localhost, 360/390/768/1024/1366) : docOverflow 0 et `main.scrollWidth − clientWidth` 0 aux cinq largeurs, 0 erreur console, captures 390/768/1366 relues, 1366 sans régression. (super_admin) `narrowText` 0 à 768. Preuve : `lg:grid-cols-2`.

### /admin/settings/tags — agency_admin et super_admin
Redirige les DEUX rôles vers `/admin?notice=tags-platform-managed` (les étiquettes se gèrent dans `/super-admin`, TCK-370). L'avis est rendu par `AdminNotice` ; rien à corriger.

### Pages super-admin (groupe H) qui montent un composant modifié
`grep -rl` → `/super-admin/payouts` (`PayoutTable`), `/super-admin/plans` (billing), `/super-admin/agencies/[id]` (`kyc-components`). Toutes trois relevées en super_admin à 390 et 1366 : docOverflow 0, `<main>` sans défilement horizontal, 0 erreur. `PayoutTable` garde la colonne Agence côté plateforme (`hideAgency` vaut `false` par défaut) et rend désormais l'`EmptyState`.

### Collisions reçues du groupe H — traitées (fichiers G montés par `/super-admin/*`)
Relevé en super_admin sur `/super-admin/payouts`, `/super-admin/plans`, `/super-admin/kyc` et `/super-admin/agencies/1`, plus `/admin/agency/kyc` en agency_admin.

| Réf. | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| C1 | `components/billing/AdminPayoutsClient.tsx:63` | `md:grid-cols-[180px_180px_1fr]` | `sm:grid-cols-2 lg:grid-cols-[260px_200px_1fr]`, compteur en `sm:col-span-2 lg:col-span-1 text-pretty tabular-nums` | à 768, le compteur était écrasé (TCK-505) |
| C2 | idem `:64` et `PayoutCloseDialog.tsx:63` | `Input type="number"` : identifiant d'agence tapé de mémoire | `AgencyCombobox` (import depuis `components/admin/super`, **sans modifier ce fichier**), dans le filtre comme dans la clôture | TCK-363 : même sélecteur que `/users` et `/moderation` |
| C3 | `AdminPayoutsClient.tsx:76` | `SelectTrigger className="h-9"`, sans effet à l'époque (la base était sous `data-[size=default]:h-8`) | `w-full h-10` : tous les contrôles de la barre à 40 px. La primitive a été corrigée ensuite par A (`h-8` nu) : la surcharge nue suffit désormais, donc `AuditTrail` (×2) et `InviteAgentDialog` sont aussi repassés de `data-[size=default]:h-*` à `h-*` nu | alignement des hauteurs |
| C3 | `PayoutCloseDialog.tsx:57` | `md:grid-cols-[160px_180px_auto]` : date tronquée (« 16 septembre 2… ») et bouton étiré sur toute la piste | empilé sous `lg` ; au-dessus `lg:grid-cols-[200px_260px_auto] lg:justify-start` ; date et bouton en `h-10` ; `mr-2` retiré du spinner | troncature ; un CTA de 600 px de large |
| C3 | état vide des reversements | texte simple | déjà traité par `PayoutTable` → `EmptyState` (voir /admin/agency/billing) | — |
| C4 | `AdminPlansClient.tsx:87-90` | 4 `Input` sans nom accessible sur chaque plan existant | `aria-label` : `billing.plans.fields.{code,label,price,fee}` (fr/en/wo) | WCAG 4.1.2 |
| C5 | `AdminPlansClient.tsx:45-48` | placeholders seuls (« code », « fee % ») | mêmes `aria-label` ; placeholder `feePlaceholder` passé de « fee % » à « commission % » (`--force`, en inchangé) ; `mr-2` retirés des 3 icônes | nom accessible ; anglicisme ; double espacement. La structure DOM est conservée (le test TCK-505 lit `input.parentElement`) : des libellés visibles demanderaient d'envelopper chaque champ et de réécrire ce test, ce qui est écarté |
| C7 | `components/kyc/kyc-components.tsx:57` | `sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3` (réglé sur l'écran) | `@container` sur la carte + `@md:grid-cols-3` | la même carte vit en pleine largeur (`/admin/agency/kyc`) et dans un panneau de ~550 px (`/super-admin/agencies/[id]`) |
| C7 | idem `:225` (`KycReviewPanel`) | `md:grid-cols-3` dans un panneau de 360-420 px : « Pièce dirigeant » sur deux lignes | `@container` + `grid gap-2 @xl:grid-cols-3` (liste empilée sous 36rem ; `sm:grid-cols-2` testé d'abord : la 3ᵉ pièce restait seule sur sa ligne) ; pièces en aplats `bg-muted/40`, icône `shrink-0` | débordement de texte ; cartes imbriquées |
| + | idem `:231` | coche « fournie » en `text-accent` ; icône seule porteuse du sens (`aria-hidden`) ; motif de rejet sans nom | `text-success` (TCK-450), texte `sr-only` « Fourni » / « Manquant », `aria-label` sur le `Textarea` | l'état n'était pas annoncé aux lecteurs d'écran |

Contre-relevé (360/390/768/1024/1366 selon la page) : docOverflow 0, `main` sans défilement horizontal, 0 erreur console, sur les quatre pages super-admin et sur `/admin/agency/kyc`. Preuves lues dans le DOM :
- `/super-admin/payouts` : `[role=combobox]` et `lg:grid-cols-[260px_200px_1fr]` ;
- `/super-admin/plans` : 12 `input[aria-label]` ;
- `/super-admin/agencies/1` : `@md:grid-cols-3` et `@xl:grid-cols-3`.

Captures 768 et 1366 relues : la clôture est empilée à 768 et en ligne à 1366 (bouton à sa taille) ; le panneau d'instruction liste les trois pièces sans retour à la ligne ; `/admin/agency/kyc` à 1366 est inchangé (trois étapes en ligne). `/super-admin/kyc` (liste) ne monte pas ces composants tant qu'aucun dossier n'est ouvert.

## Collisions (hors périmètre — NON appliquées)
| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `components/charts/BarChart.tsx:8,142,200` | `PADDING.left: 40` ; libellés en `text-[10px]` dans un SVG mis à l'échelle | marge gauche calculée sur le libellé le plus long (ou montants abrégés « 1,3 M ») ; taille ≥ 12 px après mise à l'échelle | les libellés de l'axe Y sont rognés (« 0342 F » pour « 1 030 342 F ») et deviennent illisibles à 390 | `/admin` (revenus 12 mois), tout graphique en barres |
| `components/payments/PaymentsHistoryTable.tsx:134` | `<Badge variant=…>` « Payé » en primaire plein | `StatusBadge tone="success"` | vocabulaire unique des pastilles (TCK-358) ; un paiement réussi n'est pas un CTA terracotta | `/admin/finances` (Encaissements), `/app/payments` |
| `components/payments/PaymentsHistoryTable.tsx:113` | référence sans `whitespace-nowrap` | `whitespace-nowrap font-mono tabular-nums` | « BPY- / SS6P7R » cassé au tiret à 390 | idem |
| `components/console/DataTable.tsx:170` | `align-top whitespace-normal` par défaut ; en-têtes rendus au-dessus d'un `EmptyState` bordé en pointillés | `align-middle` par défaut ; vide rendu sans en-têtes ni seconde bordure | chaque table à avatar doit surcharger 7 colonnes (cf. `AdminUsersTable`) ; carte dans la carte à l'état vide | toutes les tables de console |
| `components/console/DebouncedSearchInput.tsx:129` | `h-10` fixe | hauteur alignée sur les autres contrôles (ou prop) | 40 px à côté de `Select`/`Input` à 32-36 px : barre de filtres désalignée (compensé dans `AuditTrail` en montant tout à 40) | `/admin/audit`, `/admin/moderation*`, listes de console |
| `components/admin/super/agency-detail.tsx:168` (groupe H) | `TabsList … flex-wrap` : « Transactions » passe seul sur une 2ᵉ ligne à 390 | ruban défilant (`overflow-x-auto`, `flex-nowrap`) | onglet orphelin sous la rangée | `/super-admin/agencies/[id]` |

Signalés par la sonde mais **déjà corrigés par un autre groupe** au moment du contre-relevé, donc retirés : `ui/input.tsx` (`max-sm:min-h-10` désormais présent), libellé « Bank Transfer » (rendu « Virement bancaire »), filtres de `PaymentsHistoryFilters` (grille 2/3/5 colonnes).

## Écartés
| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| `SettingsTabs` | masquer la navigation quand l'admin d'agence n'a qu'un onglet | les tests de `SettingsTabs` en fixent l'intention ; gain faible |
| `IntegrationsManager` | réécrire l'intro « Providers externes », redondante avec le titre | texte factuel, préservé (affinage, pas réécriture) |
| `FinanceKpis` | fusionner le style des tuiles avec `StatCard` | refonte, hors sujet |
| `CapabilityMatrix` | libellé « Déléguer temporairement » | la capacité n'est pas temporelle dans le code (TCK-395) : « Déléguer un rôle » est plus juste |
| `/admin/properties` | corriger la liste | ré-export de la page `/app` (groupe D) |
| Cibles `lt44` en bureau | monter toutes les commandes à 44 px | Operate : 40 px en bureau dense, et les cibles mobiles critiques (lignes d'activité, encadré de modération, boutons de dialogue à 40 px) sont traitées |

## Vérification
- `npx vitest run src/components/admin src/components/admin-agency src/components/admin-settings src/components/kyc src/components/billing src/components/dashboard/admin "src/app/(dashboard)/admin" --exclude "src/components/admin/super/**"` → **42 fichiers, 261 tests, verts** (relancé après C1-C7, même résultat ; plus `billing`/`kyc` seuls : 4 fichiers, 31 tests). `console-agence-a11y.test.tsx` a été adapté : il comptait 4 interactifs faits main dans la matrice, et 2 le sont devenus par la primitive `Button`. L'attente vaut maintenant 2, plus au moins 2 `[data-slot=button]` ; l'anneau plein reste porté par ces boutons (TCK-371).
- `npx eslint <29 fichiers>` → 0 erreur, 0 avertissement.
- `npx tsc --noEmit` (projet entier) → sortie 0, deux fois (avant et après C1-C7).
- `node scripts/check-app-tokens.mjs` 0 · `check-feedback-states.mjs` 0 · `check-destructive-contrast.mjs` 0 · `takussan-web/scripts/check-classes-emises.mjs` 0.
- `node scripts/check-super-admin-tokens.mjs` → **1**, hors périmètre G : deux cliquets à faire *descendre* (« tableau de bord /app » 18 < 25, « assistants d'onboarding » 0 < 24), gagnés par les groupes D/E/F et C ; la session d'intégration ajuste les chiffres.
- `node scripts/check-status-badge-unique.mjs` → 1 au premier passage (`components/announcements/GlobalAnnouncementBanner.tsx`, hors G), **0** au second, l'autre groupe ayant corrigé entre-temps. La table `STATUS_TONE` de `SubscriptionSummary` alimente `StatusBadge` et n'a jamais été signalée.
- `node …/impeccable/scripts/detect.mjs --json <26 fichiers>` → 0 trouvaille.
- i18n : 11 clés neuves posées par `i18n-set.mjs` (fr/en/wo) : `billing.subscription.status.{trialing,active,past_due,suspended,ended}`, `billing.subscription.noneDescription`, `kyc.uploader.{choose,replace,accepted,chooseAria}`, `admin.roles.capabilities.team.delegate_role` ; `kyc.timeline.title` réécrite avec `--force` ; puis `billing.plans.fields.{code,label,price,fee}` (neuves) et `billing.plans.feePlaceholder` (`--force`) — 16 au total.

### Remesure finale après la correction de la primitive `Select` par A (21:50)
`probe.mjs --widths 390,768,1366` avec une évaluation qui lit les hauteurs réelles :

| Page (rôle) | docOverflow / `main` | Hauteurs lues |
|---|---|---|
| `/super-admin/payouts` (super_admin) | 0 / 0 aux trois largeurs | `select-trigger` [40] ; `combobox` [40, 40, 40] |
| `/super-admin/plans` (super_admin) | 0 / 0 | 12 `input[aria-label]` (4 pour la création, 4 par plan existant) |
| `/admin/audit` (agency_admin) | 0 / 0 | `select-trigger` [40, 40] ; `combobox` [40, 40] |

Après ce passage : eslint des 3 fichiers → 0 ; `vitest run src/components/admin src/components/billing "src/app/(dashboard)/admin"` → 34 fichiers, 225 tests, verts ; `check-classes-emises` → 0.
