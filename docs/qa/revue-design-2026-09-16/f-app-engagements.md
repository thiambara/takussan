# Revue design — F · `/app` engagements, finances, profil (2026-09-16)

**Verdict : Approve** — quatre pages tombaient en frontière d'erreur ou cassaient à l'hydratation (détail de document, carnet prestataires, préférences de notifications) ou cachaient des données (pagination de maintenance) : toutes corrigées et remesurées ; le reste est de l'affinage, sans débordement à aucune largeur.
Pages couvertes : 19/19 · Corrections : 40 fichiers (dont 2 tests) + 11 clés i18n par `i18n-set.mjs` · Collisions : 8 · Non mesuré : `/app/payments/return` en succès/échec (exige une transaction), suppression de document et contestation d'état des lieux jusqu'au bout (écriture en base), `/app/maintenance/providers` pour un gestionnaire habilité (aucun compte de mesure ne l'est)

Mode impeccable : **Operate**. Banc : `probe.mjs --port 9346`, captures dans `$S/shots/f/<tag>/`.

## Incident d'environnement (relevé avant toute revue)

Au premier passage, `/app/leases` affichait son `ErrorState` (« Impossible de charger les baux ») aux
cinq largeurs. Ce n'est pas un défaut de la page : la page était servie sur `127.0.0.1:3000` alors
que l'API n'autorise que `FRONTEND_URL=http://localhost:3000` en CORS. Mesuré : aucun en-tête
`Access-Control-Allow-Origin` dans la réponse, et `fetch` lève `TypeError: Failed to fetch` dans la
page. Signalé à la session principale, qui a basculé le banc sur `localhost:3000`. Toutes les
mesures ci-dessous ont été prises après cette bascule.

## Pages

### `/app/leases` — agent, locataire, propriétaire
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ — aucune table coupée, aucun
texte écrasé. Les seules cibles < 24 px relevées sont les `input` cachés de base-ui (1×1, faux positif).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/leases/LeasesList.tsx` (filtres) | deux `SelectTrigger` à largeur de contenu dans une grille à 2 colonnes : le second flottait au milieu de la carte à 1366 | `className="w-full"` (+ `min-w-0` sur celui des biens), carte `p-3` | alignement : les deux champs occupent leur colonne, comme dans `DocumentsFilters` |
| MEDIUM | `LeasesList.tsx` (`LeaseRow`) | ligne = référence + dates, alors que `property` est déjà chargé par `include=property` et jamais montré | titre du bien en seconde ligne (`truncate`) | Operate : on reconnaît un bail à son bien, pas à `LS-EC-S4HITT` ; aucune requête de plus |
| MEDIUM | `LeaseRow` (montant) | montant sans `tabular-nums`, colonne compressible | `shrink-0` + `whitespace-nowrap tabular-nums` | montants alignés et jamais coupés (TCK-505 #5) |
| LOW | `LeaseRow` (lien) | `transition-shadow hover:shadow-sm`, aucun `focus-visible` | `transition-[box-shadow,border-color]`, bordure au survol, anneau `focus-visible` | état clavier visible |
| LOW | `LeasesList.tsx` (chargement) | `div animate-pulse bg-card` (carte blanche sur fond lin, quasi invisible) | `<Skeleton>` (`bg-muted`) + `aria-busy` | design-guidelines § Loading |

### `/app/leases/<id>` — agent (498 actif, 503 brouillon), propriétaire (503), locataire (533)
Relevé avant : 360 ✓ · 390 ✓ (l'échéancier défile dans son conteneur, comme voulu) · 768 **✗ visuel** :
les trois tuiles passent en 3 colonnes dans 464 px et coupent « 500 000 F / CFA » sur deux lignes
et la durée sur deux · 1024 ✓ · 1366 ✓. Lien retour 105×16 (< 24 px) à toutes les largeurs.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/leases/LeaseDetail.tsx` (tuiles) | `sm:grid-cols-3` | `sm:grid-cols-2 lg:grid-cols-3`, caution `sm:col-span-2 lg:col-span-1`, montants `whitespace-nowrap tabular-nums`, `p-4 sm:p-5` | `md` n'est pas bureau (TCK-505) ; un montant ne se coupe pas |
| MEDIUM | `LeaseDetail.tsx` (lien retour) | `text-xs` 16 px de haut, `hover:text-muted-foreground` (aucun changement au survol), flèche en glyphe « ← » | `inline-flex min-h-8` + `ArrowLeft` Lucide, `hover:text-foreground`, anneau `focus-visible` | cible ≥ 24 px, état de survol réel, icônes Lucide uniquement |
| MEDIUM | `LeaseDetail.tsx` (barre d'actions) | `AddDocumentButton` en taille `sm` (28 px) parmi des boutons `default` (32 px) | `size="default"` | une rangée de boutons = une hauteur |
| MEDIUM | `LeaseDetail.tsx` (locataire) | lien « Télécharger le contrat PDF » recopié à la main (`h-9 rounded-md`) | `buttonVariants({ variant: 'outline' })` | vocabulaire de bouton unique |
| MEDIUM | `LeaseDetail.tsx` (`h1`, `h2`) | `h1` en DM Sans, `h2` en `text-sm` | `font-display tracking-tight text-balance` ; `h2` `font-display text-base` | guidelines : `font-display` pour h1-h3 ; `PageHeader` le fait déjà sur la liste |
| LOW | `LeaseDetail.tsx` (clauses) | paragraphe pleine largeur | `max-w-prose leading-relaxed text-pretty` | mesure de lecture |
| LOW | `LeaseDetail.tsx` (chargement), badges | `div animate-pulse bg-card` ; rangée de badges sans `flex-wrap` | `<Skeleton>` ; `flex-wrap` | cohérence, petit écran |
| MEDIUM | `components/leases/LeaseSchedule.tsx` | montants alignés à gauche, chiffres proportionnels ; cellule d'action pouvant passer à la ligne | colonne montant `text-right`, table `tabular-nums`, cellule d'action `whitespace-nowrap`, `<Skeleton>` | table financière (TCK-505 #5) ; le défilement dans le conteneur (`overflow-x-auto`) est conservé |


### `/app/documents` — agent (34 documents), locataire (vide)
Relevé avant : 360 ✓ (docOverflow 0) mais **✗ visuel** · 390 **✗** (`narrowText` : la méta
« — · 14 mai 2026, 00:00 · Bail #47 » dans une colonne de ~35 px, nom réduit à « C… ») · 768 **✗**
(le champ de recherche réduit à 80 px, « Recher ») · 1024 ✓ · 1366 ✓.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/documents/DocumentsLibrary.tsx` (`DocumentRow`) | `flex-wrap` avec un bloc texte `flex-1` de base 0 : les actions ne passaient jamais à la ligne, et le texte s'écrasait sur ~35 px à 390 | bloc icône + texte `flex-1 basis-60 min-w-0` ; les actions (`shrink-0 flex-wrap`) passent dessous quand il manque 15 rem ; `title` sur le nom tronqué | texte illisible sur mobile = défaut de responsive (au moins MEDIUM) sur l'écran principal de la section |
| HIGH | `DocumentsLibrary.tsx` (suppression) | la corbeille supprimait **immédiatement**, sans confirmation ; toutes les corbeilles se désactivaient pendant une suppression | dialogue de confirmation (`Dialog` + `DialogFooter`, bouton `destructive`, « Suppression… ») ; seule la ligne concernée se désactive | design-guidelines § « Confirmations destructives » ; perte de données sur un clic |
| MEDIUM | `components/documents/DocumentsFilters.tsx` | `sm:grid-cols-[minmax(0,1fr)_180px_180px]` dès 640 px (464 px utiles à 768) | `sm:grid-cols-2` (recherche sur toute la ligne) puis la grille à 3 colonnes dès `lg` | TCK-505 : les colonnes se posent dès `lg` dans la coque |
| MEDIUM | `DocumentRow` (méta) | taille inconnue rendue « — · » en tête de ligne | seules les parties connues, jointes par « · », `tabular-nums` | bruit visuel sur 34 lignes sur 34 en démo |
| LOW | `DocumentsLibrary.tsx` (pagination) | « Page 1 sur 1 · 0 résultats » et deux boutons inertes sous un état vide | pagination rendue seulement si `last_page > 1` | le compte est déjà affiché en tête |
| LOW | `DocumentsLibrary.tsx` (chargement, `h2`) | `div animate-pulse bg-card` ; titres de groupe en DM Sans | `<Skeleton>` + `aria-busy` ; `font-display` | guidelines |

Clés i18n ajoutées (fr/en/wo) : `documents.library.delete_confirm_title`, `documents.library.delete_confirm_body`, `documents.library.deleting`.

### `/app/documents/<id>` — agent (39)
Relevé avant : **✗ HIGH aux 5 largeurs** — la console porte `In HTML, <button> cannot be a descendant
of <button>. This will cause a hydration error.`, et à 1366 la page tombe dans la frontière d'erreur
du tableau de bord (`h1` = « Une erreur est survenue », console `[dashboard] erreur non rattrapée`).
À 360-1024, la capture ne montre que « Chargement du document… ».
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/documents/DocumentVersionsList.tsx` (en-tête d'accordéon) | le bouton « Nouvelle version » était rendu **dans** le `<button>` d'accordéon (avec un `stopPropagation`) | les deux boutons deviennent frères dans une rangée `flex` ; « Nouvelle version » passe sur `<Button size="sm">` ; bouton d'accordéon `min-h-11`, anneau `focus-visible` | HTML invalide → erreur d'hydratation → page de détail inutilisable |
| MEDIUM | `components/documents/DocumentDetailClient.tsx` (type) | `document.type.replace(/_/g,' ')` + `capitalize` : « Lease contract » affiché en français | libellé `documents.types.*` (valeur brute seulement si inconnue) | principe 5 : le front possède le texte |
| MEDIUM | `DocumentDetailClient.tsx`, `DocumentVersionsList.tsx` (dates) | `toLocaleDateString('fr-FR')` / `toLocaleString('fr-FR')` en dur | `formatDate` / `formatDateTime` de `@/lib/format` avec la locale active (fuseau Dakar) | i18n |
| MEDIUM | `DocumentDetailClient.tsx` (états) | chargement = phrase centrée ; erreur = texte rouge sans reprise | `<Skeleton>` (+ libellé `sr-only`) ; `<ErrorState>` avec « Réessayer » | guidelines § Loading / erreurs |
| LOW | `DocumentDetailClient.tsx` (carte, `h1`, lien retour) | `border` + `shadow-sm` (carte fantôme) ; `h1` DM Sans sans césure ; lien retour sans anneau | bordure seule ; `font-display text-balance break-words` ; en-tête `flex-wrap` et pastille `shrink-0 whitespace-nowrap` ; `min-h-8` + anneau | une élévation par surface ; nom long sur mobile |
| LOW | `DocumentVersionsList.tsx` (`VersionRow`) | nom de fichier `truncate` sans `min-w-0` (ne tronquait pas) ; actions icônes 32 px | `min-w-0` + `title` ; actions 36 px avec anneau ; `tabular-nums` | débordement potentiel, cible |

### `/app/inventories` — agent
Relevé avant : 360-1366 ✓ (docOverflow 0). Visuel : filtres à largeur de contenu dans des colonnes de
224 px, bouton de création isolé à droite sur mobile, lignes en `shadow-sm` sans bordure (les listes
voisines ont une bordure).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/inventory/InventoryList.tsx` (barre d'outils) | `w-56` fixes, `SelectTrigger` à largeur de contenu, CTA `ml-auto` seul sur sa ligne à 390 | filtres côte à côte sur mobile (`flex-1 basis-36`), `w-56` dès `sm` ; triggers `w-full` ; CTA pleine largeur sur mobile, `ml-auto` dès `sm` | usage du pouce, alignement |
| MEDIUM | `InventoryList.tsx` (lignes) | `li` `shadow-sm` + `hover:bg-muted`, lien sans anneau, rupture en colonnes à `md` | même carte que les baux (bordure, ombre au survol, anneau `focus-visible`), rupture à `sm` ; référence du bail en gris | cohérence entre listes voisines, clavier |
| LOW | `InventoryList.tsx` (pagination) | `<button>` natifs `disabled:opacity-30`, chevrons sans `aria-hidden` | `<Button variant="outline" size="sm">`, `tabular-nums` | guidelines : pas de `<button>` natif |

### `/app/inventories/<id>` — agent (89, signé)
Relevé avant : 360-1366 ✓ (docOverflow 0) ; liens « Voir le bien » / référence de 16 px (liens en ligne, exemptés).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/(dashboard)/app/inventories/[id]/page.tsx` | `PageHeader` et « Retour » dans un `flex justify-between` maison | « Retour » passé en `actions` de `PageHeader` (+ `ArrowLeft`) | l'en-tête gère l'empilement mobile ; un seul patron d'en-tête |
| MEDIUM | `components/inventory/InventoryDetail.tsx` (métadonnées) | `md:grid-cols-4` (4 colonnes dans 464 px) | `lg:grid-cols-4`, `tabular-nums` | TCK-505 |
| MEDIUM | `InventoryDetail.tsx` (hiérarchie) | titre du bien en `<p>`, « Pièces » en `h3` sans `h2`, pièces en `<p>` | `h2` / `h2` / `h3` en `font-display` | structure des titres, guidelines |
| MEDIUM | `InventoryDetail.tsx` (contestation) | `<textarea>` natif ; échec d'envoi avalé en silence | `<Textarea>` ; message `role="alert"` (`inventory.detail.disputeFailed`, 3 langues) | primitives du DS ; un échec se dit |
| LOW | `InventoryDetail.tsx` | `rounded-2xl` sur trois cartes quand le reste de `/app` est en `rounded-xl` ; `rounded-md` imbriqués | `rounded-xl` / `rounded-lg`, `p-4 sm:p-5` | guidelines § Arrondis |
| MEDIUM | `components/inventory/InventorySignatures.tsx` | pastilles « Signé/En attente » en `bg-success/20` **posées sur** `bg-success/10` (aplat effectif ~30 %) ; empreinte en `text-[10px]` à 80 % d'opacité ; `md:grid-cols-2` (canevas de signature à ~230 px à 768) ; `h3`/`h4` | pastilles `bg-card` + bordure du ton ; empreinte `text-xs` pleine encre ; `lg:grid-cols-2` ; `h2`/`h3` | design-guidelines § aplat ≤ 10 % ; < 12 px interdit ; place du canevas |

### `/app/inventories/new` — agent (sans `?lease`)
Relevé avant : 360-1366 ✓. Visuel : « Démarrer » en `outline` (`bg-background`) sur carte blanche,
pleine largeur sur mobile, lisible comme un bandeau vide.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/inventory/InventoryLeasePicker.tsx` | faux bouton `outline` qui se fond dans la carte ; ligne `shadow-sm` sans anneau | affordance `secondary` sur `bg-muted` + `ChevronRight`, sur la même ligne que le titre à toutes les largeurs ; carte à bordure et anneau `focus-visible` | l'action doit se voir ; cohérence avec les listes |


### `/app/maintenance` — agent (53 demandes, 4 pages), locataire (vide), prestataire
Relevé avant : 360-1366 ✓ (docOverflow 0). Même barre d'outils que les états des lieux (filtres
étroits, CTA isolé). **Défaut fonctionnel** : l'API rend `last_page: 4` pour l'agent, la liste
affichait « Page 1 / 4 — 53 demandes » **sans aucun contrôle** — les pages 2 à 4 étaient inatteignables.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/maintenance/MaintenanceList.tsx` (pagination) | compteur de pages seul, `page` jamais envoyé | état `page` transmis à `useMaintenanceRequests`, boutons Précédent/Suivant (`maintenance.list.previous/next`, 3 langues), retour en page 1 à chaque changement de filtre | 38 demandes sur 53 invisibles |
| MEDIUM | `MaintenanceList.tsx` (barre d'outils, lignes) | idem états des lieux | idem états des lieux (filtres fluides, CTA pleine largeur sur mobile, carte à bordure + anneau, rupture à `sm`) | cohérence, clavier |
| LOW | `MaintenanceList.tsx` (méta, titres de section) | « 31 août 2026 · Prévu 01/09/2026 » (deux formats de date) ; `text-sm font-bold tracking-wider` | les deux en `dateStyle: 'medium'`, `tabular-nums` ; titres `text-xs font-semibold tracking-[0.12em]` (forme d'eyebrow de la charte) | une seule forme de date par ligne |

### `/app/maintenance/<id>` — agent (35), prestataire (34)
Relevé avant : 360-1366 ✓ (docOverflow 0), mais **✗ visuel** : à 390, le titre s'écrase sur ~130 px
à côté des pastilles (4 lignes) ; aux 5 largeurs, les libellés de l'échelle d'avancement (en
`absolute` + `whitespace-nowrap`) débordent de la carte (« Demande créée » commence à x = 275 pour
une carte à x = 280 à 1366).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/maintenance/MaintenanceStepper.tsx` | libellés absolus centrés sous des pastilles collées aux bords ; espaceur `h-6` ; icônes sans `aria-hidden` ; `bg-card` et `bg-destructive/5` en conflit sur l'état annulé | `<ol class="grid grid-cols-4">`, libellés dans le flux (`text-balance`), trait de liaison par étape (plein sur les étapes franchies), `aria-current="step"`, état annulé `XCircle` | débordement ; l'étape courante se lit aussi sans couleur |
| MEDIUM | `components/maintenance/MaintenanceDetail.tsx` (en-tête) | bloc titre `flex-1` de base 0 | `basis-60` : les pastilles passent sous le titre sur mobile ; titre `font-display text-balance break-words` | texte écrasé |
| MEDIUM | `MaintenanceDetail.tsx` (actions) | seule la transition générique affichait son échec | échec de devis / approbation / démarrage affiché aussi, `role="alert"` | un refus silencieux ressemble à un bouton cassé |
| MEDIUM | `app/(dashboard)/app/maintenance/[id]/page.tsx` | « Retour » hors de `PageHeader` | en `actions` + `ArrowLeft` | idem états des lieux |
| LOW | `MaintenanceDetail.tsx`, `QuoteCard.tsx`, `QuoteSubmitForm.tsx`, `MaintenanceCompleteForm.tsx` | `rounded-2xl`, `h3` sans `h2`, `md:grid-cols-4`, `bg-card` + `bg-primary/5` en conflit | `rounded-xl`, `h2 font-display`, `lg:grid-cols-4`, `tabular-nums`/`whitespace-nowrap` sur les montants, `max-w-prose` sur les textes | guidelines, TCK-505 |
| MEDIUM | `QuoteSubmitForm.tsx` | `<label>` des pièces jointes sans `htmlFor` | `htmlFor`/`id="quote-attachments"` | champ sans nom accessible |
| LOW | `QuoteSubmitForm.tsx`, `MaintenanceCompleteForm.tsx`, `MaintenanceForm.tsx` | `<input type="file">` au bouton natif du navigateur | bouton `file:` aux jetons (bordure, `bg-background`, `rounded-lg`) | surface de navigateur thémée (craft-floor) |

### `/app/maintenance/new` — agent
Relevé avant : 360-1366 ✓. Le formulaire n'apparaît qu'une fois un bien choisi.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/maintenance/MaintenancePrioritySelector.tsx` | survol `hover:bg-accent hover:text-accent-foreground` (carte en sauge plein) ; priorité « normale » sélectionnée = `border-border bg-muted/50`, indiscernable de l'état repos — et c'est la valeur par défaut ; `dark:bg-foreground` (fond clair en thème sombre) ; aucun anneau clavier sur le radio `sr-only` | survol `bg-muted` ; « normale » active `border-foreground/40 bg-muted ring-1` ; libellé actif en `font-semibold` ; `has-[:focus-visible]:ring-2` ; `rounded-lg`, `min-h-11` ; 2 colonnes entre `md` et `lg` | accent réservé (TCK-450) ; l'état choisi doit se voir ; clavier |
| LOW | `MaintenanceForm.tsx`, `MaintenanceNewLauncher.tsx` | `md:grid-cols-2` ; `div animate-pulse bg-card` | `lg:grid-cols-2` ; `<Skeleton>` | TCK-505, guidelines |

### `/app/maintenance/providers` — agent
Relevé avant : **✗ HIGH aux 5 largeurs** — page d'erreur « Une erreur est survenue » (référence
1816499509). Journal de `next dev` : `API error 403 … This action is unauthorized` levé par
`fetchServiceProviders` (`page.tsx:40`). Le layout laisse entrer tout agent de l'agence, alors que
`ServiceProviderProfilePolicy::viewAny($user, $agency)` ne liste le carnet qu'à qui peut y inviter.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `app/(dashboard)/app/maintenance/providers/page.tsx` | 403 non rattrapé → frontière d'erreur | 403 capturé (`ApiError.status === 403`) → `PageHeader` + `EmptyState` « Carnet réservé aux gestionnaires » (`serviceProviders.page.forbidden_title/description`, 3 langues) ; toute autre erreur continue de remonter | un refus attendu ne doit pas se lire comme une panne |


### `/app/leases/new`, `/app/leases/onboarding-pending` — agent
Relevé avant : premier passage invalidé (overlay de compilation d'un fichier d'un autre agent),
remesuré : 360-1366 ✓ (docOverflow 0, aucune erreur console). `lt24` = entrées cachées 1×1 de
base-ui (faux positifs). Formulaire en deux colonnes à `lg`, lisible à 390 ; liste des onboardings
vide (état `EmptyState` conforme).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| LOW | `agency.tenantOnboardingPending.emptyDescription` (fr, en) | « Tous les onboardings de moins de 7 jours ne sont pas listés ici. » (se lit « certains ne le sont pas ») | « Les onboardings ouverts depuis moins de 7 jours n'apparaissent pas ici. » ; en aligné ; wo inchangé | clarification de micro-copie, sens identique |

### `/app/profile/notifications` — agent
Relevé avant : **✗ HIGH aux 5 largeurs** — frontière d'erreur. `MISSING_MESSAGE:
profile.notifications.channels.whatsapp` : l'API rend un canal `whatsapp` que ni le dictionnaire ni
le type `NotificationChannel` ne connaissent, et next-intl lève.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/profile/NotificationPreferencesMatrix.tsx` | `t(\`channels.${channel}\`)` | `channelLabel()` : `t.has(key) ? t(key) : channel` (en-tête et `aria-label`) + clé `profile.notifications.channels.whatsapp` (3 langues) | un canal ajouté côté API ne doit plus faire tomber la page |
| — | `components/profile/__tests__/NotificationPreferencesMatrix.test.tsx` | — | test « affiche un canal absent du dictionnaire sous sa valeur brute » ; **ablation** : rouge sans le correctif, 8/8 avec | garde du correctif |
| MEDIUM | `NotificationPreferencesMatrix.tsx` (cases) | case native 16×16 seule cible | `label` `size-10` enveloppant (`hover:bg-muted`, `rounded-md`), case `size-4 accent-primary` | cible ≥ 40 px en bureau dense |
| LOW | `NotificationPreferencesMatrix.tsx` | `h3` sans `h2`, `rounded-2xl` | `h2 font-display`, `rounded-xl overflow-hidden` | guidelines, hiérarchie |
| LOW | `app/(dashboard)/app/profile/notifications/page.tsx` (fil d'Ariane) | lien « Profil » 28×16, sans anneau | `inline-flex min-h-6`, anneau clavier, `hover:text-foreground` | cible ≥ 24 px (WCAG 2.5.8) |

### `/app/payments` — agent, locataire, propriétaire
Relevé avant : 360-1366 ✓ (docOverflow 0, défilement horizontal contenu dans la carte — TCK-505 #5
tenu). ✗ visuels : à 390 et 768 la référence se coupe (« BPY- / SS6P7R ») ; à 768 la grille de
filtres `sm:grid-cols-5` écrase les sélecteurs de date (« Cho… ») ; le moyen de paiement s'affiche
en enum anglais capitalisé (« Bank Transfer ») ; l'onglet « Payouts » est en anglais dans l'interface
française ; **le locataire se voit proposer « Générer une facture » et « Créer un reversement »**, et
l'agent « Créer un reversement » sans détenir `payouts.create` (relevé `/api/me/capabilities` :
locataire `[]`, propriétaire `[properties.update_own]`, agent sans `payouts.create`).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/payments/PaymentsTabs.tsx` | les deux boutons de création rendus pour tout rôle | `useCan('invoices.create')` / `useCan('payouts.create')` ; rangée masquée si aucun des deux | ne pas proposer un geste qui n'appartient pas au rôle (voir aussi Collisions : l'API les accepte) |
| MEDIUM | `components/payments/PaymentsHistoryTable.tsx` | cellules référence/source/moyen/entité sans `whitespace-nowrap` | `whitespace-nowrap` sur toutes les cellules ; en-têtes idem | montant et référence jamais scindés |
| MEDIUM | `PaymentsHistoryTable.tsx` (moyen) | `payment_method.replace(/_/g,' ')` + `capitalize` | `payments.methods.*` (existant, 3 langues) via `t.has`, repli sur la valeur brute | le front possède le texte affiché |
| MEDIUM | `components/payments/PaymentsHistoryFilters.tsx` | `sm:grid-cols-5` | `grid-cols-2 lg:grid-cols-3 xl:grid-cols-5` | 5 colonnes dans 464 px (TCK-505) |
| MEDIUM | `messages` `payments.tabs.payouts` | fr « Payouts », wo « Payouts » | fr « Reversements », en « Payouts », wo « Delloo xaalis » (libellé déjà employé ailleurs dans wo.json) | anglais dans l'interface française ; « reversement » est le mot des boutons voisins |
| LOW | `PaymentsHistoryTable.tsx`, `InvoicesTable.tsx`, `PayoutsTable.tsx` | `thead bg-card`, colonne montant alignée à gauche, pas de `tabular-nums`, `div animate-pulse`, `text-[11px]` | `thead bg-muted/50`, montants et en-têtes à droite, table `tabular-nums`, `<Skeleton>`, `text-xs` ; totaux `grid-cols-2 lg:grid-cols-4 tabular-nums` | lecture des colonnes de chiffres |
| LOW | `InvoicesTable.tsx`, `PayoutsTable.tsx` (« Ouvrir ») | bouton texte 16 px de haut, sans anneau | `inline-flex min-h-9 px-2`, anneau clavier | cible, clavier |
| LOW | `PaymentsTabs.tsx` | rangée d'actions `flex` | `flex flex-wrap` | 390 px |
Les classes que les tests assertent (`rounded-xl`, `border`, `whitespace-nowrap` sur en-têtes, date,
montant, statut) sont conservées : `src/components/payments` 4 fichiers / 18 tests verts.

### `/app/payments` et `/admin/finances` — statuts de paiement (collisions signalées par le groupe G)
Relevé (G) : « Payé » était un `<Badge>` variante `default`, c'est-à-dire un aplat **primaire plein**
(la couleur de l'action) ; les autres statuts suivaient des variantes de `Badge` hors du vocabulaire
unique. La référence `BPY-SS6P7R` se coupait au tiret à 390 : ce point était déjà corrigé plus haut
(`whitespace-nowrap`).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/payments/constants.ts` | `PAYMENT_/INVOICE_/PAYOUT_STATUS_VARIANT` → variantes de `Badge` (`default`, `secondary`, `outline`, `destructive`) | `*_STATUS_TONE` → tons de `StatusBadge` : payé / facture payée / reversement effectué = `success` ; en attente = `attention` ; envoyée, planifié, en cours, partiellement payé = `info` ; en retard, échec = `danger` ; brouillon, annulé, remboursé, void = `neutral` | vocabulaire unique (TCK-358) ; un succès ne se peint pas avec la couleur de l'action |
| MEDIUM | `PaymentsHistoryTable.tsx`, `InvoicesTable.tsx`, `PayoutsTable.tsx`, `InvoiceDetailDialog.tsx`, `PayoutDetailDialog.tsx` | `<Badge variant={…_VARIANT[status] ?? 'outline'}>` | `<StatusBadge tone={…_TONE[status] ?? 'neutral'} label={…} />` (import de `@/components/console`) | même décideur pour les 3 familles et leurs dialogues |
| LOW | `PaymentsHistoryTable.tsx` (référence) | `font-mono whitespace-nowrap` | + `tabular-nums` | chiffres alignés d'une ligne à l'autre |
| — | `components/payments/__tests__/constants.test.ts` | tables `_VARIANT` | tables `_TONE` ; nouveau cas « dit réussi pour un paiement, une facture et un reversement aboutis » | garde le sens, pas la couleur |
Mesure (2026-09-16 ~21:45, 390 et 1366) : `/admin/finances?tab=encaissements` (agency_admin) et
`/app/payments` (locataire) — docOverflow 0, aucune table coupée, aucune erreur ; badge
`data-tone="success"` « Payé », fond `--success` à 10 %, encre `rgb(63, 107, 69)` ; cellule de
référence `font-mono whitespace-nowrap tabular-nums`, rangée de 43 px (une seule ligne) aux deux
largeurs. Captures : `shots/f/g-fin`, `shots/f/g-pay-tenant`.
Vérification : `npx vitest run src/components/payments` → 4 fichiers, 19 tests verts ;
`npx eslint src/components/payments` → 0 ; `node scripts/check-status-badge-unique.mjs` → ✓
(1 décideur canonique, 4 tables d'un autre vocabulaire déclarées — aucune ajoutée) ;
`npx tsc --noEmit` → **0 erreur** (les deux erreurs hors périmètre relevées plus bas ont été corrigées entre-temps) ;
`check-classes-emises` → ✓.

### `/app/payments/return` — agent
Relevé : 360-1366 ✓. Sans paramètres, état « Paramètres invalides » centré avec retour aux
paiements — sobre et juste. Aucun correctif. Les états succès/échec demandent une transaction
réelle : **non mesurés** (n'écrit pas en base).

### `/app/profile` — agent, locataire, prestataire
Relevé avant : 360-1366 ✓ (docOverflow 0). Hiérarchie claire (avatar, nom, rôle, sections en
cartes). `lt24` chez le locataire : cases de `SearchPreferencesForm` (16×16).
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| LOW | `components/profile/SearchPreferencesForm.tsx` | puces de type `py-1.5` (~32 px), interrupteur d'alertes 16 px de haut, lien « Gérer mes recherches » 16 px | puces et interrupteur `min-h-10 cursor-pointer`, anneau `has-[:focus-visible]`, survol `bg-muted` ; lien `min-h-8` + anneau | cibles ≥ 40 px, clavier |

### `/app/profile/reviews` — agent, prestataire
Relevé avant : 360-1366 ✓. `lt24` : lien « Profil » du fil d'Ariane (28×16) et titres de biens.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/profile/ProfileReviewsList.tsx` (opportunités) | CTA « Laisser un avis » `bg-foreground text-primary-foreground hover:bg-foreground` (bouton sombre hors charte, aucun survol) ; « Détails » texte 12 px | `buttonVariants({ size: 'sm' })` et `buttonVariants({ variant: 'ghost', size: 'sm' })` | primitive du système, état de survol |
| MEDIUM | `ProfileReviewsList.tsx` (dates) | `toLocaleDateString('fr-FR')` et `formatDate(…, 'fr')` en dur | `formatDate(…, locale)` | la date suivait le français en anglais et en wolof |
| LOW | `ProfileReviewsList.tsx` (cartes) | lien de titre `truncate` en ligne (ne tronque pas), bloc titre sans base, pastilles compressibles, `div animate-pulse` | lien `block truncate` + anneau, `flex-1 basis-48`, pastilles `shrink-0`, note `tabular-nums`, corps `max-w-prose text-pretty`, `<Skeleton>`, filtres propriétaire `w-full` | tronque réellement, clavier |
| LOW | `app/(dashboard)/app/profile/reviews/page.tsx` (fil d'Ariane) | idem notifications | idem notifications | cible ≥ 24 px |

### Coque `/app` et `/admin` — sélecteur de profil (signalé par le groupe A)
Relevé : à 1366, le point de la pastille « ● Agent · Dakar Immo » de la barre haute sombre était
quasi invisible. Cause : la variante `dot` de `ProfileBadge` reprenait l'aplat `bg-chart-N/20` de
la pastille à texte.
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `components/profile/ProfileBadge.tsx` (variante `dot`) | `bg-chart-3/20` (aplat à 20 %) | table `DOT_COLOR` distincte, même teinte de série mais pleine (`bg-chart-N/100`) ; `TYPE_COLOR` n'est pas modifiée, puisque `check-profile-badge-contrast.mjs` la relit | la catégorie doit se voir ; le jeton reste une couleur de série, pas une couleur d'état |
| LOW | `components/profile/ProfileSwitcher.tsx` (2 appels) | point sans contour | `ring-1 ring-primary-foreground/70` | le point reste détaché de la barre sombre, quelle que soit la teinte du type |
Contre-relevé à 1366 (agent) : le point a la classe `bg-chart-3/100 ring-1 ring-primary-foreground/70` et un fond calculé `rgb(173, 128, 52)`, visible sur la capture (`c-dot`). docOverflow 0. Tests : `src/components/profile` 87/87 (le test `CLASSE_DE_SERIE` accepte `/100`). `check-profile-badge-contrast` ✓ (minimum 8,10:1), `check-classes-emises` ✓, eslint ✓.

### `/app/account/privacy` — locataire
Relevé : 360-1366 ✓. Carte unique, CTA primaire, état vide inline. Aucun correctif.

## Contre-relevé (une passe, 2026-09-16 ~20:15)

Même banc, mêmes largeurs, `--eval` de preuve de version (`$S/f-ev-proof.js`, `$S/f-ev-pay2.js`).
**docOverflow = 0 et aucune erreur console / frontière d'erreur sur les 16 relevés**, bureau 1366
comparé aux captures d'avant : pas de régression.

| Page (rôle) | Preuve lue dans le DOM |
|---|---|
| `/app/documents/39` (agent) | `button button` = 0 (plus de bouton imbriqué), h1 rendu |
| `/app/documents` (agent) | 19 liens à anneau `focus-visible:ring-ring`, 16 `.tabular-nums` |
| `/app/maintenance/providers` (agent) | h1 « Carnet prestataires », `errorUi` vide |
| `/app/profile/notifications` (agent) | texte « WhatsApp » présent, fil d'Ariane `a.min-h-6` = 1 |
| `/app/profile/reviews` (agent) | `a.min-h-6` = 1 |
| `/app/profile` (locataire) | `label.min-h-10` = 7 |
| `/app/leases`, `/app/leases/498` (agent) | 34 / 20 liens à anneau ; `thead.bg-muted/50` sur l'échéancier |
| `/app/inventories`, `/app/inventories/89` (agent) | boutons Précédent/Suivant = 2 ; rendu sans erreur |
| `/app/maintenance` (agent) | Précédent/Suivant = 2 |
| `/app/maintenance/35` (agent) | `ol.grid.grid-cols-4` = 1 (nouvelle échelle) |
| `/app/payments` (locataire) | « Générer une facture » **absent**, « Créer un reversement » **absent**, onglet « Reversements », moyen « Virement bancaire » |
| `/app/payments` (agent) | « Générer une facture » présent, « Créer un reversement » absent ; filtres `226px 226px` à 768 (étaient 5 × ~85 px) et 5 colonnes à 1366 |
| `/app/payments` (propriétaire) | `thead.bg-muted/50`, moyen « Wave » |

Note : la première version de la preuve des boutons de paiement cherchait `/facture/` et
`/reversement/` et répondait `true` pour le locataire — elle attrapait les **onglets** « Factures » /
« Reversements ». Refaite sur le libellé exact : voir la ligne ci-dessus.

## Collisions (hors périmètre — NON appliquées)
| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `components/ui/button.tsx:41,43` (groupe A) | `default` `h-8`, `sm` `h-7` | `h-11 sm:h-8` / `h-10 sm:h-7` (ou `min-h` équivalent sur `pointer: coarse`) | cibles de 28-32 px sur mobile (seuil 44 px) ; ma correction locale serait à refaire dans chaque appelant | toutes, dont Précédent/Suivant, « Ouvrir », actions de documents |
| `components/layout/AppSidebar.tsx:221` (groupe A) | « Carnet prestataires » proposé à tout agent | conditionner l'entrée à la même règle que `ServiceProviderProfilePolicy::viewAny` (capacité d'invitation) | l'agent de mesure y arrive sur un refus ; la page le dit désormais proprement, mais le lien ne devrait pas s'offrir | `/app/maintenance/providers` |
| `components/property-dashboard/PropertyPagination.tsx` (groupe D) | rendue même quand `last_page = 1` (« Page 1 sur 1 », Précédent/Suivant grisés) | ne rien rendre si `meta.last_page <= 1` | bruit sous une table de 5 lignes | `/app/payments` (3 onglets, locataire) |
| `components/reviews/LeaveReviewCta.tsx:63` (groupe B) | `bg-foreground text-primary-foreground hover:bg-foreground` | `buttonVariants({ size: 'sm' })` | même défaut que celui corrigé dans `ProfileReviewsList.tsx` : bouton sombre hors charte, aucun état de survol | pages publiques et `/app` qui l'emploient |
| `lib/notification-preferences.ts:10` (partagé) | `'inapp' \| 'email' \| 'push' \| 'sms'` | ajouter `'whatsapp'` | l'API rend ce canal ; le type ment, c'est ce qui a laissé passer le `MISSING_MESSAGE` | `/app/profile/notifications` |
| `lib/queries/leases.ts:68` (partagé) | `useLeases` typé `Lease[]` alors que la requête inclut `property` | déclarer `property?: { title, slug }` dans le type de retour | `LeasesList.tsx` et `ProfileReviewsList.tsx` le recastent localement | `/app/leases`, `/app/profile/reviews` |
| API `MaintenanceRequestController.php:55` (hors front) | `->paginate()` sans lire `per_page` | `->paginate($request->integer('per_page', 15))` borné | le front demande 20, reçoit 15 | `/app/maintenance` |
| API `StoreInvoiceRequest.php:24`, `StorePayoutRequest.php:25` (hors front) | `authorize(): true`, aucune vérification de `invoices.create` / `payouts.create` (`InvoiceService::create` borne à l'agence du client ; le chemin des reversements n'a pas été lu jusqu'au bout) | juger la capacité côté serveur | le front masque désormais les boutons, mais « cacher un bouton n'est pas une sécurité » (`hooks/useCan.ts`) — **à faire relire par la session principale** | `/app/payments` |

## Écartés
| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| `LeaseDetail.tsx` | tuile « Caution » et section « Dépôt de garantie » redondantes | fusion = changement de contenu, pas d'affinage |
| `LeaseDetail.tsx` | « Clôturée » employé comme libellé d'action | texte factuel existant |
| liens de texte en ligne 16 px (« Bail #47 », « Réservation #67 ») | cibles < 24 px | exception « en ligne » de WCAG 2.5.8 ; les agrandir casse la ligne de table |
| `input#base-ui-…-hidden-input` 1×1 | `lt24` de la sonde | entrées cachées de base-ui, non interactives (faux positifs) |
| `input.size-4.accent-primary` | `lt24` de la sonde | la cible réelle est le `label` enveloppant (40 px) |
| `p.text-[11px]` de la barre latérale | `smallText` | coque (groupe A), eyebrow capitalisé volontaire |
| `ProfileReviewsList.tsx` (`OwnerReviewCard`) | `window.prompt` pour répondre / signaler | remplacer par un dialogue = nouvelle interaction (refonte) ; à ticketer |
| `/app/leases/new` | placeholder « Rechercher par nom, email ou téléphone » tronqué à 390 | lisible au focus, le libellé « Locataire » porte le sens |
| `ProfileReviewsList.tsx` | pastilles passées sous le titre à 390 (`basis-48`) | voulu : le titre ne se tronque plus sur ~150 px |
| `agency.tenantOnboardingPending.emptyDescription` (wo) | reformulation | je ne peux pas garantir un wolof juste ; valeur conservée |

## Vérification

Toutes lancées depuis `takussan-web/` sauf mention, le 2026-09-16 entre 20:10 et 20:20.

- `npx vitest run src/components/leases src/components/documents src/components/inventory src/components/maintenance src/components/payments src/components/service-providers src/components/profile src/components/privacy 'src/app/(dashboard)/app/__tests__'`
  → **35 fichiers, 257 tests, verts**. Ablation du test WhatsApp : rouge sans le correctif, vert avec.
- `npx eslint <les 34 fichiers modifiés>` → **0 erreur, 0 avertissement** (sortie 0).
- `npx tsc --noEmit` → sortie 2, **deux erreurs, aucune dans mon périmètre** :
  `src/components/pipeline/PipelineColumn.tsx(86,12)` (props d'`ErrorState`) et
  `src/components/public/index/IndexDeProfils.tsx(136,18)` (`EmptyState` non importé).
- Gardes (racine) : `check-app-tokens` ✓, `check-public-chrome-tokens` ✓, `check-feedback-states` ✓,
  `check-destructive-contrast` ✓ ; `check-super-admin-tokens` ✗ (« assistants d'onboarding » : reste 0
  pour un cliquet à 24 — périmètre C) ; `check-status-badge-unique` ✗
  (`components/announcements/GlobalAnnouncementBanner.tsx:14,15` — hors périmètre). Aucune des deux
  ne cite un de mes fichiers.
- `node scripts/check-classes-emises.mjs` → ✓ 1708 classes, toutes émises (dont `has-[:focus-visible]:ring-2`, `lg:grid-cols-[minmax(0,1fr)_180px_180px]`, `tracking-[0.12em]`).
- `node /Users/aminethiam/.agents/skills/impeccable/scripts/detect.mjs --json <les 34 fichiers>` → `[]` (aucune trouvaille).
- i18n : 11 clés posées par `node $S/i18n-set.mjs` (fr/en/wo) — `documents.library.delete_confirm_title`, `…delete_confirm_body`, `…deleting`, `inventory.detail.disputeFailed`, `maintenance.list.previous`, `maintenance.list.next`, `serviceProviders.page.forbidden_title`, `…forbidden_description`, `profile.notifications.channels.whatsapp` ; et 2 réécritures `--force` : `payments.tabs.payouts`, `agency.tenantOnboardingPending.emptyDescription`.
- Chrome du banc arrêté : `pkill -f "remote-debugging-port=9346"` → 0.
- Aucune commande git d'écriture, aucun serveur relancé, aucune écriture en base.
