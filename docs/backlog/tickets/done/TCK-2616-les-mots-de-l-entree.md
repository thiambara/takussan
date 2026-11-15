---
id: TCK-2616
title: "Les mots de l'entrée : le vouvoiement partout, plus d'anglicismes ni de « Valider », F CFA partout, et plus de note qui promet un brouillon qui n'existe pas"
status: done
phase: P2
family: front
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-11
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#21-authentification--comptes"
tags: [front, i18n, copy, onboarding, audit-ux, app]
---

## Objectif utilisateur

La personne qui entre dans Takussan lit un français simple et constant : on la vouvoie partout, avant comme après la création de son compte, et aucun mot technique ou anglais ne l'arrête.

## Contrat de données

Aucun changement d'API. Re-mesure sur `dev` (1bce3798a), surfaces de la famille 2 (connexion, inscription, oubli, vérification, orientation, publier, invitation, assistants bailleur / agent / prestataire / administrateur / hôte) : tutoiement et vouvoiement mêlés sur un même écran ; « lead », « wizard », « dashboard », « KYC », « TOTP » visibles ; bouton « Valider » (clé `verifyCode`, et autres) ; montants « XOF » ; « vraie agence » ; « Vous êtes invité » au masculin seul ; note de pied « Vos réponses sont enregistrées au fur et à mesure » sur des écrans qui n'enregistrent rien.

## Direction UX / Artistique

- Règle de ton : **vouvoiement partout** ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10 par le porteur : il remplace la décision 2 c « tutoiement jusqu'au compte »). Aucun écran ne dépend de la session pour choisir sa voix, et aucun message ne porte la voix en argument. Le delta de charte (`docs/design-guidelines.md`, § « Ton & Micro-copy ») est porté par TCK-2683.
- Remplacements : « lead » → « prospect » (vocabulaire du pipeline arrêté avec la famille 5) ; « wizard » → « assistant » ; « dashboard » → « espace » ; « KYC » → « pièces » ; « TOTP » → « application d'authentification » ; « Valider » → le verbe de l'action (« Vérifier le code », « Envoyer mes pièces », « Rejoindre Dakar Immo ») ; « XOF » → « F CFA » à l'affichage ; « vraie agence » → « agence » (ou « agence enregistrée » quand la distinction compte) ; « Vous êtes invité » → « Une agence vous invite » / « Dakar Immo vous invite ».
- La note « Vos réponses sont enregistrées au fur et à mesure » ne reste que là où un brouillon est réellement enregistré.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).
- Aucune clé supprimée sans que son dernier appelant soit migré ; les trois langues `fr`/`en`/`wo` gardent la même forme (wo : texte français tel quel, wolof en pause).
- Les codes de devise envoyés à l'API restent `XOF` : seul l'affichage change.
- `node scripts/check-i18n.mjs` reste vert.
- Les textes que TCK-2600, TCK-2601, TCK-2604, TCK-2608, TCK-2611, TCK-2613, TCK-2614 écrivent suivent déjà la règle : ce ticket traite le **reste** des surfaces d'entrée, y compris l'assistant administrateur d'agence (`/onboarding/agency-admin`), non dessiné.

## Delta à produire

- [ ] Relevé écrit, dans les notes, de chaque clé touchée (avant / après).
- [ ] Remplacements et règle de ton appliqués aux surfaces d'entrée.
- [ ] Tests : un test par surface qui vérifie l'absence des mots bannis dans le rendu `fr` ; « XOF » absent des montants affichés dans les assistants ; note de pied absente de la page d'invitation et de la connexion.

## Critères d'acceptation

- [ ] AC1 — Aucun des mots « lead », « wizard », « dashboard », « KYC », « TOTP », « Valider », « XOF » n'apparaît dans le texte rendu `fr` des surfaces d'entrée (sur `dev` : chacun apparaît au moins une fois).
- [ ] AC2 — Aucune forme du tutoiement n'apparaît dans le texte rendu `fr` des surfaces d'entrée, avec ou sans session (la garde de TCK-2683, si elle est mergée avant, est verte sur ces clés).
- [ ] AC3 — La note « Vos réponses sont enregistrées au fur et à mesure » n'apparaît sur aucun écran sans brouillon.

## Hors périmètre

- Les derniers textes au tutoiement du site public, la charte et la garde (TCK-2683).
- La traduction wolof.

## Notes d'implémentation

### Re-mesure de la prémisse (2026-11-11, arbre `acfe73fb3`)

Relevé par fermeture des imports depuis les pages d'entrée (`app/(auth)`, `app/onboarding`,
`app/invitations`, `app/publish`, + `PropertyWizard` et le bloc de coordonnées pour « publier ») :
76 fichiers, 597 chaînes `fr` sous leurs espaces de noms.

- **Mots bannis : confirmé**, 21 chaînes `fr` (liste ci-dessous) + deux que la prémisse ne nommait
  pas : l'étape « bienvenue » de l'assistant agent rend les libellés de capacités de l'éditeur de
  rôles (`admin.roles.capabilities.*`), dont « Gérer le dossier KYC » et « Valider une réservation ».
- **« XOF » : plus large que la prémisse.** Outre les deux libellés du prestataire, l'assistant hôte
  affiche le **code** brut dans le sélecteur de devise et au récapitulatif (`{c}` en dur, aucune clé).
  Le récapitulatif du prestataire affichait les tarifs en nombre nu (« 15000 »).
- **Tutoiement : la prémisse diffère.** Aucune chaîne `fr` des surfaces d'entrée ne tutoie sur cet
  arbre (0 sur 597) ; AC2 était déjà vert. Le test l'empêche de revenir sur ces surfaces ; la garde
  globale reste TCK-2683.
- **Note de pied : confirmée, et c'était le DÉFAUT de la coque.** `OnboardingShell` la montrait à
  tout écran qui ne passait pas `note={null}` : l'invitation (lien complet et lien incomplet),
  l'écran du prénom de l'orientation et l'accueil multi-agences du prestataire. La connexion ne
  l'a jamais portée (relevé : `curl /auth/login`, 0 occurrence).
- « Valider » est porté par deux clés : `auth.phoneLogin.verify` (connexion) et
  `property.form.publishContact.verifyCode` (publier).

### Ce qui change

- **La coque ne promet plus rien par défaut** : `OnboardingShell` prend `brouillon` (opt-in) ; seuls
  les quatre assistants montés sur `WizardReprenable` le passent (hôte, bailleur, agent, prestataire
  — pas l'accueil multi-agences). `note={null}` disparaît (administrateur d'agence).
- **Devise de l'hôte** : nouvelles clés `onboarding.host.steps.identity.currencies.{XOF,XAF,EUR,USD}`
  (« F CFA (Afrique de l'Ouest) »…), lues par le sélecteur et le récapitulatif ; la valeur envoyée
  reste `XOF`.
- **Tarifs du prestataire** : le récapitulatif formate par `formatCurrency` (« 15 000 F CFA »).
- **`wo`** : un texte wolof existant ne se réécrit pas (ADR-0095 § 4) ; seule la clé dont le `wo`
  recopiait le français (`visitFee`) et les clés neuves reçoivent le français. **`en`** : KYC, TOTP,
  XOF, wizard, dashboard et « real agency » retirés des clés touchées ; « lead » reste en anglais.

### Relevé des clés (avant → après, `fr`)

| Clé | Avant | Après |
|---|---|---|
| `auth.phoneLogin.verify` | Valider | Vérifier le code |
| `property.form.publishContact.verifyCode` | Valider | Vérifier le code |
| `auth.twoFactor.intro.description` | … à deux facteurs (TOTP) avec une application comme … | … à deux facteurs avec une application d'authentification, comme … |
| `serverActions.superAdminCooptation.invalidTotp` | Code TOTP invalide. | Code invalide : saisissez celui qu'affiche votre application d'authentification. |
| `agency.onboarding.welcome.body` | … avant de plonger dans votre dashboard. | … avant d'y entrer. |
| `agents.onboarding.steps.kyc.submitCta`, `owners.…` | Soumettre mon dossier KYC | Envoyer mes pièces |
| `agents.onboarding.steps.kyc.submittedTitle`, `owners.…` | Dossier KYC envoyé | Pièces envoyées |
| `agents.onboarding.errors.kycSubmitTitle`, `owners.…` | Soumission du KYC impossible | Envoi des pièces impossible |
| `serverActions.agentOnboarding.kycFailed`, `ownerOnboarding.…` | Impossible de soumettre votre dossier KYC. | Impossible d'envoyer vos pièces. |
| `agents.onboarding.steps.welcome.subtitle` | … vos premiers leads sont prêts. | … vos premiers prospects sont prêts. |
| `agents.onboarding.steps.welcome.firstLeadLabel` | Votre premier lead | Votre premier prospect |
| `agents.onboarding.steps.welcome.noLead` | Aucun lead pré-assigné pour le moment. | Aucun prospect ne vous est encore attribué. |
| `serverActions.agentOnboarding.firstLeadFailed` | … votre premier lead. | … votre premier prospect. |
| `onboarding.host.steps.intent.options.professional.title` | Professionnel (créer une vraie agence) | Professionnel (créer une agence) |
| `serviceProviders.multiAgency.subtitle` | … votre KYC et vos métiers sont mutualisés. | … vos pièces et vos métiers valent pour chacune. |
| `serviceProviders.onboarding.steps.trades.fields.hourlyRate` | Tarif horaire (XOF) | Tarif horaire (F CFA) |
| `serviceProviders.onboarding.steps.trades.fields.visitFee` | Frais de visite (XOF) | Frais de visite (F CFA) |
| `serviceProviders.onboarding.steps.recap.maintenanceRequest.body` | … dès la fin du wizard. | … dès la fin de l'assistant. |
| `invitationAccept.title` | Vous êtes invité sur Takussan | Une agence vous invite sur Takussan |
| `admin.roles.capabilities.agency.update_kyc` | Gérer le dossier KYC | Gérer les pièces de l'agence |
| `admin.roles.capabilities.bookings.validate` | Valider une réservation | Confirmer ou refuser une réservation |
| `onboarding.host.steps.identity.currencies.*` | *(neuves)* | F CFA (Afrique de l'Ouest) · F CFA (Afrique centrale) · Euro · Dollar américain |

Les deux libellés `admin.roles.capabilities.*` sont partagés avec l'éditeur de rôles de `/app` :
le changement s'y voit aussi, ce qui suit ADR-0095 (la règle vaut partout).

### Tests et ablations

- `src/components/onboarding/__tests__/mots-de-l-entree.tck-2616.test.ts` — 13 surfaces, espaces de
  noms **dérivés des fichiers** de chaque surface (jamais recopiés) : AC1 (mots bannis), AC2
  (tutoiement), et les motifs éprouvés sur des cas positifs et négatifs. Ablation : « Valider » et
  une phrase au tutoiement remis par l'outil de clés → 2 rouges ; restauré, `md5` de `fr.json`
  identique.
- `src/app/onboarding/__tests__/note-de-brouillon.tck-2616.test.tsx` — AC3, pages EXÉCUTÉES
  (invitation ×2, prénom de l'orientation, assistant bailleur). Ablation : ancienne coque → 4 rouges ;
  page bailleur sans `brouillon` → 1 rouge.
- `HostIndividualWizard.test.tsx` et `ServiceProviderOnboardingWizard.test.tsx` — « XOF » absent du
  rendu, « F CFA » présent. Ablation de chaque composant → rouge.
- Trois tests cliquaient « Valider » : renommés en « Vérifier le code ».

### Reste hors de ce ticket

- Les `wo` des clés touchées gardent leur texte wolof, qui contient encore « KYC », « lead »,
  « wizard », « dashboard », « XOF » (wolof en pause, ADR-0095 § 4).
- `/app` porte encore « KYC » (`kyc.*`, tableau de bord administrateur) : hors des surfaces d'entrée.
- La page d'invitation ne nomme pas l'agence (« Une agence vous invite ») : c'est TCK-2611.

### Correction après vérification (2026-11-11) — « onboarding » rejoint les mots bannis

Décision de session : « onboarding » ne s'affiche plus en français. Ajouté à ADR-0095 § 5 et au motif
`MOTS_BANNIS` de `mots-de-l-entree.tck-2616.test.ts` (rouge sur 3 surfaces avant la réécriture).

| Clé `fr` | Avant | Après |
|---|---|---|
| `owners/agents/serviceProviders.onboarding.metaTitle` | « Onboarding propriétaire / agent / prestataire » | « Premiers pas — espace propriétaire / agent / prestataire » |
| `owners/agents/serviceProviders.onboarding.errors.completeTitle` | « Impossible de finaliser votre onboarding » | « Impossible de finaliser la mise en place de votre espace » |
| `serverActions.ownerOnboarding/agentOnboarding.completeFailed` | « … votre onboarding. » | « … la mise en place de votre espace. » |
| `serverActions.serviceProviderOnboarding.completeFailed` | « … votre onboarding prestataire. » | « … la mise en place de votre espace prestataire. » |
| `wizardDrafts.banner.labels.{owner,agent,customer,sp}-onboarding` | « Onboarding … » | « Création de votre espace … » (patron de `host-individual-wizard`) |
| `wizardDrafts.banner.labels.{owner,agent}-kyc` | « KYC propriétaire / agent » | « Vérification d’identité (propriétaire / agent) » |

`wo` : seuls `agents.onboarding.metaTitle` et `serviceProviders.onboarding.metaTitle`, qui recopiaient
le français, suivent ; les autres sont écrits en wolof (§ 4). `en` inchangé.

Suivi mineur : `HostIndividualWizard.test` ouvre désormais la liste des devises et lit le texte des
options (ablation : options rendues par leur code → 1 rouge).

Côté agence, même décision : « Onboardings en attente » devient « Entrées en attente », le nom de la
palette (`entrees-en-attente`) — `nav.sidebar.onboardingPending`,
`dashboard.onboardingPending.{metaTitle,title}`, `admin.agencyConfig.modules.items.move_in_follow_up.label`
(son `wo`, qui recopiait le français, suit) ; `dashboard.onboardingPending.subtitle` « Locataires dont
la liste d’entrée dans les lieux est ouverte depuis plus de 7 jours. » ;
`agency.tenantOnboardingPending.emptyTitle` « Aucune entrée en retard » et `.emptyDescription` « Les
entrées ouvertes depuis moins de 7 jours n'apparaissent pas ici. ». `AppSidebar.test` suit.
Plus aucune valeur `fr` rendue ne contient « onboarding » ; reste le synonyme de recherche
`nav.palette.synonymes.entrees-en-attente`, cherché et jamais affiché (`lib/navigation/palette.ts`),
gardé pour qu'une personne qui tape « onboarding » trouve la page.
