---
date: 2026-05-04
tester: Claude (smoke test browser)
account: agent1@dakarimmo.sn (Ousmane Ndiaye, role Agent · Dakar Immo)
env: localhost:3000 (web Next.js 16.2.3) + localhost:8002 (api Laravel)
scope: dashboard agent immobilier — sidebar + flows clés (CRUD, listings, détails)
---

# Smoke test — Agent immobilier (compte agent1@dakarimmo.sn)

Test browser exhaustif des routes accessibles depuis le compte agent.
Bugs et anomalies recensés ci-dessous, classés par sévérité puis par module.

## Légende sévérité

- **P0** — bloque l'usage du module (page blanche, crash, action principale impossible)
- **P1** — fonctionnalité dégradée mais contournable (erreur visible, donnée manquante)
- **P2** — anomalie UX/i18n/données incohérentes sans blocage
- **P3** — petits écarts, warnings console, polish

---

## Synthèse

| Sévérité | Nombre |
|----------|-------:|
| P0       |      2 |
| P1       |      4 |
| P2       |     12 |
| P3       |      3 |
| **Total**| **21** |

**Verdict** : 2 chemins critiques cassés (création de bien, fiche client) qui empêchent un agent de réellement utiliser le CRM et de publier des biens. Le reste est dominé par des incohérences i18n (FR/EN mixés), un titre de page non localisé partout, et des formats de devise/date hétérogènes.

---

## P0 — bloquant

### P0-1 · Création de bien échoue côté serveur — `/app/properties/new`

- **Reproduction** : remplir Titre + Prix + Ville (champs requis), cliquer **Publier le bien**.
- **Observé** : toast d'erreur _« Le serveur a rencontré une erreur. Réessayez dans un instant. »_ (chaîne définie dans `takussan-web/src/hooks/useApiForm.ts:132`).
- **Réseau** : la Server Action Next.js renvoie 200 mais l'appel API sous-jacent échoue (HTTP 500 côté Laravel). La requête réelle n'apparaît pas dans le panneau réseau du navigateur car elle est faite côté serveur.
- **Impact** : un agent ne peut pas publier de nouveau bien depuis l'interface. Le module **Publier un bien** est inutilisable.
- **À investiguer** : payload envoyé par l'action `createProperty` vs. validation API (`POST /api/properties`). Probablement champs requis backend non envoyés (region/country code/coordinates GPS) ou enum de type qui passe la valeur EN (`Apartment`, `Rent`) au lieu de la valeur attendue par l'API.

### P0-2 · Fiche client crashe avec API 400 — `/app/customers/[id]`

- **Reproduction** : depuis `/app/customers`, cliquer sur n'importe quel client (testé avec id 415 et 424). Création de client OK (POST réussit, redirection sur `/app/customers/424`), mais la page de détail ne charge pas.
- **Observé** : Next.js dev-overlay _« Runtime Error — API error 400 »_, source `src/lib/api.ts:115` via `fetchDashboardCustomer` (`src/lib/queries/customers.ts:107`).
- **Requête fautive** : `GET /api/customers/{id}?fields[customers]=…&include=notes,documents,tags`.
- **Impact** : impossible de consulter ou éditer un client. Tout le CRM (qui a 141 fiches en base) est accessible en liste mais aucune fiche détail ne s'ouvre. Bloque consultation, édition, prise de notes, gestion des tags d'un lead.
- **À investiguer** : le include `notes,documents,tags` ou le sparse fieldset `fields[customers]` est probablement rejeté par le Spatie QueryBuilder côté Laravel (relation non whitelistée ou champ inexistant).

---

## P1 — dégradé

### P1-1 · 401 sur `/api/favorites` immédiatement après login

- **Réseau observé après login** : `GET /api/favorites?per_page=100 → 401`, suivi d'une seconde requête à `/api/me/profiles → 200`.
- Race condition probable : la requête favoris est tirée avant que le cookie/token ne soit posé par `/api/auth/set-token`.
- **Impact** : icône favoris et badge initiaux peuvent ne pas refléter l'état réel. Une seconde requête réussit après 1-2s.
- **Fix possible** : déclencher la query favoris uniquement après `set-token` résolu, ou via `enabled: !!token`.

### P1-2 · Édition de bien — alerte « Erreur réseau. Réessayez. » au chargement — `/app/properties/[id]`

- À l'ouverture de `/app/properties/83`, la fiche s'affiche mais une alerte rouge `Erreur réseau. Réessayez.` est rendue dans `<main>` (uid 25_149/25_150 dans le snapshot a11y).
- **Impact** : le formulaire est utilisable mais affiche une erreur sans contexte au chargement initial.
- À tracer côté `(dashboard)/app/properties/[id]/page.tsx` ou hook associé.

### P1-3 · Création de bien — type/contrat envoyés en anglais

- Combobox **Type de bien** affiche `Apartment` (label EN) au lieu de `Appartement`. Idem **Type de contrat** : `Rent` au lieu de `Location`.
- Visible aussi en édition : `/app/properties/83` montre `Warehouse` / `Rent`.
- **Impact** : (a) UX FR cassée (libellés EN dans une UI FR) ; (b) si la valeur EN est postée à l'API alors que celle-ci attend l'enum FR, c'est probablement la cause root de **P0-1**.
- **Lien fort suspecté avec P0-1**.

### P1-4 · Pagination tronquée sur la liste clients — `/app/customers`

- Le bandeau de pagination affiche `141 clients — page 1 sur` (sans nombre total) et `Page 1 / ` (séparateur seul, pas de total). Le bouton **Suivant** est présent mais on ne sait pas combien de pages restent.
- Comparer à `/app/properties` qui affiche correctement `Page 1 / 14`.
- À tracer côté composant pagination liste clients (probable `meta.last_page` non lu/transmis).

---

## P2 — i18n, formats, incohérences

### P2-1 · Title `<head>` incorrect ou non localisé sur la majorité des routes

Toutes ces pages affichent `Tableau de bord — Takussan` quel que soit l'écran courant :

- `/app/properties` (devrait être *Mes biens*)
- `/app/customers` (*Clients*)
- `/app/bookings` + `/app/bookings/[id]` (*Réservations*)
- `/app/leases`
- `/app/messages`
- `/app/maintenance`
- `/app/documents`
- `/app/overview`, `/app/overview/exports`
- `/app/inventories` + `/app/inventories/[id]`
- `/app/properties/new` + `/app/properties/[id]`
- `/app/customers/new`
- `/app/profile`

Pages avec un title correct :

- `/app/visits` → `Mes visites — Takussan` ✓
- `/app/visits/[id]` → `Visite — Takussan` ✓
- `/app/calendar` → `Calendrier — Takussan` ✓

Pages avec **title dupliqué** :

- `/app/favorites` → `Mes favoris — Takussan — Takussan` (suffixe Takussan en double)
- `/app/saved-searches` → `Mes recherches sauvegardées — Takussan — Takussan`

### P2-2 · Format devise hétérogène

Trois formats coexistent dans l'app :

| Page                      | Format observé             |
|---------------------------|---------------------------|
| `/app/properties`         | `1 970 000 F CFA` (FR, suffixe) |
| `/app/favorites`          | `29 000 000 F CFA` (FR, suffixe) |
| `/app/bookings`           | `F CFA 966,689` (US, préfixe, virgule) |
| `/app/bookings/[id]`      | `F CFA 966,689` (US, préfixe, virgule) |
| `/app/leases`             | `F CFA 500,000 / mois` (US, préfixe) |
| `/app/saved-searches`     | `1142038` (raw, sans devise ni séparateur) |

Doit être normalisé sur un format unique (idéalement `Intl.NumberFormat('fr-FR', { currency: 'XOF' })`).

### P2-3 · Format date hétérogène

- `/app/bookings`, `/app/leases`, `/app/visits`, `/app/maintenance`, `/app/documents`, `/app/inventories` : libellés type `13 May 2026, 16:15` (mois en anglais).
- `/app/maintenance` (cards) : sur la **même ligne** on a `27 Apr 2026 · Prévu 27/04/2026` (deux formats en parallèle : `D MMM YYYY` anglais + `DD/MM/YYYY` numérique).
- `/app/messages` : sidebar conversations en `02/05/2026` (numérique FR), heure des messages en `23:59`.
- `/app/profile` (sessions) : `04/05/2026 22:32:02` (FR avec heure) — OK.
- À uniformiser sur un format FR (ex. `13 mai 2026, 16:15`).

### P2-4 · Niveaux de priorité maintenance non traduits — `/app/maintenance`

- Le filtre dropdown affiche bien `Faible / Normale / Élevée / Urgente`.
- Mais les **cards** affichent les valeurs brutes EN : `Low`, `Normal`, `High`, plus `Urgent` qui se trouve correspondre aux deux. Mismatch entre filtre et données rendues.

### P2-5 · Pagination sans contrôles — `/app/inventories`

- Le pied de liste indique `Page 1 / 7 — 99 entrées` mais **ne rend pas les boutons Précédent / Suivant**. L'agent ne peut pas accéder aux pages 2-7.

### P2-6 · Console error Base UI (button render) — `/app/documents`

```
Base UI: A component that acts as a button expected a native <button> because the
`nativeButton` prop is true. Rendering a non-<button> removes native button semantics,
which can impact forms and accessibility. Use a real <button> in the `render` prop,
or set `nativeButton` to `false`.
   at Button (/_next/static/chunks/src_0h5g4.u._.js:182:214)
   at DocumentRow
   at DocumentsLibrary
```

A11y warning, à corriger sur le composant `DocumentRow` ou son Button.

### P2-7 · Messagerie — i18n partielle — `/app/messages`

- Bouton **« New group »** (anglais) dans la sidebar conversations.
- Empty state **« Select a conversation to view messages. »** (anglais) avant clic.
- Le reste de l'écran (heading, placeholder textarea, bouton Envoyer) est en FR.

### P2-8 · Fiche profil — bloc `Delete my account` en anglais — `/app/profile`

- Section **Sécurité → Delete my account** + texte _« Deletion is irreversible after the grace period. Your personal data is anonymized and legal records are retained. »_ + bouton _« Delete my account »_.
- Tout le reste de la page profil est en FR.

### P2-9 · Statut profil affiché en raw — `/app/profile`

- Sous la carte agence apparaît `· active · Profil actif` : `active` (raw enum EN) puis `Profil actif` (label correct). Le mot `active` ne devrait pas s'afficher.

### P2-10 · Sessions actives — label brut `auth_token` — `/app/profile`

- Chaque session liste `auth_token` comme nom de l'appareil/contexte. Devrait être un label humain (User-Agent parsé, ou nom de jeton).

### P2-11 · Recherches sauvegardées — affichage prix sans format — `/app/saved-searches`

- Cards montrent `3 ch. · prix … – 1142038`. La borne basse est `…` (vide), la borne haute en raw integer sans séparateur ni devise.

### P2-12 · Booking détail — agent vs reviewer — `/app/bookings/[id]`

- L'agent voit la section **« Partagez votre expérience — Laisser un avis »** sur une réservation **terminée** d'un bien qu'il gère. Cet appel à action est destiné au locataire/voyageur, pas à l'agent qui gère le bien.
- Champ **CRÉÉE LE** est rendu mais sans valeur (label seul, pas de date).

---

## P3 — polish / divers

### P3-1 · Doublon de section Photos — `/app/properties/[id]`

- Le formulaire d'édition rend deux blocs Photos d'affilée :
  1. **Photos** — limite 10 fichiers, `5.00 Mo` max
  2. **Photos du bien** — limite 20 fichiers, `5.00 Mo` max ("Glissez pour réorganiser")
- Limite incohérente (10 vs 20) et redondance UX.

### P3-2 · Doublon de heading — `/app/inventories/[id]`

- Page `/app/inventories/73` rend `<h1>État des lieux #73</h1>` puis `<h2>État des lieux #73</h2>` consécutivement. Un seul heading suffit.

### P3-3 · Visite détail — heading mal niveau — `/app/visits/[id]`

- L'heading principal de la fiche est un `<h2>` (`Hangar à HLM`) sans `<h1>` au-dessus. La nav `← Toutes les visites` est en `<link>` mais aucune balise sémantique de titre de niveau 1 sur la page.

---

## Pages où aucun bug n'a été détecté

- `/app` (tableau de bord agent — KPIs cohérents)
- `/app/visits` (liste à venir / passées + onglets)
- `/app/calendar` (vue mois, navigation, filtres biens, badges Réservations / Visites)
- `/app/overview` (redirection auto vers `/app/overview/agent`, KPI agent rendus)
- `/app/overview/exports` (formulaire exports rendu correctement, non testé en téléchargement réel)
- `/app/profile/notifications` (chargement OK, non investigué en profondeur)

---

## Vérifications RBAC (positif — comportements corrects)

- `/admin` → redirige vers `/app/profile` ✓
- `/super-admin` → redirige vers `/app` ✓
- `/app/overview/kpis` → redirige vers `/app/overview/agent` ✓
- `/app/overview/alerts` → redirige vers `/app/overview/agent` ✓
- Sidebar agent **ne montre pas** : KPIs, Alertes, Administration, Baux *(en fait Baux est visible mais c'est cohérent)*.

---

## Observations transverses

1. **Périmètre des données** : l'agent voit 209 biens et 141 clients de l'agence Dakar Immo. Le label de sidebar « **Mes biens** » et le KPI « **Biens gérés** » sont ambigus : un agent voit le portefeuille de l'agence entière, pas seulement ses propres biens. À aligner avec la spec produit (intentionnel ou bug de scoping ?).

2. **Données seed** : nombreuses cards montrent du **lorem ipsum** (titres maintenance, conversations, descriptions) ou des dates uniformes (`9 May 2026 → 2 Jun 2026` pour toutes les bookings). Pas un bug de code — à signaler à la prochaine reseed pour ne pas confondre.

3. **Console réseau** : aucun warning React / Next.js notable au-delà du Base UI button (P2-6). Le compteur Tanstack Devtools est présent en dev mode partout.

---

## Pages testées (chronologie)

```
/auth/login → login
/app
/app/properties
/app/customers
/app/bookings + /app/bookings/319
/app/leases
/app/visits + /app/visits/475
/app/maintenance
/app/messages (+ ouverture d'une conversation)
/app/calendar
/app/documents
/app/favorites
/app/saved-searches
/app/overview → /app/overview/agent
/app/overview/exports
/app/inventories + /app/inventories/73
/app/properties/new (tentative création — P0-1)
/app/customers/new (création OK puis P0-2 sur redirection)
/app/customers/415 (P0-2)
/app/properties/83 (P1-2)
/app/profile
/app/profile/notifications
/admin (RBAC)
/super-admin (RBAC)
/app/overview/kpis (RBAC)
/app/overview/alerts (RBAC)
```
