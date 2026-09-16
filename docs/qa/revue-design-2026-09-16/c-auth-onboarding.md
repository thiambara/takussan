# Revue design — c-auth-onboarding (2026-09-16)

**Verdict : Needs changes** — tous les défauts HIGH et MEDIUM de mon périmètre sont corrigés et
contre-mesurés. Il reste 3 collisions hors périmètre, dont une garde rouge du fait même de la
correction (le cliquet `/onboarding` doit descendre de 24 à 0), et un défaut produit (liens CGU en 404).

Pages couvertes : 15/15 routes (7 `/auth/*`, 8 `/onboarding/*` + `/publish`) · Corrections :
22 fichiers (+ 3 dictionnaires par `i18n-set.mjs`) · Collisions : 3 · Non mesuré : parcours au-delà
de l'étape 2 (hôte), étapes 2 à 4 (agent, propriétaire, prestataire), défi 2FA,
succès des liens transactionnels (tous exigent un envoi à l'API ou un état en base).

Mode impeccable : **Operate** (formulaires). Banc : `probe.mjs --port 9343`, captures dans
`scratchpad/shots/c/{avant,apres}`. Chrome 9343 tué en fin de passe.

## Constats d'environnement (pas des défauts de code)

1. **OAuth et CORS : cause établie, puis corrigée par la session principale.** Le premier relevé a
   été pris sur `127.0.0.1:3000`, alors que l'API n'autorise que `http://localhost:3000`. Tout
   appel client était donc refusé, et `/auth/login` comme `/auth/register` affichaient « Impossible
   de charger les fournisseurs d'authentification. ». **Ce relevé est faux pour les états qui
   dépendent de données client.** Le banc sert désormais `localhost:3000`. **Nouveau relevé
   (v2)** sur login, register, owner et service-provider : 5/5 ✓, docOverflow 0. Le bouton
   « Continuer avec Google » est rendu à 390 et à 1366 sur les deux pages, **44 px**, sans aucune
   alerte. Il se place au-dessus du séparateur sur la connexion, en dessous sur l'inscription
   (captures `shots/c/v2/oauth-*`). Les autres pages de mon périmètre n'ont pas de données client
   qui dépendent de CORS : les assistants passent par le proxy Next same-origin, les pages
   `(auth)` restantes n'appellent l'API qu'à la soumission. Leurs relevés restent valables.
2. **Ouvrir un assistant écrit en base** (effet de bord, signalé à la session principale et
   validé par elle). Dès l'hydratation, l'autosave de `WizardReprenable` envoie un PUT sur
   `/api/me/wizard-drafts/{key}` : une simple visite suffit à écrire une ligne. Relevé en fin de
   passe, `wizard_drafts` :
   id=1 (user 302 no_profile, `host-individual-wizard`, step 0) ·
   id=2 (user 3 agent, `agent-onboarding-1`, step 0) ·
   id=3 (user 7 owner, `owner-onboarding-1`, step 0) ·
   id=4 (user 17 provider, `sp-onboarding-1`, step 0).
   Pour avancer d'une étape, mes `--eval` interceptent les PUT suivants (`bloques: ["PUT"]`),
   d'où `step 0` sur id=1 alors que la sonde a atteint l'étape 2. **Je ne les ai pas supprimées** :
   la session principale s'en charge.

## Pages

### `/auth/login` — anon
Relevé avant : 360 ✓ · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓ (docOverflow 0 partout) ; lt24 = 3
(œil 20×16, « Mot de passe oublié ? » 123×16, « S'inscrire » 62×18).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `login/page.tsx` | `?error=oauth_invalid/failed/unknown` (posé par le callback OAuth) n'était lu par personne | bandeau `FormGlobalError` + 3 clés `auth.login.oauthError.*` (fr/en/wo) | un échec Google ramenait sur un formulaire muet : état trompeur |
| MEDIUM | `login/page.tsx` (+ register, reset) | bascule « Afficher le mot de passe » 20×16 px | `BASCULE_MOT_DE_PASSE` : 40×40, anneau de focus (`components/auth/cibles.ts`) | cible tactile sous 24 px |
| MEDIUM | `login/page.tsx` | « Mot de passe oublié ? » en `text-xs`, 16 px de haut | `text-sm` + `CIBLE_LIEN_EN_LIGNE` (pseudo-élément −12 px en hauteur) | lien clé illisible et difficile à toucher |
| MEDIUM | `login/page.tsx:194` | `border-green-100 bg-green-50 text-green-700` | `border-success/20 bg-success/10 text-success` | palette brute, pas de thème sombre |
| MEDIUM | `OAuthButtons.tsx` + pages | séparateur « ou continuer avec email » posé par la page, même sans aucun bouton | séparateur rendu par `OAuthButtons` (`separator="before/after"`), masqué quand aucun fournisseur n'est configuré | séparateur orphelin |
| LOW | `OAuthButtons.tsx` | texte « Chargement des fournisseurs… » puis saut de mise en page ; phrase dev « Aucun fournisseur OAuth n'est configuré sur cet environnement » visible | silhouette `h-11` (texte en `sr-only`) ; phrase dev retirée | pas de décalage, pas de jargon d'environnement pour l'utilisateur |
| LOW | `login/page.tsx` | placeholder littéral `........` | retiré | faux contenu dans le champ |
| LOW | `login/page.tsx` (défi 2FA) | « Utiliser un code de secours » et « Annuler » en texte nu (~20 px) ; code sans `tabular-nums` | `min-h-11` + focus ; `tabular-nums tracking-widest` | cibles, chiffres stables |
| LOW | toutes les pages `(auth)` | titres et sous-titres sans habillage | `text-balance` sur les `h1`, `leading-relaxed text-pretty` sur les sous-titres | rythme, orphelines |

Contre-relevé : 5/5 ✓ (docOverflow 0). `requestSubmit()` sur le formulaire vide : 2 erreurs en
ligne (« L'adresse e-mail est requise. », « Le mot de passe est requis. »), bascule **40×40**.
Preuve de version : 2 éléments portent `after:-inset-y-3`. `?error=oauth_failed` : bandeau rendu
aux 5 largeurs. Le lt24 restant (liens en ligne) est un faux positif : la sonde mesure la boîte,
pas le pseudo-élément.

### `/auth/register` — anon
Relevé avant : 5/5 ✓ ; lt24 = 6.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `register/page.tsx` | deux bascules 20×16 | `BASCULE_MOT_DE_PASSE` 40×40, `pr-12` | cible tactile |
| MEDIUM | `register/page.tsx` | `OAuthSeparator` orphelin | `<OAuthButtons separator="before" separatorLabel=…>` | idem connexion |
| LOW | `register/page.tsx` | liens CGU/confidentialité sans poids ; « Se connecter » à 18 px | `font-medium underline-offset-4` ; `CIBLE_LIEN_EN_LIGNE` | lisibilité, cible |

Contre-relevé : 5/5 ✓. Formulaire vide soumis : 6 erreurs en ligne, dont « Vous devez accepter les
conditions générales. ». Bascules 40×40. Restent en lt24 la case CGU 16×16 (primitive
`FormCheckbox`, cf. Collisions) et les deux liens dans le libellé de la case, écartés.
Test `auth-form-ux.test.tsx` : double de `OAuthButtons` mis à jour ; l'intention (ordre
formulaire → OAuth, présence du séparateur) est gardée.

### `/auth/forgot-password` — anon
Relevé avant : 5/5 ✓ ; lt24 = 1.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `forgot-password/page.tsx:34` | pastille de succès `bg-green-50 text-green-600` | `bg-success/10 text-success`, icône `aria-hidden` | palette brute |
| LOW | idem | champ email sans réglages clavier ; « Retour » à 18 px | `autoCapitalize="none" spellCheck={false}` ; `CIBLE_LIEN_EN_LIGNE` | clavier mobile, cible |

Contre-relevé : 5/5 ✓. L'état « envoyé » n'est pas mesuré : il exige un POST.

### `/auth/reset-password?token=x&email=a@b.c` et `/auth/reset-password` (lien invalide) — anon
Relevé avant : 5/5 ✓ dans les deux états.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `reset-password/page.tsx:90` | bandeau d'erreur `text-red-600 bg-red-50 border-red-100` | `FormGlobalError` (jetons `--destructive`) | palette brute, deux dialectes d'erreur |
| MEDIUM | idem | erreurs de champ en `<p>` nus, sans lien avec le champ | `FormError` + `aria-invalid` / `aria-describedby` | le lecteur d'écran n'associait pas l'erreur au champ |
| MEDIUM | idem | bascules 20×16 | `BASCULE_MOT_DE_PASSE` centrée (`my-auto`) | cible tactile |

Contre-relevé : 5/5 ✓ dans les deux états (h1 « Nouveau mot de passe » / « Lien invalide »).

### `/auth/verify-email` — anon
Relevé avant : 5/5 ✓ ; lt24 = 1 (« Continuer vers le tableau de bord », 20 px).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `verify-email/page.tsx:37,45` | `text-green-700 bg-green-50…` / `text-red-600 bg-red-50…` | `bg-success/10 text-success` / `FormGlobalError` | palette brute |
| MEDIUM | idem | lien secondaire à 20 px | `min-h-11`, anneau de focus | cible tactile |

Contre-relevé : 5/5 ✓, lt24 = 0.

### `/auth/verify-email/1/abc` — anon (état d'échec)
Relevé avant : 5/5 ✓ ; lt24 = 1.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| HIGH | `verify-email/[id]/[hash]/page.tsx` | `<Link><Button/></Link>` : un `<button>` dans un `<a>` | `Link` stylé par `buttonVariants()` | HTML invalide, deux arrêts de tabulation pour une action |
| MEDIUM | idem | pastille de succès `bg-green-50 text-green-600` | `bg-success/10 text-success` | palette brute |

Contre-relevé : 5/5 ✓, lt24 = 0. L'état de succès n'est pas mesuré : il exige un lien signé valide.

### `/auth/oauth/google/callback` — anon
Sans `code` ni `state`, la page renvoie immédiatement vers `/auth/login?error=oauth_invalid`. Avant
correction, cette page n'affichait rien de l'erreur (d'où le HIGH ci-dessus). Après correction :
bandeau « La connexion avec le fournisseur n'a pas abouti… ». Le rendu propre de la page (loader)
est trop bref pour être capturé.

### Coque `(auth)/layout.tsx` — toutes les pages ci-dessus

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| LOW | `layout.tsx:69` | `to-black/60` | `to-scrim/60` | jeton de voile (TCK-384) |
| LOW | `layout.tsx` | logo sur photo sans anneau de focus ; logo mobile ~28 px de haut | `min-h-11`, `focus-visible:ring-primary-foreground/70` | clavier et pouce |
| LOW | `layout.tsx` | titre du panneau sans `text-balance` / `tracking-tight` | ajoutés | typographie |

1366 : aucune régression, captures comparées.

### `/onboarding/intention` — no_profile ; agent (déjà un profil)
Relevé avant (no_profile) : 5/5 ✓. `agent` : redirigé vers `/app`, comme attendu (aucune
question à poser).

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `QuestionDIntention.tsx` | « Continuer » en `h-9` et « Je verrai plus tard » à ~28 px, côte à côte | au téléphone : action principale pleine largeur en `h-11`, « plus tard » dessous en `min-h-11` ; en ligne dès `sm` | cibles tactiles, action principale évidente |

Contre-relevé : 5/5 ✓, lt44 7 → 4 (les deux `input.sr-only` 1×1 sont les radios de `ChoiceCard`,
dont la carte entière est la cible : faux positif).

### `/onboarding/host` — no_profile (+ étape 2)
Relevé avant : **360 ✗ (docOverflow 10)** · 390 ✓ · 768 ✓ · 1024 ✓ · 1366 ✓.

Diagnostic : l'étape entrait avec `translateX(26px)` (`.wizard-step-in-forward`) **dès le premier
rendu**. Sur le viewport mobile, ces 26 px élargissaient la mise en page pendant l'animation, et le
débordement persistait. Il ne se reproduisait qu'à la première largeur de chaque passe, ce qui
signe une cause transitoire.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `WizardReprenable.tsx` | `direction` initiale `'forward'` : animation d'entrée jouée au chargement | `direction` initiale `null` : aucune animation à l'arrivée ni à la reprise ; conteneur `-mx-1 overflow-x-clip px-1` autour de l'étape | débordement horizontal à 360 ; une animation au chargement ne signale aucun changement d'état |
| MEDIUM | `WizardReprenable.tsx` | champs d'étape à 32 px (`h-8`) | `{...fieldDensityScope()}` sur la racine : tous les `Input` / `SelectTrigger` des 4 assistants passent à 44 px | cibles tactiles sur des écrans remplis au téléphone |
| MEDIUM | `WizardReprenable.tsx` | Précédent / Suivant en `h-9` | `h-11` (Suivant `min-w-32`) | cibles tactiles |
| MEDIUM | `HostIndividualWizard.tsx:497,501` | pastilles OTP `bg-emerald-100…` / `bg-amber-100…` | `StatusBadge tone="success"/"attention"` | palette brute ; décideur de statut unique (TCK-472) |
| MEDIUM | `HostIndividualWizard.tsx:620` | avertissement `bg-amber-50 text-amber-900` | `border-warning/20 bg-warning/10 text-warning` | palette brute |
| MEDIUM | idem (OTP) | boutons Envoyer / Vérifier en `h-8` à côté de champs de 44 px | `h-11`, pleine largeur sous `sm` | alignement, cible |
| LOW | idem | champ téléphone sans `autoComplete` ; placeholder `+221...` ; code sans chiffres tabulaires | `autoComplete="tel"`, `+221…`, `tabular-nums tracking-widest` | remplissage automatique, typographie |
| LOW | idem (récapitulatif) | case CGU nue (`mt-1`), lignes `py-2` qui ne passent pas à la ligne | libellé entier cliquable, `accent-primary`, anneau `has-[:focus-visible]` ; `dd` à droite avec `break-words` | cible, longues valeurs |
| LOW | idem (squelette géo-IP) | barre + boîte bordée, sans texte ni pulsation | squelette de la forme réelle, `sr-only` « chargement », `motion-safe:animate-pulse` | état de chargement annoncé |
| LOW | idem (avis professionnel) | lien mailto et « continuer en particulier » à ~20 px | `min-h-11` + focus | cibles |

Contre-relevé : 5/5 ✓ (docOverflow 0 à 360, sur 3 passes). Preuve de version : `.overflow-x-clip`
présent, 0 `.wizard-step-in-forward` au chargement. **Étape 2 atteinte** à 360 / 390 / 1366
(« Votre espace »), champs **44 px**, Suivant **44 px**, docOverflow 0 ; le PUT d'autosave a été
intercepté (`bloques: ["PUT"]`). Étape 3 non mesurée : elle exige un OTP vérifié.

### `/publish` — no_profile
Page de transit : elle redirige vers `/onboarding/host`. Selon la vitesse de la sonde, la capture
montre soit « Préparation de votre annonce… », soit l'assistant. Aucun défaut, aucune
modification.

### `/onboarding/owner`, `/onboarding/agent`, `/onboarding/agency-admin`, `/onboarding/service-provider` — no_profile
Les quatre redirigent vers `/app` (h1 « Bonjour Awa »), comme attendu pour un compte sans profil.

### `/onboarding/agent` — agent
Relevé : 5/5 ✓ (mesuré après correction ; aucun relevé « avant » pour ce rôle). Étape 1 hydratée
(capture 390) : champ téléphone et bouton « Envoyer le code » à 44 px, pleine largeur.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `AgentOnboardingWizard.tsx:319`, `OwnerOnboardingWizard.tsx:288`, `ServiceProviderOnboardingWizard.tsx:355` | bandeau « vérifié » `bg-emerald-50 text-emerald-900` | `role="status"` + `border-success/20 bg-success/10 text-success` | palette brute |
| MEDIUM | les 3 assistants (OTP) | boutons `h-8` ; `autoComplete` absent | `h-11` pleine largeur sous `sm` ; `autoComplete="tel"`, `tabular-nums` sur le code | cibles, clavier |
| LOW | `AgentOnboardingWizard.tsx` (premier prospect) | carte-lien sans focus visible ; libellé `text-xs` | `focus-visible:ring-3`, `transition-colors`, `min-w-0`, `text-sm` | clavier, lisibilité |
| LOW | Agent/Owner (KYC) | bouton Soumettre `h-8` | `h-11 px-5` | cible |

Étapes 2 à 4 non mesurées (elles exigent l'OTP).

### `/onboarding/owner` — owner ; `/onboarding/service-provider` — provider
Relevé (v2, localhost, après correction) : 5/5 ✓ pour les deux, docOverflow 0, lt24 = 0. Étape 1
hydratée (capture provider 390) : champ téléphone 44 px, « Envoyer le code » 44 px pleine largeur,
« Étape 1 sur 4 ». Pas de relevé « avant » pour ces rôles (visites reportées, voir Constats 2).
Étapes suivantes non mesurées : elles exigent l'OTP.

#### Assistant propriétaire (`OwnerOnboardingWizard`) — corrections

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `OwnerOnboardingWizard.tsx:412-421` | points du tour en `role="tablist"` sans aucun `tab` ; `transition-all` | points `aria-hidden` + position `sr-only aria-live` (« 1 / 3 ») ; `transition-[width,background-color] duration-200` | a11y trompeuse ; `transition-all` interdit |
| LOW | idem | Passer / Suivant en `h-8` ; lien « Voir » `text-xs` ; titre de bien non tronqué | `h-11` ; `min-h-11 text-sm` + focus ; `truncate min-w-0` | cibles, longues valeurs |

### Accueil prestataire multi-agences (`ServiceProviderMultiAgencyWelcome`) — non atteint (état en base), corrigé au code

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `ServiceProviderMultiAgencyWelcome.tsx:68-69` | statut `emerald-50` / `amber-50` en ternaire | `StatusBadge tone="success"/"attention"` | palette brute, décideur unique |
| MEDIUM | idem | `<h1>` dans une coque qui porte déjà le `h1` | `<h2>`, aligné à gauche comme la coque | deux `h1` sur la page |
| LOW | idem | carte bordure + ombre ; CTA `h-8` centré | bordure seule ; CTA `h-11`, pleine largeur sous `sm` ; noms tronqués | élévation déclarée une fois ; cible |

### `/onboarding/agency-admin` — agency_admin (+ étape 2FA)
Relevé avant : 5/5 ✓, mais la page n'avait **aucune chrome** (ni marque ni sortie), une carte
`bg-white` bordée et ombrée, et le bouton « Continuer » en `h-8`.

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| MEDIUM | `app/onboarding/agency-admin/page.tsx` | assistant rendu nu, sans issue | enveloppé dans `OnboardingShell` (sans titre, `note={null}`), qui accepte désormais `title?` et `note: null` | même raison qui a fait naître la coque : un formulaire sans marque et sans sortie |
| MEDIUM | `AgencyAdminOnboardingWizard.tsx` | `ArrowRight` enfant direct de l'`<ol>` ; pastilles sans `aria-current` | flèche dans un `<li aria-hidden>` ; `aria-current="step"` | HTML invalide, étape courante non annoncée |
| MEDIUM | idem | `bg-white` (×2) | `bg-card`, sans ombre (bordure seule) | palette brute ; élévation déclarée une fois |
| MEDIUM | idem (étape 2FA) | aucun `h1` : la page passait de rien à un `h3` | `h1` `sr-only` « Sécurité », titres de `TotpEnrollment` passés en `h2` | hiérarchie des titres |
| LOW | idem | CTA `h-8` ; icône nue | `h-11` pleine largeur sous `sm` + flèche ; icône dans une pastille `bg-primary/10` | cible, cohérence avec les écrans d'état de `(auth)` |
| MEDIUM | `TotpEnrollment.tsx:127,196,223,167` | `text-red-600` ×2, bloc de codes `amber-*`, QR sur `bg-white` | `text-destructive`, `border-warning/25 bg-warning/10 text-warning`, `.qr-surface` (jeton fonctionnel prévu pour le QR) | palette brute ; le QR reste blanc dans les deux thèmes |
| LOW | `TotpEnrollment.tsx` | boutons `h-8` ; libellé du code en `text-xs` gris ; case d'accusé à 16 px sans zone ; icône bouclier écrasée à ~8 px par le flex (vu en capture) | `h-11` ; `text-sm font-medium` ; libellé `min-h-11` ; `shrink-0` ; codes de secours en `tabular-nums`, une colonne sous 400 px | cibles, lisibilité |

Contre-relevé : 5/5 ✓. Preuve de version : lien de sortie `header a[href="/"]` présent, CTA
**44 px**. Après clic sur Continuer : `h1` = « Sécurité », `h2` = « Renforcez la sécurité de votre
compte » (capture 390 vérifiée). Les étapes suivantes (QR, codes de secours) ne sont pas mesurées :
elles exigent `twoFactorEnableAction`.

### `/onboarding/super-admin` — super_admin
Redirige vers `/super-admin` : le compte est déjà confirmé, sans 2FA en attente. L'assistant
(`components/super-admin/SuperAdminOnboardingWizard`) appartient au groupe H. Non mesuré ici.

### `WizardDraftsBanner` (monté sur `/app`, accueil — pages D/E/F)

| Sévérité | Emplacement | Avant | Après | Pourquoi |
|---|---|---|---|---|
| LOW | `WizardDraftsBanner.tsx:95` | pastille-lien `text-xs py-1.5` (~28 px), `transition` générique, sans focus | `min-h-10 px-4 text-sm`, `transition-[background-color,scale]`, `active:scale-[0.96]`, anneau de focus ; titre `font-semibold` | cible, transition explicite |

Non capturé : la bannière ne s'affiche qu'avec un brouillon repris, et aucun des brouillons créés
ci-dessus n'a d'URL de reprise pour ces rôles sur `/app`.

## Collisions (hors périmètre — NON appliquées)

| Fichier:ligne | Avant | Après | Pourquoi | Pages touchées |
|---|---|---|---|---|
| `scripts/check-super-admin-tokens.mjs:1798` (et le docblock l. 1784) | `plafondReste: 24,` | `plafondReste: 0,` avec la date du 2026-09-16 et la mention de cette revue | **La garde est ROUGE à cause de la correction** : « assistants d'onboarding — le reste vaut 0, alors que le cliquet dit 24 ». Le cliquet est bilatéral, il doit suivre la baisse. (La même garde signale aussi « /app — 19 contre 25 », qui ne vient pas de mon périmètre.) | CI dépôt |
| `src/components/forms/FormCheckbox.tsx` (case `size-4`) | case de 16×16, seule cible mesurée sous 24 px sur `/auth/register` | case `size-5`, ou libellé en `min-h-11` avec toute la ligne cliquable (la forme posée dans `HostIndividualWizard` : `label` + `has-[:focus-visible]:ring`) | WCAG 2.2 §2.5.8 ; pouce | `/auth/register`, tout formulaire RHF à case |
| `src/components/ui/button.tsx:8` | `transition-all` dans la base de `buttonVariants` | `transition-[color,background-color,border-color,box-shadow,translate]` | `transition-all` est interdit par le brief et par make-interfaces-feel-better (§14). Tous les boutons de mon périmètre en héritent sans pouvoir le corriger localement. | toutes |

**Défaut produit, à arbitrer (pas une collision de code)** : les liens CGU et confidentialité
mènent tous à un 404. Mesuré par `curl -L` : `/terms` → `/fr/terms` **404**, `/privacy` →
`/fr/privacy` **404**, `/legal/cgu` → `/fr/legal/cgu` **404**. Sites concernés : `/auth/register`
(case obligatoire) et le récapitulatif de `/onboarding/host` (case obligatoire). On demande donc un
consentement à un texte introuvable. Il manque des pages publiques (groupe B ou produit) ; je n'ai
pas touché aux liens.

**Garde voisine déjà rouge, pas de mon fait** : `check-status-badge-unique` →
`components/announcements/GlobalAnnouncementBanner.tsx:14,15`. `npm run check:i18n` →
`[locale]/(public)/properties/[slug]/components/PropertyLocationMapInner.tsx` (groupe B).
`tsc` → `components/pipeline/PipelineColumn.tsx:86`.

## Écartés

| Emplacement | Candidat | Écarté parce que |
|---|---|---|
| `(auth)/layout.tsx` | remplacer `text-white` / `text-white/85` sur la photo par un jeton | le texte doit rester clair sur la photo dans les deux thèmes, comme `PropertyCardCover` ; aucun jeton « encre sur photo » n'existe, et `--primary-foreground` n'en est pas un. La garde de chrome publique reste verte. |
| `register/page.tsx` | `CIBLE_LIEN_EN_LIGNE` sur les liens CGU / confidentialité | ils vivent dans le libellé de la case : une zone étendue volerait les clics destinés à la case. |
| `auth.*.backToLogin` | la flèche `←` écrite dans la traduction | c'est un texte factuel des trois dictionnaires ; le remplacer par une icône Lucide demanderait de retoucher les trois langues pour un gain faible. |
| `OnboardingShell` / pages | `active:scale-[0.96]` sur les boutons principaux | la primitive `Button` porte déjà son propre retour d'appui (`active:translate-y-px`) : un second geste local divergerait du reste du produit. |
| `AgentOnboardingWizard` | les étiquettes `text-xs uppercase` (brouillon / soumis) | ce sont des états, pas des sur-titres de section ; les passer en `StatusBadge` demanderait de trancher le ton de chacun (TCK-385). |
| `login/page.tsx` | `autoCapitalize` sur le champ email de `FormInput` | `type="email"` coupe déjà la majuscule automatique sur iOS et Android. |

## Vérification

- `npx vitest run src/components/auth src/components/onboarding src/components/wizard src/app/onboarding "src/app/(auth)"`
  → **12 fichiers, 44 tests verts**.
- `npx eslint` sur les 22 fichiers modifiés ou créés → **0 problème** (sortie 0).
- `npx tsc --noEmit` (projet entier, 16 s) → **1 erreur, hors périmètre** :
  `src/components/pipeline/PipelineColumn.tsx(86,12)` TS2322 (`ErrorState`). Aucune dans mes fichiers.
- Gardes :
  - `check-app-tokens` ✓ · `check-public-chrome-tokens` ✓ · `check-feedback-states` ✓ ·
    `check-destructive-contrast` ✓ (minimum 4,55:1).
  - `check-classes-emises` ✓ : 1662 classes, toutes émises.
  - `check-super-admin-tokens` ✗ : le cliquet `/onboarding` doit passer de 24 à **0**, voir
    Collisions. Elle signale aussi « /app — 19 contre 25 », qui ne vient pas de moi.
  - `check-status-badge-unique` ✗ : `GlobalAnnouncementBanner.tsx`, hors périmètre. Mes deux
    `StatusBadge` ne déclenchent aucun contrôle.
  - `npm run check:i18n` ✗ : 2 écarts, tous deux sur `PropertyLocationMapInner.tsx` (groupe B).
    Mes 3 clés ont leurs trois langues.
- Détecteur : `node …/impeccable/scripts/detect.mjs --json <21 fichiers hors tests>` → `[]`.
- Base : `wizard_drafts` lue en fin de passe → 4 lignes créées par les visites, ids 1 à 4 (voir
  Constats 2). Aucune autre écriture.
- Chrome 9343 tué (`pgrep` → 0).
