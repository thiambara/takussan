# Revue design — b-public (2026-09-16)

**Verdict : Approve** — les 13 pages publiques tiennent aux 5 largeurs (seul `/playground`, POC hors polissage, déborde à 360). Défauts corrigés : 3 écrans masqués ou sans coque (favoris, réservation, barre mobile de la fiche), comparatif mobile illisible, dates en français sous `/en`, replis d'image tiers.
Pages couvertes : 13/13 · Corrections : 78 fichiers du périmètre (77 de code dont 4 nouveaux, 1 test) + 2 tests hors dossiers B mis à jour à la demande de l'intégration (`surface-publique.contraste`, `jsonld-fil-d-ariane`) + 7 clés i18n · Collisions : 8 (celle de l'exception i18n est déjà appliquée) + 1 défaut produit (pages légales absentes) · Non mesuré : parcours qui écrivent en base (voir Vérification)

## Pages

### /fr (accueil) — anon (mode Persuade, sans hero : guideline)
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ — aucun débordement ; défauts visuels à l'œil.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `components/property/cards/types.ts` (FALLBACK_IMAGE) + 4 cartes, `PropertyCard.tsx` | repli = image placehold.co 800×600 à texte incrusté, recadrée `object-cover` : « Photo à veni… » en ~64 px coupé sur les cartes Cover (3:4), texte FR sous /en et /wo, dépendance à un tiers | nouveau `cards/PropertyPhoto.tsx` : surface `bg-muted` + icône `ImageOff` (stroke 1.5) + `property.cards.photoPending` traduit (fr/en/wo) | contenu illisible/tronqué sur la rangée signature ; i18n ; aucun réseau tiers pour afficher une carte |
| MEDIUM | 12 pages publiques (`h-[133px]`) | cale fixe de 133 px alors que la navbar mesure 67 px sous `lg` (mesuré) → 66 px de vide en tête à 360-768 (`h1` à 181 px) | `components/home/NavbarSpacer.tsx` : `h-[67px] lg:h-[136px]` (hauteurs mesurées) | rythme vertical ; premier écran mobile gaspillé |
| MEDIUM | `cards/PropertyRow.tsx` | « Tout voir » et l'action « Effacer l'historique » en `hidden md:inline-flex` | visibles à toutes les largeurs, `min-h-11`, chevron Lucide au lieu du glyphe « ▸ » | commande inatteignable sur mobile (RecentlyViewed : effacer l'historique impossible) ; glyphe Unicode en guise d'icône |
| MEDIUM | `cards/PropertyCardStandard/Listing/Compact.tsx`, `PropertyCard.tsx` | séparateurs posés à la main : « · 143 m² » (point en tête, Listing), « 3 ch • » (queue), « garage • Garage » (type brut + libellé, PropertyCard) | `cards/CardMeta.tsx` : séparateur seulement ENTRE éléments présents, `tabular-nums` ; PropertyCard n'affiche plus le type brut en repli de surface | méta erronée visible sur l'accueil (« Espace de bureau à Louga ») |
| MEDIUM | 4 cartes | `/{RENT_PERIOD_SHORT[…]}` (« /mois » en dur) | `useTranslations('property.rentPeriodsShort')` (clé existante) | « /mois » affiché sous /en et /wo |
| MEDIUM | `cards/PropertyCardListing.tsx`, squelette `PropertyRow` | carte 440 px / image 170 px à 390 px : titre coupé, carte hors champ | `w-[340px] sm:w-[440px]`, image `w-[128px] sm:w-[170px]`, pas de défilement lu sur la carte rendue | lisibilité mobile |
| LOW | cartes | méta et horodatage en 10 px | 11-12 px | plancher 12 px de la charte (11 px toléré en dense) |
| LOW | `PropertyRow.tsx` flèches | `transition-all` | `transition-[border-color,opacity,scale]` + `active:scale-[0.96]` | jamais `transition-all` |
| LOW | `PropertyRow.tsx` h2, Cover h3, Standard h3 | sans `text-balance`/`text-pretty` | ajoutés | césures des titres |
| LOW | Listing | `rounded-xl` image dans `rounded-2xl p-3` | image `rounded-lg` | rayons concentriques |
| MEDIUM | `components/home/Navbar.tsx` | bouton menu 36 px, liens du menu mobile ~24 px, bascules Acheter/Louer sans `aria-pressed`, panneau mobile non défilable, aucun Échap, `transition-colors` + `active:scale-95` | bouton `size-11` + `aria-expanded`, liens/bascules `min-h-11`, `aria-pressed`, panneau `max-h-[calc(100dvh-67px)] overflow-y-auto`, Échap ferme les 3 menus, `active:scale-[0.96]`, popover « Plus » `shadow-lg`/`rounded-lg`, compte 11 px `tabular-nums` | cibles tactiles, a11y, menu coupé sur petits écrans |
| LOW | `components/home/Footer.tsx` | colonne unique sur mobile, liens 21 px, titres sans `font-display` | 2 colonnes, liens `min-h-11` sous `md`, titres `font-display` | longueur de page mobile, cibles, charte typo |
| MEDIUM | `favorites/FavoriteButton.tsx`, `compare/CompareToggleButton.tsx` | au repos `bg-card/20 text-primary-foreground` : cœur crème invisible sur photo claire ou repli | `bg-scrim/30` ; `transition-all` → propriétés nommées, `active:scale-[0.96]` | commande invisible |

Contre-relevé : 360-1366 docOverflow 0 ; `h1` à 115 px (<lg) / 184 px (≥lg) ; « Tout voir » 44 px ; 48 replis `ImageOff`, 0 `img[src*=placehold]` (preuve de version : `div[aria-hidden].h-[67px]` présent). Captures `shots/b/apres/tall/anon_fr_{390,1366}.png` : 1366 sans régression (mêmes rangées, repli sobre).

### /fr/properties — anon (Persuade)
Relevé avant : 360-1366 docOverflow 0. À 768 : rail de filtres 264 px + 3 colonnes de 128 px, prix tronqués (« 28 000 000 F C… »). À 1024 : 4 colonnes de ~150 px.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `search/FilterSidebar.tsx` « Biens en vedette » | `bg-amber-50 border-amber-400 text-amber-700`, étoile `amber-400` | `bg-accent/10 border-accent text-accent` (l'accent des badges featured) | échelle Tailwind brute hors palette Lin |
| MEDIUM | `FilterSidebar.tsx`, `SearchToolbar.tsx`, `PropertiesDiscoveryPage.tsx`, `loading.tsx` | rail dès `md`, grille `md:3 lg:4 xl:5` | rail et bouton « Filtres » basculent à `lg` ; grille `md:3 xl:4 2xl:5` (squelette aligné) | texte écrasé à 768/1024 |
| MEDIUM | `FilterSidebar.tsx` | 5 × `transition-all`, puces sans `type`/`aria-pressed`, bouton fermer 32 px, tiroir sans `role=dialog`/Échap, `shadow-2xl`, `90vh` | `transition-colors`, `aria-pressed`, puces `min-h-9` 13 px, fermer `size-10`, `role="dialog" aria-modal` + Échap, `shadow-lg`, `90dvh`, marge `safe-area`, tiroir centré `md:max-w-2xl` | a11y, charte (jamais `shadow-2xl`), iOS |
| LOW | `SearchToolbar.tsx` | tri sans nom accessible, compteur sans `aria-live`, pastille 10 px | `aria-label` (`search.toolbar.sortAria`, 3 langues), `aria-live="polite"` + `tabular-nums`, 11 px ; puces actives `min-h-8` | a11y |
| LOW | `PropertyCard.tsx` | image `mb-5` + corps `mt-3` (32 px), prix sans `tabular-nums`, `h3` sans `font-display` | `mt-3.5`, `tabular-nums`, `font-display` | rythme, charte typo |

Contre-relevé : 360/390/768 : tiroir (`role=dialog`) 760/922 px, 2/2/3 colonnes (156/171/224 px) ; 1024 : rail + 3 colonnes 192 px ; 1366 : rail + 4 colonnes 226 px (prix + « /mois » tiennent). docOverflow 0 partout. Note : le « Chargement… » tient ~6 s au premier rendu en `next dev` — la sonde l'attend (`b-wait.js`), ce n'est pas un défaut.

### /fr/properties/<slug> — anon + agent (Persuade) — `villa-luxueuse-a-sicap-baobab-jArXKP`, `villa-moderne-a-almadies-Frlmsn`
Relevé avant : 360-1366 docOverflow 0 (les `over[]` sont les cartes du carrousel « Biens similaires », défilant dans leur conteneur). Base de démo sans aucune photo : galerie et lightbox avec photos **non mesurées**.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `PropertyDetailContent.tsx` | barre d'action mobile (`fixed`, CTA principal sous `lg`) rendue DANS `animate-fade-in-up` (déclarée `both`) : le `transform` de fin fait de l'enveloppe le bloc conteneur du `fixed` → barre à y = 1 988 px dans un viewport de 844, **invisible** | l'animation n'enveloppe que le contenu ; barre et dialogues hors de l'enveloppe | CTA principal inatteignable sur mobile |
| HIGH | 25 fichiers de la fiche + `bookings/page.tsx`, `PropertiesDiscoveryPage.tsx`, `AnonymousLeadDialog.tsx`, `favorites/{FavoritesPopover,SaveSearchButton}.tsx`, `map/PropertyMap.tsx`, `compare/{CompareTable,CompareClient,CompareCarousel}.tsx`, `share/ShareButton.tsx` | échelle Tailwind brute `stone-*` (≈ 150 classes), `red-*`, `emerald-*`, `amber-*`, `sky-500`, `bg-white` | jetons : `text-foreground`/`text-muted-foreground`, `border-border`, `bg-muted`, `bg-card`, `text-destructive`, `text-success`/`bg-success/10`, étoiles et barres de note `primary` (comme `components/public/profile`), écarts du comparateur et avis « tronqué » en `warning` | hors palette Lin, aucun thème sombre ; la garde `check-public-chrome-tokens` ne voit pas `stone` (cf. Collisions) |
| HIGH | `contact/WhatsAppButton.tsx` | `bg-[#25D366] text-white` : **1,98:1** | `bg-success text-success-foreground` (≈ 6:1), `min-h-11`, `active:scale-[0.96]` | contraste AA, hex interdit |
| MEDIUM | `PropertyLocationMapInner.tsx`, `map/LocationPickerMap.tsx` | épingles `#0c4a6e` / `#1d4ed8` (bleus hors palette) en `data:` URI | `divIcon` SVG en ligne `fill="var(--primary)"`, ombre `--shadow-color` | jetons (une image ne lit pas les variables CSS) |
| MEDIUM | `PropertyGalleryMosaic.tsx`, `PropertyMobileGallery.tsx` | sans photo : bloc 16:7 = 532 px de vide à 1366 (4:3 sur mobile) | bande `h-48 lg:h-56` / `h-40` + icône `ImageOff` | le prix arrivait sous la ligne de flottaison |
| MEDIUM | `PropertyDetailContent.tsx` aside | `lg:sticky lg:top-24` (96 px) sous une navbar de 136 px ; `PropertyBookingCard` posait en plus son propre `sticky` | aside `lg:top-40`, sticky interne retiré | la carte de réservation glissait sous la navbar |
| MEDIUM | `PropertyHeader.tsx` | « Favori » / « Ajouter » en dur ; actions icône-seule 28 px AU-DESSUS du `h1` sur mobile (`flex-col-reverse`) ; `h1` sans `font-display` | clés `property.detail.favorite{Add,Saved}Short` (3 langues) ; actions sous le titre, `min-h-10 min-w-10` ; `h1 font-display tracking-tight text-balance` ; « Mis en avant » en `accent` | i18n, hiérarchie, cibles, charte |
| MEDIUM | `PropertyAgentCard.tsx` | « Connexion… » / « Appeler » en dur | `property.detail.agent.{call,calling}` (3 langues) ; boutons `h-10` | i18n |
| MEDIUM | `PropertyBookingCard.tsx`, `PropertyMobileBottomBar.tsx` | boutons 28-32 px (primitive `sm`/`default`) ; repli de période `'mois'` en dur ; « /par mois » | `h-11` (carte) / `h-10` (barre) ; `property.rentPeriodsShort` → « /mois » ; prix `tabular-nums` | cibles, i18n |
| LOW | `PropertyVisitDialog.tsx` | `capitalize` → « Choisir Une Date » | `inline-block first-letter:uppercase` | casse française |
| LOW | `PropertyVisitDialog.tsx` | `transition-all` | propriétés nommées | règle |

Contre-relevé : 360-1366 docOverflow 0 ; barre mobile à y 779-844 (viewport 844), `parentTransform: []` ; aside `top: 160px`, navbar 135,5 px ; épingle `path[fill="var(--primary)"]` présente (preuve de version) ; dialogues « Demander une visite » (328×713 à 360) et « Postuler » (358×386 à 390) tiennent dans le viewport sans débordement. Captures `shots/b/apres/…villa_luxueuse…_{390,1366}.png`, `apres/dialog*/`.

### /fr/agencies et /fr/agents (index de profils) — anon (Read)
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓. État vide atteint sans écrire (`?q=zzzz`).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `public/index/IndexDeProfils.tsx` | `h-[133px]` sous la barre : 64 px de vide sous `lg` | `NavbarSpacer` (69 / 136 px) | la barre ne passe en bureau qu'à `lg` (TCK-505) |
| MEDIUM | `IndexDeProfils.tsx` état vide | paragraphe maison | `EmptyState` (icône `SearchX`, titre, `common.empty.body`) | un seul état vide partagé (garde feedback-states) |
| MEDIUM | `public/index/ProfileFilters.tsx` | champ et bouton 36 px, lien « effacer » et pastilles de ville ~28 px | champ/bouton `h-11` (`md:h-10`), lien `min-h-9`, pastilles `min-h-9` + `active:scale-[0.96]` | cibles ≥ 44 px au pouce, ≥ 40 px en bureau |
| LOW | `IndexDeProfils.tsx` | h1 / intro sans équilibrage | `text-balance` / `text-pretty` | veuves sur 2 lignes à 360 |

Contre-relevé : 5 largeurs docOverflow 0, aucune erreur console ; `?q=zzzz` rend l'`EmptyState` (une erreur transitoire pendant l'édition — import manquant une seconde — disparue au re-relevé).

### /fr/agencies/<slug> et /fr/agents/<slug> — anon (Read) — `dakar-immo`, `thies-properties-owner-2`
Relevé avant : 360 ✓ (docOverflow 0) · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ — défauts de composition seulement.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `agencies/[slug]/page.tsx`, `agents/[slug]/page.tsx` (+ leurs `not-found.tsx`) | cale `h-[133px]` | `NavbarSpacer` | 64 px de vide sous `lg` |
| MEDIUM | en-tête, 2 pages | colonne de droite alignée en haut : sans description, les boutons de contact flottaient à hauteur du logo | grille `md:items-end` ; sans description/bio, colonne `md:items-end` (boutons calés à droite) | à 1366 les boutons tombaient au milieu de la page (capture `apres/prof`) ; ils s'alignent désormais sur la ligne du nom (capture `apres/prof2`) |
| MEDIUM | `public/profile/ContactSheet.tsx` | boutons de bureau `size="lg"` = 36 px ; appel mobile 36 px | `h-11 px-4` en bureau, `h-12 w-full` au pouce | cibles |
| LOW | logo / avatar | 96 px partout | `size-24 md:size-32` (agence), `md:size-36` (agent) | la colonne d'identité paraissait vide en bureau |
| LOW | `public/profile/PortfolioTabs.tsx` | compteurs proportionnels ; état vide maison ; `gap-6` | `tabular-nums` ; `EmptyState` (icône `Home`) ; `gap-x-5 gap-y-10` (même rythme que la liste) | chiffres qui changent à l'onglet ; cohérence |
| LOW | `public/profile/TeamStrip.tsx` | `transition-all` (×2) | propriétés nommées | règle du brief (sans toucher à la mise en page TCK-505) |
| LOW | h1 | — | `text-balance` | noms longs d'agence |

Contre-relevé : `dakar-immo` 390/768/1366 et `thies-properties-owner-2` 390/1366 → docOverflow 0, 0 erreur console. Preuve de version : capture `apres/prof2` à 1366 montre les boutons calés à droite, sur la ligne du nom.

### /fr/compare — anon (Persuade) — vide, puis `?ids=493,471,508` (3 biens publics, état client, sans écriture)
Relevé avant : vide 5 largeurs docOverflow 0 ; rempli 5 largeurs docOverflow 0, mais `lt24` : « Retirer » et « Voir le bien » 57×16 / 82×16 à toutes les largeurs.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `compare/CompareCarousel.tsx` (< `md`) | chaque critère dans sa propre bande défilante à 85 % : la 2ᵉ valeur coupée au bord (« 2 090 », « À loue ») et sans nom de bien ; bandes non synchronisées avec celle des photos ; `role="table"`/`row` sans cellules | chaque critère en `<dl>` : titre du bien (tronqué) → valeur alignée à droite, `tabular-nums` | à 360/390 le comparatif était illisible sans balayer 14 bandes une à une |
| MEDIUM | `CompareTable.tsx` + `CompareCarousel.tsx` | pastille de divergence « != » (notation de développeur) | « Diffère » (`compare.table.divergentShort`, fr/en/wo), `bg-warning/15` | copie UX |
| MEDIUM | idem | « Voir le bien » / « Retirer » 16 px de haut | `min-h-10 px-2` avec marges négatives (alignement optique conservé) | cibles |
| MEDIUM | `CompareTable.tsx`, `CompareCarousel.tsx`, `favorites/FavoritesPopover.tsx` | repli `placehold.co` + `unoptimized` | `PropertyPhoto` (repli en jetons, traduit) | même défaut que les cartes (texte incrusté, français sous `/en`, service tiers) |
| MEDIUM | `CompareFloatingBar.tsx` | la barre flottante restait affichée SUR `/compare` : son CTA pointait sur la page courante, et à 390 elle recouvrait le bas du comparatif | masquée quand le chemin finit par `/compare` | redondance + recouvrement |
| LOW | `CompareFloatingBar.tsx` vignette sans aperçu | « # » (initiale de `#493`) | icône `ImageOff` | sélection venue d'une URL partagée |
| LOW | `CompareClient.tsx` état vide | CTA 32 px | `buttonVariants({size:'lg'})` + `h-11 px-4` | cible |
| LOW | `CompareClient.tsx` | h1 sans `font-display`/`text-balance` ; sous-titre proportionnel | `font-display tracking-tight text-balance` ; `tabular-nums` | guideline typographique |
| LOW | `CompareTable.tsx` | lien photo `transition` (toutes propriétés par défaut) | `transition-shadow` | seul l'anneau change |

Contre-relevé : 5 largeurs docOverflow 0, 0 erreur console, `lt24` = 0 à 360/390 (restent les liens-titres en ligne à 768+, exemptés : texte courant). Preuve de version (`--eval`) : pastille « Diffère » lue dans le DOM, 14 `<dl>`, barre flottante absente.
Non mesuré : colonne « Bien indisponible » avec des biens publics (seuls des ids non publics la produisent — relevée avec `624,678,732`, rendu correct).

### /fr/favorites — anon (Persuade) — vide, puis 4 biens posés dans `localStorage` (état client)
Relevé avant : 5 largeurs docOverflow 0 — mais **le h1 « Mes favoris » passait sous la barre fixe** à toutes les largeurs (capture `avant/fav`).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `favorites/PublicFavoritesPage.tsx` | aucune cale sous la `Navbar` fixe | `NavbarSpacer` | titre et sous-titre invisibles |
| LOW | idem | CTA vide 32 px ; h1 sans `font-display` | `size lg` + `h-11 px-4` ; `font-display tracking-tight text-balance`, compteur `tabular-nums` | cible, typographie |

Contre-relevé : vide 5 largeurs docOverflow 0, h1 visible (capture `apres/fav`) ; rempli (4 cartes) à 360/768/1366 docOverflow 0, 0 erreur console, cartes 328/352/394 px.

### /fr/bookings — anon + agent — sans paramètre, puis `?property=villa-luxueuse-a-sicap-baobab-jArXKP`
Relevé avant : 5 largeurs docOverflow 0, 0 erreur console — mais **la page n'avait aucune coque** : ni marque, ni barre, ni pied (captures `avant/bookings`, `avant/bookings2`). Une impasse dont on ne sortait que par le bouton « Retour » du navigateur.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `bookings/page.tsx` (3 branches) | contenu nu | `Coque` locale : `Navbar` + `NavbarSpacer` + `<main>` + `Footer` | navigation du site perdue au milieu du tunnel |
| MEDIUM | `bookings/loading.tsx` | squelette sans barre | barre + cale dans le squelette (géométrie de la page recopiée, TCK-438) | la barre serait apparue en décalant tout à l'arrivée des données |
| LOW | `bookings/page.tsx` | h1 `text-2xl font-bold` ; CTA des états vides 32 px | `font-display tracking-tight text-balance sm:text-3xl`, sous-titre `text-pretty` ; CTA `size lg` + `h-11 px-4` | typographie, cibles |
| test | `(public)/__tests__/etats-publics.test.tsx` | `firstElementChild` est `aria-hidden` | le bloc qui porte les squelettes est `aria-hidden` ET ne contient pas la barre | l'intention (squelette hors de l'arbre d'accessibilité) est gardée ; la barre, elle, doit rester lisible |

Contre-relevé : anon `?property=…` 5 largeurs docOverflow 0 (capture `apres/bookings` : barre, carte, pied) ; sans paramètre 360/1366 docOverflow 0 ; agent 360/768/1366 docOverflow 0, 0 erreur console.
Hors périmètre : le contenu du tunnel (`components/bookings/*`, boutons « Retour au bien » / « Se connecter » à 36 px) → Collisions.

### /fr/playground — anon (POC : revue légère, pas de polissage)
Relevé : 768 ✓ · 1366 ✓ · **360 ✗ docOverflow 69** (rangée des sélecteurs de fontes `div.flex.items-center.gap-3` et palette qui débordent jusqu'à 429 px). 63 textes < 12 px, ~60 cibles < 44 px. Jetons propres au POC (`--pg-*`).
Aucune correction (consigne : POC). À traiter si le POC sort de son statut.

### /en et /wo — accueil et liste à 360 — anon
Relevé avant : 4 relevés docOverflow 0. Défauts :

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `property/cards/useDateRelative.ts` (nouveau) ← `PropertyCard`, `PropertyCardStandard`, `PropertyCardListing` | « il y a 3 semaines » sous `/en` (`formatRelativeDate` de `lib/utils.ts` fige `'fr'`) | `Intl.RelativeTimeFormat` dans la langue de la page : « 3 weeks ago » | texte de l'interface dans la mauvaise langue |
| — | idem, `wo` | — | `wo` → `fr`, délibérément | Chrome n'a pas de données wolof (`supportedLocalesOf(['wo'])` → `[]`, mesuré) alors que Node en a : le serveur rendrait du wolof, le client de l'anglais → hydratation divergente. Le français est aussi le repli des libellés `wo` |
| MEDIUM | `property/cards/PropertyPhoto.tsx` | libellé « Photo coming soo… » coupé et collé à la pastille de date dans l'image de 156 px (grille 2 colonnes à 360) | libellé masqué sous `@max-[12rem]` (le conteneur de la carte est déjà `@container`) ; `px-2 text-center` | débordement du texte ; l'icône seule suffit |
| MEDIUM | `property/PropertyCard.tsx` prix | `truncate` : « 2 090 000 F CFA /m… » | `flex flex-wrap`, prix et période chacun `whitespace-nowrap` | la période distingue un loyer d'un prix |
| LOW | `PropertyCard.tsx` pastille de date | `text-white` | `text-primary-foreground` (même choix que `FavoriteButton`) | jeton |

Contre-relevé : `/en/properties` 360/768 docOverflow 0, pastilles « 3 weeks ago », libellé de repli `display:none` à 360 et affiché à 768, prix « 2 090 000 F CFA/month » entier ; `/wo` et `/fr` 360 : « il y a 3 semaines », 0 erreur console (pas d'erreur d'hydratation).
Relevé sans défaut propre à la langue : les titres wolof (« Tànneef bu ayu-bés ») passent à la ligne proprement ; la barre d'outils `/en` passe sur trois lignes à 360 (zone TCK-505, non retouchée).

### /fr (accueil) et fiche — rôle agent
Accueil : 5 largeurs docOverflow 0, 0 erreur console ; barre de bureau avec avatar + nom, « Publier » ; menu mobile ouvert (`aria-expanded=true`) : liens 44 px, bloc profil, « Publier une annonce » 46 px.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `home/Navbar.tsx` menu mobile | « Acheter » allumé sur TOUTES les pages (`navLinks[0].active: true` figé dans `data/navigation.ts`) | état lu dans l'URL (`lienActif`) + `aria-current="page"` | faux repère de navigation ; vu à l'accueil en agent comme en anon |

Contre-relevé : `/fr` → aucun lien actif ; `/fr/properties?contract_type=rent` → « Louer » `aria-current=page`.
Fiche en agent : relevée avec la fiche (section plus haut) — « Envoyer un message » absent pour ce rôle (`canMessage` faux), non-défaut.

### Passe complémentaire — demandes du team-lead (localhost, plancher de 12 px, signalements)
**Mesures refaites sur `http://localhost:3000`.** Le banc corrigé (CORS) sert désormais sur ce domaine. Les relevés des pages à données client ont été repris après la dernière modification, avec cookies `localhost` :

| Page | Largeurs | Résultat |
|---|---|---|
| `/fr` | 5 | docOverflow 0, `smallText` 0, 48 cartes chargées, 0 `role=alert` |
| `/fr/properties` | 5 | docOverflow 0, « 247 biens trouvés », 30 cartes, aucune pastille qui déborde de son image ; `smallText` 0 |
| fiche `villa-luxueuse-a-sicap-baobab-jArXKP` | 5 | docOverflow 0, 0 `errorUi`, 0 erreur console |
| `/fr/compare?ids=493,471,508` | 360/768/1366 | docOverflow 0, « Diffère », 14 `<dl>`, barre flottante absente |
| `/fr/favorites` (4 biens) | 360/1366 | docOverflow 0, 4 cartes |
| agences et agents (index et profils) | 360/768/1366 | docOverflow 0, 0 `errorUi` |

Les relevés antérieurs de cette revue faits sur `127.0.0.1` ne valent que pour le rendu serveur. Ils sont remplacés par ceux-ci pour tout ce qui charge côté client.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `property/cards/*` (Standard, Listing, Compact, Cover, Row, `ContractTypeChip`, `NewBuildChip`) + `property/PropertyCard.tsx` | libellés à 11 px, et 10 px pour les pastilles étroites (« En location », « il y a 3 mois », surtitres de rangée). Signalé par D sur `/app/favorites` | `text-xs` (12 px) partout ; pastilles étroites en `px-1.5` pour garder la place | plancher de 12 px de la charte. Contre-relevé à 360 : aucune pastille ne sort de son image, `smallText` 0 |
| MEDIUM | `home/Navbar.tsx` (libellés de catégorie, « Plus », compteur du menu « Plus ») | 11 px (écarté plus haut, puis repris sur demande) | `text-xs` | même plancher ; `smallText` 0 à 1024 et 1366, docOverflow 0 |
| LOW | `search/FilterSidebar.tsx` (aides), `AutourDeMoi.tsx`, `SearchAutocomplete.tsx` (en-têtes de groupe), `public/profile/StatsBar.tsx`, `TeamStrip.tsx`, `public/index/ProfileCard.tsx`, `compare/*`, `favorites/FavoritesPopover.tsx` (ligne de lieu) | 11 px | `text-xs` | même plancher. **Gardés** : les pastilles de compteur dans un rond fixe (`SearchToolbar` 20 px, `FavoritesPopover` 18 px), où 12 px ne tient pas pour deux chiffres |
| MEDIUM | `reviews/LeaveReviewCta.tsx:63` (collision signalée par F) | `bg-foreground text-primary-foreground hover:bg-foreground` : bouton sombre hors charte, sans survol | `cn(buttonVariants({ size: 'lg' }), 'h-11 shrink-0 px-4')` | charte + état de survol + cible de 44 px. Rendu dans `bookings/BookingDetail` et `leases/LeaseDetail` : non relevé au navigateur par B (pages `/app`) |
| — | `public/index/IndexDeProfils.tsx:136` (tsc) | `EmptyState` non importé | import présent | c'était l'édition en cours ; `tsc --noEmit` est vert depuis |
| — | `PropertyLocationMapInner.tsx` (`check:i18n`, 2 écarts) | littéral SVG vu comme du texte + exception `<?xml` devenue sans site | épingle construite par le DOM ; ombre en classe Tailwind émise | `compteFichier` → 0 site. L'exception périmée a été retirée côté intégration : **`check-i18n` sort en 0** |

**Défaut produit — pages légales absentes (non corrigé, aucun texte juridique inventé).**
- Relevé le 2026-09-16 : `/fr/legal/cgu` → 404, `/fr/terms` → 404, `/fr/privacy` → 404 ; `/legal/cgu` et `/terms` → 307 vers leur version localisée, donc 404.
- `find src/app -iname '*legal*' -o -iname '*terms*' -o -iname '*cgu*' -o -iname '*mentions*'` → rien. La seule page « privacy » est `/app/account/privacy`, qui porte les réglages du compte et non une politique publique.
- Liens qui y pointent :
  - `app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx:317` (périmètre B). **Une case OBLIGATOIRE « j'accepte les CGU » renvoie à une page 404** : l'utilisateur doit accepter un texte qu'il ne peut pas lire.
  - `app/(auth)/auth/register/page.tsx:146,151` (C).
  - `components/onboarding/HostIndividualWizard.tsx:644` (C).
- Le lien est laissé tel quel : le retirer changerait le comportement d'un consentement. Décision produit à prendre : rédiger et publier les CGU et la politique de confidentialité, puis, seulement ensuite, ajouter les liens au pied de page, qui n'en porte aucun.

### Passe d'intégration — suite vitest complète (demande du team-lead)
Deux fichiers de test hors des dossiers B rougissaient sur des modifications de B (4 tests).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| test | `lib/__tests__/jsonld-fil-d-ariane.test.tsx` | le fil affiché se lisait par `span.text-stone-700`, classe passée aux jetons. Le test ne lisait plus que [Accueil, Louer, Dakar] | le dernier maillon **est toujours affiché**. Il porte désormais `aria-current="page"` (`PropertyBreadcrumb.tsx:29`), et le test le lit par là | intention gardée (balisé ⇔ affiché) ; gain d'accessibilité |
| MEDIUM | `compare/CompareCarousel.tsx:164`, `CompareTable.tsx` | « Diffère » `text-warning` sur `bg-warning/15` (fond non composable, pire cas 1,00:1) | `border border-warning/30 bg-card` : `--warning` sur `--card` ≈ 6,4:1 | contraste mesurable et tenu |
| MEDIUM | `search/FilterSidebar.tsx:590` « En vedette » actif | `text-accent` sur `bg-accent/10` | `bg-accent text-accent-foreground` (étoile `fill-accent-foreground`) | la forme déjà mesurée de `ContractTypeChip` (location) |
| MEDIUM | `PropertyReportButton.tsx:113` (confirmation) | `text-success` sur `bg-success/10` | `bg-card` + bordure `success/30` : ≈ 6,2:1 | idem |
| MEDIUM | `PropertyLocationMap.tsx:26` (adresse masquée) | `text-muted-foreground` sur `bg-muted/60` | `bg-muted` opaque : ≈ 4,8:1 | idem |
| MEDIUM | `CompareToggleButton.tsx:70`, `FavoriteButton.tsx:109` | icône claire sur voile `bg-scrim/30` : 2,01:1 sur un pixel blanc | `bg-scrim/50` : le pire cas tient le seuil non textuel de 3:1 | risque réel sur photo claire (déjà noté à l'ardoise) |
| MEDIUM | `PropertyCard.tsx:173` pastille de date | `bg-scrim/50` sur le repli `--muted` : 4,32:1 | `bg-scrim/60` | seuil texte de 4,5:1 |
| dette | `FavoritesPopover.tsx:209` | `hover:text-destructive` sur `hover:bg-destructive/10` | **consignée** à l'ardoise (famille 4), avec la même raison que `SearchToolbar` : le fond réel est le `--card` du popover, que `check-destructive-contrast` mesure ≥ 4,55:1 | aplat de sa propre couleur ; le lecteur statique ne voit pas le fond |
| test | ardoise `DETTES` | 9 entrées mortes (`bg-card/20` ×2, `text-white` de `PropertyCard`, `text-border` ×6 des cartes) | retirées ; une note dit où est passé le séparateur (`CardMeta`, `text-muted-foreground/50`) | la garde exige une ardoise juste dans les deux sens |
| test | `FICHIERS_HORS_JETONS` | 42 | **5**, daté du 2026-09-16, cause écrite (conversion aux jetons de la revue design) | cliquet à deux sens |
| test | `ENCRES_INVERSES` | 155 | **235**, daté et expliqué | même mécanisme que 151 → 154 : une encre `stone` devenue jeton sans fond sur l'élément passe du premier trou au second. **Relevé par fichier contre `HEAD`, somme exacte 155 → 235** : +62 pour le site public (B), +18 pour `components/bookings/*` (converti par un autre groupe, dans la surface via `/bookings`). La répartition est écrite dans le commentaire de la constante. Mesure faite par un test temporaire, supprimé après usage |

Vérification de cette passe :
- `npx vitest run src/test/__tests__/surface-publique.contraste.test.ts src/lib/__tests__/jsonld-fil-d-ariane.test.tsx` avec les 13 dossiers B → **70 fichiers, 557 tests, verts** ;
- `node scripts/check-public-chrome-tokens.mjs` ✓ (96 fichiers, 0 classe brute) ;
- `check-classes-emises` ✓ ;
- `check-destructive-contrast` ✓ ;
- `tsc --noEmit` ✓ ;
- eslint : 0 erreur (seul reste l'avertissement préexistant du mock `<img>` de `CompareTable.test.tsx`).

### Relecture adverse — deux points (demande du team-lead)
| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `search/FilterSidebar.tsx`, tiroir mobile (nouveau sous-composant `TiroirMobile`) | `role="dialog" aria-modal` + Échap écouté sur le tiroir, mais le focus restait sur `body` : Échap ne fermait rien, et un lecteur d'écran se trouvait dans une modale sans rien de focalisé (reproduit à 390 px par la relecture) | `role`, `aria-modal` et `tabIndex={-1}` sur le panneau, qui prend le focus à l'ouverture. Échap et Tab sont écoutés sur `document` (effet nettoyé) ; Tab tourne dans le tiroir ; le focus revient au déclencheur à la fermeture. Le voile est `aria-hidden`. Pas de dépendance, pas de mémoïsation manuelle | a11y clavier et lecteur d'écran : la modale annoncée existe enfin |
| test | `search/__tests__/FilterSidebar.tiroir.test.tsx` (nouveau) | — | ouverture → focus dans le tiroir ; Échap sur `document` → fermé et focus rendu au déclencheur ; Tab et Maj+Tab restent dans le tiroir | **ablation** : sans `panneau.current?.focus()`, 1 test sur 2 rougit |
| MEDIUM | `bookings/BookingSummary.tsx:49` (fichier du groupe E, touché sur autorisation pour ce seul changement) | `lg:sticky lg:top-24` (96 px) sous une barre fixe de 136 px | `lg:top-40` (160 px, même valeur que la fiche), avec commentaire | le récapitulatif serait passé sous la barre |

Contre-relevé :
- **Tiroir**, au navigateur à 390 px : ouvert, focus dedans ; Échap sur `document` → fermé, focus revenu sur « Filtres » ; docOverflow 0.
- **Récapitulatif**, relevé en agent à 1024 et 1366 px : `top` calculé = 160 px (preuve de version ; le premier passage lisait encore 96 px avant recompilation).
  - À l'étape relevée, le parent de l'`aside` a exactement sa hauteur (386 = 386 px), donc l'adhérence **ne s'engage pas** : au défilement maximal (240 px), l'`aside` remonte à y = 12 comme le reste de la page.
  - L'effet du correctif n'est donc pas observable sur cet écran. La valeur est alignée par cohérence avec la fiche.
  - Pour que l'adhérence serve, il faudrait étirer la colonne dans `BookingTunnel.tsx`, hors de l'autorisation donnée : c'est une collision pour E.

Vérification :
- `npx vitest run` sur les 13 dossiers B, `components/bookings` et `surface-publique.contraste` → **71 fichiers, 554 tests, verts** ;
- eslint des 3 fichiers → 0 problème ;
- `check-classes-emises` ✓ ;
- `tsc --noEmit` ✓.

## Collisions (hors périmètre — NON appliquées)
| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `takussan-web/src/app/globals.css:405-407` | `.animate-fade-in-up { animation: fadeInUp 0.5s ease-out both; }` | `… ease-out backwards;` (ou une image-clé finale sans `transform`) | `both` laisse le `transform` final sur l'élément. Il devient alors le bloc conteneur de tout descendant `position: fixed`. La barre d'action mobile de la fiche restait invisible, contournée dans `PropertyDetailContent` en sortant la barre et les dialogues de l'enveloppe animée. Tout autre `fixed` placé sous cette classe a le même défaut | fiche, cartes, profils |
| `takussan-web/scripts/i18n-exceptions.mjs:315-325` | exception `{ fichier: …PropertyLocationMapInner.tsx, motif: /^<\?xml version/ }` | la retirer — **appliqué côté intégration**, `check-i18n` sort en 0 | l'épingle n'est plus un SVG en `data:` URI : elle est construite par le DOM dans un `divIcon`, pour lire `--primary` au lieu de `#0c4a6e`. (le contrôle C la signalait comme exception sans site). Le fichier lui-même n'a plus aucun libellé en dur (vérifié avec `compteFichier`) | fiche (carte de localisation) |
| `takussan-web/src/data/navigation.ts:85` | `{ labelKey: 'buy', …, active: true }` (et `active: false` sur les deux autres) | retirer le champ `active` | le champ n'est plus lu : `Navbar` calcule l'état actif depuis l'URL (`lienActif`). Tel quel, il reste un faux repère pour le prochain lecteur | menu mobile, toutes pages publiques |
| `takussan-web/src/lib/utils.ts:24-32` | `formatRelativeDate` fige `new Intl.RelativeTimeFormat('fr', …)` et `"aujourd'hui"` | prendre la locale en paramètre (ou migrer les appelants vers `components/property/cards/useDateRelative.ts`) | le texte reste en français sous `/en`. Appelants restants : `components/playground/PropertyCard{Compact,Wide,Local}.tsx` (POC, non retouchés) | `/playground` |
| `takussan-web/src/components/admin/super/SuperAdminPropertiesTable.tsx:216` | `/{RENT_PERIOD_SHORT[row.rent_period]}` (libellés français en dur) | `useTranslations('property.rentPeriodsShort')` comme les cartes | `RENT_PERIOD_SHORT` n'est gardé dans `cards/types.ts` que pour ce lecteur (commentaire posé). À supprimer ensuite | `/super-admin/properties` |
| `takussan-web/src/components/bookings/BookingTunnel.tsx:182-196` (et le reste du tunnel) | `text-stone-600` ; `<Button>` taille par défaut (32 px, 40 px sous `sm`) pour « Retour au bien » / « Se connecter » | `text-muted-foreground` ; `size="lg"` + `h-11 px-4` | couleur brute hors jetons ; cibles sous 44 px au pouce. `components/bookings/**` n'est pas dans le périmètre B alors que la page `/bookings` l'est | `/bookings?property=…` |
| `takussan-web/src/components/bookings/BookingTunnel.tsx` (colonne du récapitulatif) | le parent de `BookingSummary` a la hauteur de l'`aside` (386 = 386 px mesuré) | colonne étirée à la hauteur de la rangée de la grille (sans `self-start` sur l'enveloppe, ou `h-full`) | sans cela, `lg:sticky lg:top-40` est inerte | `/bookings?property=…` |
| `takussan-web/src/components/ui/button.tsx:44-46` | `default: h-8 … max-sm:min-h-10`, `lg: h-9` | une taille de CTA public à 44 px (`xl: h-11 px-4`, par exemple) | chaque appel à l'action public surcharge localement `h-11 px-4` (états vides de compare, favoris, bookings, profils, fiche). Une taille dédiée éviterait la surcharge répétée | site public |

## Écartés
| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| cartes (`PropertyPhoto`) | liseré d'image `outline` noir/10 | classe de palette brute refusée par la garde ; `--scrim` n'y est admis que derrière un préfixe de fond. Le fond `bg-muted` du repli suffit à détacher la carte |
| rangées de l'accueil | défilement horizontal pleine largeur (bord à bord) | refonte de la mise en page, hors affinage ; zone TCK-505 voisine |
| rangées de l'accueil | `EmptyState` pour une rangée vide ou en erreur | une rangée vide se retire ; un gros état vide au milieu de l'accueil serait pire |
| surtitres (« PRÈS DE TOI ») | suppression (impeccable proscrit les surtitres) | `docs/design-guidelines.md` les prescrit, et la guideline prime |
| fiche, bien à louer | copie « Postuler » | texte factuel du produit, sans raison forte de le changer |
| `PropertyLocationMapInner` | `alt` du marqueur | un `divIcon` n'a pas d'`<img>`, donc l'`alt` est perdu. Le `title` (« Marqueur de bien ») est gardé et le SVG est `aria-hidden` |
| `Navbar.tsx:304,321` (détecteur : `border-accent-on-rounded`) | retirer `border-b-2` des puces de catégorie | faux positif : c'est l'indicateur d'onglet actif (soulignement), et l'arrondi `rounded-t-lg` ne sert qu'au fond de survol. Zone du correctif TCK-505 |
| `/fr/favorites` à 360 | grille à 2 colonnes comme la liste | `CARD_SIZES_FAVORITES_PUBLIC` est calé sur 1/2/3 colonnes ; la page reste lisible en 1 colonne |
| `/fr/playground` | débordement de 69 px à 360, textes < 12 px | POC : revue légère demandée, pas de polissage |
| `CompareTable` (bureau) | teinte inversée (lignes identiques en blanc, lignes divergentes teintées) | c'est la sémantique voulue de TCK-082 ; la pastille « Diffère » la rend désormais explicite |
| liens-titres en ligne (`lt24`, 20 px de haut) | agrandir | texte courant : exemption des cibles en ligne |

## Vérification
Toutes les commandes ont été lancées le 2026-09-16, sur l'arbre partagé, après la dernière modification.

- `cd takussan-web && npx vitest run src/components/{home,search,property,public,compare,contact,share,favorites,map,reviews,agents,playground} "src/app/[locale]"` → **68 fichiers, 540 tests, tous verts** (relancé après la passe complémentaire). Un test mis à jour : `(public)/__tests__/etats-publics.test.tsx` (squelette de `/bookings`, voir la page).
- `npx eslint <les 72 fichiers du périmètre modifiés>` → **0 erreur**. Un seul avertissement, préexistant, dans un test non modifié (`compare/__tests__/CompareTable.test.tsx:20`, `<img>` dans un mock).
  - Le dernier avertissement (`useMemo` inutilisé dans `map/PropertyMap.tsx`, déjà présent avant) a été retiré.
  - Une erreur `react-hooks/purity` sur `useDateRelative` (appel à `Date.now` dans le hook) a été corrigée en sortant le calcul du hook.
- `npx tsc --noEmit` → **0 erreur** (projet entier).
- Gardes à la racine :
  - `check-public-chrome-tokens` ✓ (0 classe brute sur 89 fichiers)
  - `check-app-tokens` ✓
  - `check-feedback-states` ✓
  - `check-destructive-contrast` ✓ (minimum 4,55:1)
  - `takussan-web/scripts/check-classes-emises.mjs` ✓ (1721 classes après la passe complémentaire, toutes émises ; l'arbitraire `drop-shadow-[…]` de l'épingle est compris)
  - `check-super-admin-tokens` ✗, **hors périmètre B** : cliquets « tableau de bord /app » (18 contre 25) et « assistants d'onboarding » (0 contre 24) à resserrer, travail des groupes C/D-F.
  - `check-status-badge-unique` ✗, **hors périmètre B** : `components/announcements/GlobalAnnouncementBanner.tsx:14,15`.
- `takussan-web/scripts/check-i18n-namespaces.mjs` ✗, **hors périmètre B** : nouvelle frontière `(dashboard)/app/[...introuvable]` (groupes D-F). Les clés ajoutées par B vivent toutes dans des espaces déjà déclarés (`property`, `search`, `compare`).
- `takussan-web/scripts/check-i18n.mjs` → **exit 0**. Parité en 0/0 et wo 0/0 sur 5703 clés ; 0 libellé en dur non justifié. Relancé après la passe complémentaire, une fois l'exception périmée retirée côté intégration.
- Clés i18n ajoutées par `i18n-set.mjs`, dans les trois langues :
  - `property.cards.photoPending`
  - `search.toolbar.sortAria`
  - `property.detail.favoriteAddShort`
  - `property.detail.favoriteSavedShort`
  - `property.detail.agent.call`
  - `property.detail.agent.calling`
  - `compare.table.divergentShort`
- Détecteur impeccable (`detect.mjs --json`, sur les 71 fichiers de code modifiés à la première passe, puis sur les 6 fichiers ajoutés par la passe complémentaire, sans trouvaille) → 2 trouvailles, toutes deux `border-accent-on-rounded` sur `Navbar.tsx:304,321`. Faux positifs, voir Écartés.
- Contre-relevés : chaque section de page ci-dessus porte le sien, avec sa preuve de version lue dans le DOM (`--eval`). Captures dans `$S/shots/b/{avant,apres,agent,i18n,i18n-apres}`.

**Non mesuré** :
- colonne « Bien indisponible » du comparatif avec des ids publics (vue seulement avec des ids non publics) ;
- favoris d'un compte connecté (`FavoritesList`, tableau de bord) ;
- tunnel de réservation au-delà de l'écran d'accueil (parcours qui écrit en base) ;
- envoi des dialogues de contact et de visite (écriture).
