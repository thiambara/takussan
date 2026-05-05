---
date: 2026-05-05
tester: Claude (smoke test browser)
account: customer authentifié — `malick-toure-zh5v@example.com` (id 133, customer dans agency 1, 2 baux actifs · 4 réservations · 7 visites passées)
env: localhost:3000 (web Next.js 16.2.3) + localhost:8002 (api Laravel)
spec: docs/qa/locataire-acheteur-qa.md
scope: parcours locataire/acheteur connecté — dashboard, favoris, saved searches, comparateur, demande visite/réservation, baux & loyers, messagerie, maintenance, documents, avis, isolation rôle
---

# Smoke test — Locataire / Acheteur (parcours authentifié)

Test browser exhaustif du parcours customer (côté demande), suivant la grille `docs/qa/locataire-acheteur-qa.md`.

> Note préalable — aucun seed `customer` n'a de bail/réservation : `customer@agency<N>.demo.takussan.sn` est un compte **vide** (cf. § 14). Le test a été mené avec un tenant DB existant (Malick Toure) pour exercer les widgets non vides ; il a fallu lui assigner un rôle `customer` et lowercaser son email pour pouvoir se loguer (cf. P1-1).

## Légende sévérité

- **P0** — bloque l'usage du module (page blanche, crash, action principale impossible)
- **P1** — fonctionnalité dégradée mais contournable (erreur visible, donnée manquante, action métier impossible)
- **P2** — anomalie UX/i18n/données incohérentes sans blocage
- **P3** — petits écarts, polish

---

## Synthèse

| Sévérité | Nombre |
|----------|-------:|
| P0       |      6 |
| P1       |     17 |
| P2       |     19 |
| P3       |      6 |
| **Total**| **48** |

> Mise à jour 2 — passe complémentaire : profil + notifications, biens consultés récemment, soumission réservation vente, signaler annonce, fiche agent, EDL, scan systématique des routes `/app/*`, responsive mobile, language toggle. Voir § Round 2 en bas.

**Verdict** : **un locataire ne peut quasiment rien faire seul aujourd'hui**. Quatre routes principales du parcours (`/app/payments`, `/app/calendar`, `/app/properties/new`, et le bouton « Sauvegarder la recherche ») crashent en runtime. La demande de visite est **bloquée côté API** (la modale ne renseigne pas `visitor_name/email/phone`). Le paiement passerelle (Wave/Orange Money/Stripe) est **absent** : le seul flow proposé est un formulaire « Enregistrer un paiement (espèces) » destiné à l'agent, donc le locataire ne peut jamais payer son acompte/loyer en ligne. Les boutons d'action agent (« Nouveau bail », « Générer l'échéancier », « Ajouter un garant ») sont visibles depuis le compte customer — fuite de surface admin. La majorité des chemins de lecture fonctionnent (favoris, fiche bail, échéancier, dashboard tenant, avis), mais une partie des shells UI passe en anglais quand on est connecté (navbar publique, footer, certains messages d'erreur).

À traiter en priorité : (1) corriger les 4 P0 runtime, (2) câbler la demande de visite, (3) câbler un vrai paiement passerelle, (4) masquer/empêcher les actions agent côté `/app/leases` et `/app/leases/[id]`.

---

## P0 — modules cassés en runtime

### P0-1 · `/app/payments` crash — `Base UI: FieldRootContext is missing`

- **Reproduction** : se connecter customer → cliquer "Paiements" (lien direct `/app/payments`).
- **Observé** : Runtime Error Next.js plein écran : `Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.` — `src/components/payments/PaymentsHistoryFilters.tsx (54:9)`, dans `src/components/ui/label.tsx (18:5)`.
- **Cause probable** : le composant `Label` utilise `FieldPrimitive.Label` de Base UI, qui exige un `<Field.Root>` parent. `PaymentsHistoryFilters` rend le label hors de tout `Field.Root`.
- **Impact** : TC-LOC-17 entier impossible (historique de paiements + export CSV). Le widget « Documents récents » du dashboard tenant inclut le lien — la page reste accessible mais inutilisable.

### P0-2 · « Sauvegarder la recherche » crash — même cause

- **Reproduction** : `/properties?city=Dakar&contract_type=rent` → cliquer le bouton "Sauvegarder la recherche" de `PropertiesDiscoveryPage`.
- **Observé** : même Runtime Error `FieldRootContext is missing` — `src/components/favorites/SaveSearchButton.tsx (158:17)` → `label.tsx (18:5)`.
- **Impact** : TC-LOC-04 entier (création + alerte email + relance d'une recherche sauvegardée) impossible. La page `/app/saved-searches` reste accessible en lecture mais ne peut jamais recevoir de nouvelle entrée.

### P0-3 · `/app/calendar` crash — `forbidden() is experimental`

- **Reproduction** : URL directe `/app/calendar` en customer.
- **Observé** : Server Runtime Error : `` `forbidden()` is experimental and only allowed to be enabled when `experimental.authInterrupts` is enabled. `` — `src/app/(dashboard)/app/calendar/page.tsx (27:14)`.
- **Cause** : la page utilise `forbidden()` (Next.js 16) sans avoir activé `experimental.authInterrupts: true` dans `next.config.ts`. Pour un customer, le check `isAgent || isOwner || isAdmin` échoue, on tombe dans la branche `forbidden()` → 500.
- **Impact** : la page est censée rester invisible au customer (TC-LOC-43 P2) mais la route est atteignable et renvoie un 500 au lieu d'un 403/redirect propre.

### P0-4 · `/app/properties/new` et `/app/customers` crashent (même cause)

- **Reproduction** : URL directe en customer.
- **Observé** : même `forbidden()` server error — `src/app/(dashboard)/app/properties/new/page.tsx (16:14)` et `src/app/(dashboard)/app/customers/page.tsx`.
- **Aggravant** : la **navbar publique** affiche un lien `List a property` qui pointe vers `/app/properties/new` même quand l'utilisateur est connecté en customer (cf. P1-7). Cliquer le lien → 500.
- **Impact** : TC-LOC-44 (isolation rôle) — au lieu d'un redirect/403 propre, le customer se prend un crash serveur. À régler globalement : soit activer `authInterrupts`, soit remplacer `forbidden()` par `redirect('/app')` ou `notFound()` partout (au moins 3 fichiers connus).

---

## P1 — fonctionnalités dégradées

### P1-1 · Login bloqué si l'email contient des majuscules

- **Reproduction** : essayer de se loguer avec un email contenant des majuscules (`malick-toure-Zh5v@example.com`, comme produit par le seeder `database/factories`).
- **Observé** : 401 `Invalid credentials.` à chaque tentative. La requête frontend POST `/api/auth/login` envoie l'email **lowercased** : `malick-toure-zh5v@example.com`.
- **Cause** : le frontend (`auth/login`) fait un `toLowerCase()` avant l'envoi mais le backend Laravel/SQLite cherche en case-sensitive (la colonne `users.email` n'a pas de collation `NOCASE` sur SQLite).
- **Impact** : tous les comptes seedés avec un email à majuscules sont **inutilisables**. Soit (a) le frontend ne doit pas lowercase, soit (b) le seeder doit toujours produire des emails en minuscules, soit (c) la collation doit être case-insensitive (équivalent `CITEXT` Postgres).

### P1-2 · Demande de visite bloquée — champs `visitor_*` non remplis

- **Reproduction** : depuis `/properties/[slug]` connecté → bouton "Demander une visite" → modale → date 2026-05-08, type "in_person" → "Demander la visite".
- **Observé** : 422 API : `{"visitor_name":["The visitor name field is required."], "visitor_email":["The visitor email field is required."], "visitor_phone":["The visitor phone field is required."]}`. Côté UI, juste le message `The visitor name field is required. (and 2 more errors)` (en anglais).
- **Cause** : la modale customer n'a **aucun champ** Nom/Email/Téléphone, et la server action POST n'auto-remplit pas avec le profil utilisateur (`first_name + last_name`, `email`, `phone`). L'API exige ces 3 champs même en mode connecté.
- **Impact** : TC-LOC-08 entier impossible. La spec ne prévoit pas ces champs dans le formulaire connecté — il faut soit les hydrater côté server action, soit les rendre optionnels côté backend pour un user authentifié.

### P1-3 · Mes visites — visites passées invisibles

- **Reproduction** : `/app/visits` → onglet "Passées".
- **Observé** : "Aucune visite passée." alors que le customer 133 possède **7 visites en base** (`property_visits.customer_id = 133`, statuts `completed`/`cancelled`/`no_show`).
- **Cause probable** : la requête liste filtre sur `visitor_id = auth.id` au lieu de `customer_id`. Tous les seeds ont `visitor_id = NULL` (1925 / 1925 lignes) et utilisent uniquement `customer_id`.
- **Impact** : TC-LOC-09 (historique des visites + feedback) impossible. À corriger côté `properties/visits` controller pour accepter aussi `customer_id`.

### P1-4 · Aucun moyen de payer un acompte/loyer en ligne (passerelle absente)

- **Reproduction** : `/app/bookings/307` (réservation "En attente") → seul bouton dispo : "Enregistrer un paiement". Idem sur `/app/leases/103` ("Enregistrer un paiement").
- **Observé** : la modale propose un formulaire **manuel** (Montant / Type / Moyen de paiement = Espèces, Wave, … / ID transaction / Notes / "Enregistrer"). C'est un workflow **agent encaissant en cash** — pas une redirection vers Wave / Orange Money / Stripe.
- **Spec attendue (TC-LOC-13/20)** : redirection vers la passerelle, callback `/app/payments/return`, statut auto-mis à jour, quittance PDF.
- **Impact** : TC-LOC-13/14/15/20 entiers impossibles. Le locataire **ne peut pas payer son acompte ni son loyer** depuis l'application ; aucun reçu PDF n'est généré.

### P1-5 · Bouton « Nouveau bail » exposé aux customers sur `/app/leases`

- **Reproduction** : `/app/leases` connecté en customer.
- **Observé** : un lien `Nouveau bail` (`/app/leases/new`) figure en tête de page. Pas de check de rôle dans le rendu.
- **Impact** : surface d'écriture exposée. Le customer cliquant tombe probablement sur un autre `forbidden()` 500 (cf. P0-4) — non vérifié page par page mais probable. Action UI à masquer.

### P1-6 · Boutons d'action agent visibles sur la fiche bail customer

- **Reproduction** : `/app/leases/103` (bail dont je suis tenant).
- **Observé** : trois boutons en haut : « Ajouter un document », « Générer l'échéancier », « Enregistrer un paiement », plus « Ajouter un garant ». Tous sont des actions **agent**, jamais tenant. Spec TC-LOC-18/19 attend plutôt « Télécharger le contrat PDF », « Voir le bail parent (renouvellement) », « Payer le loyer » (passerelle).
- **Impact** : confusion fonctionnelle ; possible 422/403 silencieux à la soumission. À segmenter l'UI selon `role`.

### P1-7 · Lien `List a property` exposé dans la navbar publique côté customer

- **Reproduction** : connecté en customer → ouvrir `/properties` ou n'importe quelle fiche bien.
- **Observé** : la top nav publique contient `List a property` qui pointe vers `/app/properties/new` (cf. P0-4). Spec TC-LOC-01 Q3 demande explicitement qu'**aucun** lien Publier/Mes biens/Admin ne soit visible côté customer.
- **Impact** : surface admin exposée, click → 500.

### P1-8 · Réservations — historique partiel et statuts non traduits

- **Reproduction** : `/app/bookings` connecté.
- **Observé** : 1 réservation listée alors que le customer 133 en a **4 en base** (statuts `pending`, `confirmed`, etc.). Aucune onglet/filtre par statut. Sur `/app/bookings/307` la timeline d'événements (créée/message/etc. cf. TC-LOC-12 Q3) et le bouton « Annuler la réservation » sont absents.
- **Impact** : TC-LOC-12 partiel (lecture incomplète), TC-LOC-16 (expiration auto) non vérifiable, TC-LOC-15 (annulation) impossible côté UI.

### P1-9 · Sidebar customer incomplète — entrées manquantes

- **Reproduction** : sidebar `/app/*` avec rôle customer.
- **Observé** : présent : Tableau de bord, Mes favoris, Recherches sauvegardées, Messagerie, Documents, Statistiques, Réservations, Visites, Baux. **Absent** : Paiements (`/app/payments`), Maintenance (`/app/maintenance`), Avis (`/app/profile/reviews`), Calendrier. Spec TC-LOC-01 Q2 cite explicitement Paiements et Statistiques.
- **Impact** : ces pages restent atteignables par URL mais aucune navigation. À aligner le composant sidebar customer avec la spec.

### P1-10 · `/app/maintenance/new` sans sélecteur de bien

- **Reproduction** : `/app/maintenance` → "Nouvelle demande".
- **Observé** : la page affiche `Sélectionnez un bien depuis votre portefeuille pour démarrer une demande de maintenance. Ouvrez une demande depuis la page d'un bien ou passez le paramètre ?property= dans l'URL.` — il n'y a **aucun** dropdown / lien pour choisir un bien parmi mes baux. Pour ouvrir le formulaire il faut connaître l'id du bien et l'ajouter à la main dans l'URL (`?property=277` chez moi).
- **Impact** : TC-LOC-29 inaccessible pour un utilisateur final. La spec attend un sélecteur "bien (parmi mes baux)".

### P1-11 · Footer authentifié intégralement en anglais (vs FR côté visiteur)

- **Reproduction** : sur n'importe quelle page `/properties*`, `/compare`, `/properties/[slug]` quand on est connecté.
- **Observé** : footer = `Your trusted partner to find the perfect property in Senegal.`, `Discover`, `Your email`, `Subscribe`, `© 2026 Takussan. All rights reserved.`. Côté visiteur anonyme, ce même footer est en FR (`Biens en vedette`, etc. cf. visiteur smoke test). Donc deux footers différents selon état d'auth.
- **Impact** : incohérence brutale FR↔EN dès qu'on se connecte. Côté visiteur ce footer reste minimal mais FR ; côté connecté il devient minimal et EN. Source probable : `src/components/layout/AppShell` ou layout authentifié charge un Footer EN-only.

---

## P2 — UX / i18n / données

### P2-1 · Layout authentifié : navbar publique entièrement en anglais

- **Reproduction** : `/properties` connecté.
- **Observé** : `Where are you looking?` (placeholder), `Buy / Rent`, `Run search`, `More types`, `My favorites`, `Language`, `List a property`, `User menu`. Côté visiteur la même top nav est en FR (`Où cherchez-vous ?`, `Acheter / Louer`, etc.).
- **Impact** : cohérence lourde côté connecté.

### P2-2 · Type de visite affiché brut `in_person` au lieu de "En personne"

- Dans la modale de demande de visite, le `combobox` Type de visite affiche `in_person` (valeur enum brute). Idem pour les options du combobox une fois ouvert (non vérifié item par item). À mapper avec un libellé FR.

### P2-3 · Statuts d'échéances en anglais brut sur `/app/overview/tenant`

- Section "Échéances des 30 prochains jours" : statut affiché `pending` (raw enum). Devrait être "À venir" / "En attente" en FR.

### P2-4 · Statut bail brut "Residential Rent" sur `/app/leases/[id]`

- Sur la fiche bail, le champ type est rendu littéralement `Residential Rent` (titre case anglais à partir de `residential_rent`). Devrait être "Bail d'habitation".

### P2-5 · Priorité maintenance en anglais

- Sur `/app/maintenance/new`, les radios Priorité affichent `Urgent / High / Normal / Low`. Le label "Priorité (Normale par défaut)" est lui en FR — donc mélange FR/EN dans le même contrôle. À traduire les libellés en `Urgente / Élevée / Normale / Faible`.

### P2-6 · Format de date en anglais (May/Jun/Aug/Sept) — toutes les pages métier

- `/app/bookings` : `9 May 2026 → 2 Jun 2026`, `25 Apr 2026, 22:00`.
- `/app/leases` : `21 Jun 2025 → 21 Jun 2026`, `20 May 2025`.
- `/app/leases/[id]` (échéancier) : `1 Aug 2025 → 31 Aug 2025`, mais aussi parfois `1 Sept 2025` (FR partiel).
- Spec QA attend FR (`mai`, `juin`, `août`, etc.). Source probable : `Intl.DateTimeFormat` invoqué sans locale `fr` (`undefined` par défaut → locale du navigateur, en EN ici).

### P2-7 · Format de montant US — virgule milliers, pas d'espace

- `42,040,534 F CFA`, `1,056,160 F CFA`, `8,408,106 F CFA`. Conventions FR/SN attendues : `42 040 534 F CFA` (espace insécable). Source probable : `toLocaleString('en-US')` au lieu de `('fr-FR')`.

### P2-8 · Top nav (sidebar dashboard) — placeholder de recherche en anglais

- Sidebar barre de recherche `Search a city, neighborhood, property type…` (déjà signalé visiteur). Identique en mode connecté. Doit être traduite.

### P2-9 · Bouton « Language » et `aria-label` "Menu utilisateur — X" partiellement non traduits

- Le menu langue continue d'avoir `aria-label="Language"` et le combobox de recherche en EN. Cohérent avec P1-2 visiteur smoke test.

### P2-10 · Comparateur entièrement en anglais (déjà documenté côté visiteur)

- Confirmé en mode connecté également : `/compare` → `COMPARATOR`, `Compare properties`, `Select at least 2 properties`, `Search properties`. Voir P1-3 du smoke test visiteur — pas réparé.

### P2-11 · Messagerie partiellement traduite

- `/app/messages` : H1 "Messagerie", "Pas encore de conversation." en FR ✅, mais bouton "New group" et message d'état "Select a conversation to view messages." en EN. Aucune barre de recherche / onglet "Archivées" / muter / accusé de lecture vérifiables (compte vide). TC-LOC-23/26/27/28 non vérifiables.

### P2-12 · Filtre `type` du listing — alias inverse non câblé

- `/properties?type=appartement` → 0 résultats. Le bon paramètre est probablement `property_type=apartment` (en anglais, mappé à l'enum). L'alias FR (slug `appartement`) n'est pas reconnu. Mineur car les filtres UI fonctionnent par chips, mais les liens partagés / saved-searches peuvent perdre le filtre.

### P2-13 · « Trop de tentatives » / `Too Many Attempts.` non traduit

- Quand on enchaîne login ou submit rapidement, l'API renvoie `Too Many Attempts.` en EN, affiché tel quel dans la modale. Provient du middleware `throttle:` Laravel — à localiser via `lang/fr/auth.php`.

### P2-14 · Section « Laisser un avis » sur fiche bien sans gating

- Sur `/properties/[slug]`, section "Laisser un avis" (note + commentaire) **toujours visible** pour le customer connecté, même si l'utilisateur n'a aucun bail/visite éligible sur ce bien. Spec TC-LOC-36 Q1 demande explicitement que le formulaire **n'apparaisse que** pour les utilisateurs ayant un historique éligible (visite ou bail). À gater côté frontend selon les éligibilités du backend.

---

## P3 — polish

### P3-1 · `/admin/*` et `/super-admin` : redirection sans `redirect=`

- `/admin`, `/admin/team`, `/super-admin` redirigent vers `/auth/login` mais sans paramètre `redirect=` capturant la cible. Cohérent avec P3-3 visiteur. Le customer est ramené à login s'il essaie ces routes — propre, mais moins ergonomique que les redirections `/app/*` qui préservent la cible.

### P3-2 · Dashboard `/app` — rich widgets côté tenant non documentés mais OK

- `Bonjour Malick` + 4 KPI (Baux actifs / Prochaine échéance / Impayés / Documents récents) — bonne UX globale. La spec TC-LOC-02 demande aussi un widget "Visites planifiées" et un widget "Mes réservations" séparé : seul le compteur "Réservations en attente" est présent sur `/app/overview/tenant`.

### P3-3 · `/app/leases` — entrée listée par référence (`LS-XXX`) au lieu du titre du bien

- Spec TC-LOC-18 Q1 demande "bien" en première colonne. La liste actuelle affiche `LS-3TFCCDGC` (référence interne) — illisible pour un locataire. Le titre (`Bureau professionnel à HLM`) n'apparaît qu'au pied de la fiche `/app/leases/103` dans la section "Laisser un avis". À promouvoir au niveau de la liste.

### P3-4 · Title de page incohérent — onglet `Tableau de bord` sur `/app/leases/103`

- Le `<title>` de la fiche bail reste `Tableau de bord — Takussan` (`/app/leases/[id]/page.tsx` n'override pas le `metadata.title`). Cohérent avec `/app/maintenance/new`, `/app/properties/new`, `/app/customers`, `/app/calendar`.

---

## Couverture des cas testés

| TC | Page | Statut global | Notes |
|----|------|---------------|-------|
| TC-LOC-01 | Connexion + sidebar | ⚠️ | login OK, sidebar incomplète (P1-9), placeholders nav EN (P2-8/2-9) ; lien `List a property` exposé (P1-7) |
| TC-LOC-02 | Dashboard tenant `/app/overview/tenant` | ⚠️ | KPI OK, widgets "Visites planifiées" et "Mes réservations" séparé absents ; statuts `pending` non traduits (P2-3) |
| TC-LOC-03 | Mes favoris | ✅ | ajout via `/properties`, persistance serveur OK, retrait OK |
| TC-LOC-04 | Recherches sauvegardées | ❌ | bouton crash (P0-2) — feature inaccessible |
| TC-LOC-05 | Comparateur | ⚠️ | UI EN (P2-10) — non régressée depuis visiteur |
| TC-LOC-06 | Recherche par carte | ⚠️ | non vérifiée en détail — déjà couverte côté visiteur |
| TC-LOC-07 | Récemment consultés | ⚠️ | localStorage `takussan.recently-viewed` rempli ✅ ; section affichée seulement sur les **fiches bien** (en EN), absente de la home (R2-1, R2-2) |
| TC-LOC-08 | Demande de visite | ❌ | API rejette (P1-2) |
| TC-LOC-09 | Mes visites `/app/visits` | ⚠️ | tabs présents mais limités à 2 ; visites passées invisibles (P1-3) |
| TC-LOC-10 | Rappel J-1 | 🔲 | non testable en CRON sans simulation |
| TC-LOC-11 | Soumission de réservation | ⚠️ | crée une booking (POST 200), mais le formulaire "Faire une offre" sur les ventes est un **formulaire de séjour** (dates + invités) au lieu d'une offre d'achat (montant + délai validité) — R2-3 |
| TC-LOC-12 | Mes réservations | ⚠️ | 1/4 affichée (P1-8), pas d'onglet, pas de timeline ni "Annuler" |
| TC-LOC-13 | Paiement de l'acompte | ❌ | passerelle absente (P1-4) |
| TC-LOC-14 | Paiement du solde | ❌ | idem |
| TC-LOC-15 | Échec paiement | ❌ | idem |
| TC-LOC-16 | Expiration auto | 🔲 | non vérifiable |
| TC-LOC-17 | Historique de paiements | ❌ | page crash (P0-1) |
| TC-LOC-18 | `/app/leases` | ⚠️ | liste OK mais affiche réf au lieu du titre (P3-3) ; onglets manquants ; bouton "Nouveau bail" exposé (P1-5) |
| TC-LOC-19 | Échéancier | ✅ | mensuel, statuts Payé / En retard, devises OK ; pénalités/calcul auto non vérifiable |
| TC-LOC-20 | Paiement loyer | ❌ | seul "Enregistrer un paiement" (P1-4) |
| TC-LOC-21 | Historique loyer | ⚠️ | listé dans l'échéancier mais pas de téléchargement quittance |
| TC-LOC-22 | Révision annuelle | 🔲 | non testable |
| TC-LOC-23 | Liste conversations | ⚠️ | empty state FR + restes EN (P2-11) |
| TC-LOC-24 → 28 | Démarrer / pièce jointe / archive / temps réel / recherche messages | 🔲 | non testable (pas de conv) |
| TC-LOC-29 | Signaler un problème | ⚠️ | atteignable seulement via URL `?property=` manuelle (P1-10) ; priorités EN (P2-5) |
| TC-LOC-30 → 31 | Suivi & historique maintenance | 🔲 | non testable (sans demande) |
| TC-LOC-32 → 35 | Documents (liste, télécharger, partage temporaire, versions) | 🔲 | aucun document lié au tenant en base — empty state OK |
| TC-LOC-36 | Avis sur un bien | ⚠️ | formulaire visible **sans gating** (P2-14) |
| TC-LOC-37 | Avis agent/agence | ❌ | aucune route `/agents/*` ou `/agencies/*` dans l'app (toutes 404) — feature inexistante (R2-5) |
| TC-LOC-38 | Signaler un avis | 🔲 | bouton "Signaler" sur un avis publié non visible côté customer ; modale "Signaler cette annonce" en revanche fonctionnelle (R2-4) |
| TC-LOC-39 | Mes avis publiés `/app/profile/reviews` | ✅ | liste les baux éligibles avec lien "Laisser un avis" |
| TC-LOC-40 → 42 | État des lieux | ⚠️ | `/app/inventories` accessible (2 EDL listés pour le tenant), filtres FR OK, fiche détail (signatures, pièces, contestation) OK ; mais aucun lien sidebar ; libellés "Bail #X" + dates EN (R2-7) |
| TC-LOC-43 | Calendrier `/app/calendar` | ❌ | crash (P0-3) |
| TC-LOC-44 | Isolation rôle | ❌ | `/app/properties/new`, `/app/customers`, `/app/calendar` → 500 au lieu de redirect (P0-3, P0-4) ; `/admin*` redirigent ✅ ; `/api/customers` 401 ✅ |

Légende : ✅ OK · ⚠️ partiel / dégradé · ❌ bloqué · 🔲 non testé

---

## Hypothèses techniques

1. **`Label` Base UI mal encapsulé** : `src/components/ui/label.tsx` rend `FieldPrimitive.Label` qui exige `<Field.Root>`. Tous les composants qui posent `<Label>` hors d'un `<Field>` plantent (`SaveSearchButton`, `PaymentsHistoryFilters`). Probable régression Base UI. Soit downgrader vers le wrapper sans Field, soit envelopper systématiquement. Cherche `<Label` côté `app/components` pour trouver les autres call-sites avant de release.
2. **`forbidden()` Next 16** : `next.config.ts` ne déclare pas `experimental.authInterrupts`. Trois pages (`calendar`, `properties/new`, `customers`) appellent `forbidden()` en server component pour gater le rôle. À remplacer par un `redirect('/app')` (pattern clair, toujours dispo) ou activer le flag (assumer expérimental).
3. **i18n côté layout authentifié** : il existe (au moins) deux composants Footer/Navbar — l'un FR pour le visiteur, l'autre EN pour l'authentifié. Probablement un layout `(public)` séparé qui n'a pas eu la passe de traduction du `(public)` du visiteur. À unifier sur un seul Footer/Navbar localisés.
4. **Format dates/montants** : tous les rendus passent par `Intl.DateTimeFormat` / `toLocaleString` sans locale. Forcer `'fr-SN'` (ou `'fr-FR'` faute de mieux) au niveau d'un helper central (`src/lib/format.ts`).
5. **Auth flow** : Laravel match `email` exact (case-sensitive sur SQLite), Next.js lowercase. Soit lowercaser le seeder, soit normaliser côté API (User::firstWhere('email', strtolower($input))).
6. **Visite request hydratation** : la server action `requestVisitAction` envoie l'objet tel quel ; il faudrait y injecter `visitor_name = $user->full_name`, `visitor_email = $user->email`, `visitor_phone = $user->phone` pour les utilisateurs authentifiés (et tolérer leur absence côté backend pour cette branche).

---

## Notes du testeur

- Aucune erreur console JavaScript pendant les parcours hors crashs Server Components listés (les Runtime Error sont rendus en overlay côté Next dev, pas d'exception JS dans la console navigateur).
- Le compte `customer@agency<N>.demo.takussan.sn` créé par `DemoUsersSeeder` n'a aucune donnée métier (pas de bail, pas de réservation, pas de visite). Le smoke test final a utilisé un user "tenant" du seeder factuel (`malick-toure-Zh5v@example.com`, id 133) qui possède 2 baux + 4 réservations + 7 visites. Recommandation : enrichir `DemoUsersSeeder` (ou ajouter un seeder dédié) pour donner au customer démo au moins un bail + une réservation + une visite + un document, sinon la démo customer reste vide. Ce point n'est pas un bug applicatif mais bloque l'exercice complet de la grille.
- Trois pages `/app/*` qui crashent (`payments`, `calendar`, `properties/new`) ont la même signature côté call stack (Server Component + experimental API), suggérant un seul fix à l'architecture résoudra plusieurs P0 d'un coup.
- L'i18n FR n'est globalement pas terminée : on retrouve les mêmes patterns d'EN-leak qu'au visiteur (cf. P1-2/3/4 du visiteur) plus de nouveaux site-wide une fois connecté (footer, navbar publique). Le travail i18n a été fait pour la sidebar dashboard, mais pas pour les composants de la zone publique consommés en mode connecté.
- **Suggestion d'ordre de remédiation** : (a) corriger le `forbidden()` partout, (b) corriger le `Label` Base UI, (c) câbler `requestVisitAction` avec hydratation, (d) câbler une réelle redirection paiement Wave/Orange Money/Stripe, (e) masquer les actions agent côté `/app/leases*`, (f) terminer l'i18n du layout connecté.

---

## Round 2 — couverture complémentaire (mise à jour)

Passe additionnelle après le rapport initial : profil utilisateur, biens récents, soumission de réservation vente, signaler une annonce, fiche agent, états des lieux, scan systématique des routes `/app/*`, responsive mobile (390×844), language toggle. **15 nouveaux findings**, dont 2 P0 supplémentaires et 6 P1.

### Nouveaux P0

#### P0-5 · `/app/properties` (côté customer) crash 500

- **Reproduction** : URL `/app/properties` connecté en customer.
- **Observé** : 500 Server Error (overlay « This page couldn't load »). Même call-stack que P0-3/P0-4 — la page est gatée par `forbidden()` non configuré. C'est en plus la cible du lien navbar `List a property` (P1-7).

#### P0-6 · `/app/properties/[id]` et `/app/customers/[id]` crashent en 500

- **Reproduction** : `fetch('/app/properties/123')` → 500, `fetch('/app/customers/1')` → 500.
- **Cause** : mêmes pages gatées par `forbidden()` (probablement `src/app/(dashboard)/app/properties/[id]/page.tsx` + `customers/[id]/page.tsx`). La famille de bugs `forbidden()` couvre donc **au moins 5 pages distinctes** (`/app/calendar`, `/app/properties/new`, `/app/customers`, `/app/properties`, `/app/properties/[id]`, `/app/customers/[id]`) — un seul changement d'architecture les corrige toutes.

### Nouveaux P1

#### P1-12 · `/app/leases/new` accessible aux customers (formulaire complet)

- **Reproduction** : URL `/app/leases/new` connecté en customer → 200, formulaire complet de création de bail (`Type`, `Devise`, `Fréquence`, bouton "Créer le bail").
- **Impact** : surface d'écriture **agent** entièrement exposée au customer. Probablement un sous-ensemble de P1-5 (le bouton "Nouveau bail" sur `/app/leases` pointe ici). Le POST sera vraisemblablement 403 côté API, mais l'UX est cassée et un escape-hatch admin se promène. À gater côté server component avec un redirect.

#### P1-13 · « Faire une offre » sur les ventes = formulaire Airbnb-style (dates + invités)

- **Reproduction** : `/properties/appartement-f2-a-ouakam-vzlk1z` (bien `À vendre`) → bouton "Faire une offre" → modale "Précisez vos dates et le nombre d'invités. Le propriétaire confirmera votre demande." Champs : Arrivée / Départ / Invités (1–20) / Message.
- **Observé** : le POST réussit (`/properties/[slug]` → 200 `{ok:true}`), une booking est créée à `total_amount = property.price` (`121,000,000 F CFA`) avec dates `2026-06-10 → 2026-06-15`. Donc une "offre d'achat" est représentée comme un séjour locatif de 5 jours.
- **Spec attendue (TC-LOC-11 Q1)** : montant total auto-calculé, **montant d'acompte**, **caution**, **délai de validité de l'offre**, CGU à accepter.
- **Impact** : sémantiquement faux. Soit (a) le wording de la modale doit changer selon `contract_type`, soit (b) deux formulaires distincts (Réserver pour location courte / Faire une offre pour vente).

#### P1-14 · Aucune fiche agent / agence accessible (TC-LOC-37 inopérant)

- **Reproduction** : sur la fiche bien, le panneau agent affiche `Aminata Mbaye` / `Dakar Immo` mais aucun de ces textes n'est un lien. Tentatives directes : `/agents/aminata-mbaye` 404, `/agencies/dakar-immo` 404, `/agencies` 404, `/agents` 404.
- **Impact** : laisser un avis sur un agent ou une agence est **impossible** depuis l'app — TC-LOC-37 entièrement non fonctionnel. À ajouter (route + page + lien depuis la fiche bien).

#### P1-15 · `/app/visits/[id]` — détail introuvable même pour son propre owner

- **Reproduction** : `/app/visits/614` (visite dont customer 133 est `customer_id`).
- **Observé** : page rend "Impossible de charger cette visite." en FR.
- **Cause probable** : même filter mismatch que P1-3 — le backend cherche par `visitor_id` (NULL) au lieu de `customer_id`.
- **Impact** : TC-LOC-09 Q3-Q5 (annuler la visite, donner feedback) impossibles tant que la liste reste vide. Cohérent avec P1-3.

#### P1-16 · `<title>` figé sur "Tableau de bord — Takussan" sur de nombreuses pages `/app/*`

- **Reproduction** : `/app/profile/notifications` → title `Tableau de bord — Takussan`. Idem `/app/maintenance/new`, `/app/calendar` (avant crash), `/app/leases/new`. Seules certaines pages overrident correctement (`/app/leases`, `/app/bookings`, `/app/visits`, `/app/profile`).
- **Impact** : SEO interne et historique navigateur incohérents (impossible de retrouver l'onglet "Notifications" dans la liste de navigation rapide). À ajouter `metadata.title` sur les `page.tsx` concernées.

#### P1-17 · Section "Recently viewed" / "FOR YOU" en anglais sur les fiches bien

- **Reproduction** : visiter ≥ 1 fiche bien, retourner sur une autre fiche → en bas de page, `FOR YOU`, `Recently viewed`, `Clear history`, et chaque carte avec `3 ch • 183 m² • 1 sdb` (vs `3 Ch.` dans le listing).
- **Impact** : i18n EN sur un composant visible site-wide une fois la nav démarrée. Carte format différent du listing principal (P2 visiteur P2-9 cousin).

### Nouveaux P2

#### R2-1 · « Récemment consultés » absent de la home (TC-LOC-07 Q1)

- Spec : "Une section 'Récemment consultés' / carrousel s'affiche avec les 3 biens visités". Observé : la home ne montre **rien** sur le sujet ; la section apparaît seulement sur les **fiches bien**. Le localStorage `takussan.recently-viewed` est rempli (4 ids) mais non rendu sur `/`.

#### R2-2 · Section "Recently viewed" en EN (cf. P1-17) — même item

#### R2-3 · Booking de vente créé avec `start_date`/`end_date` aberrants

- POST de vente avec `start_date=2026-06-10`, `end_date=2026-06-15`. Sur une vente, ces champs n'ont aucun sens et seront affichés en liste comme `10 Jun 2026 → 15 Jun 2026`. À soit ne pas envoyer ces champs sur les ventes, soit les remplacer par `offer_amount` + `offer_expires_at` côté backend (cf. P1-13).

#### R2-4 · Modale "Signaler" : motifs divergents de la spec

- Spec TC-LOC-38 propose `Spam, Diffamation, Hors-sujet, Autre`. Implémenté : `Spam, Annonce trompeuse, Arnaque/fraude, Contenu inapproprié, Autre`. Choix raisonnable mais à harmoniser dans la spec ou le code.

#### R2-5 · Date "5 mai 2026" sur dashboard `/app` mais "21 Jun 2025" sur `/app/leases/[id]` — incohérence interne

- Le dashboard customer (`/app`) utilise un format FR localisé (`5 mai 2026`), mais la fiche bail consomme le format EN (`21 Jun 2025`). Deux formatters différents dans le même produit. Aligne le helper central.

#### R2-6 · Échéancier `/app/leases/[id]` : abréviations FR/EN mélangées

- Échéancier liste : `1 Jul 2025`, `1 Aug 2025`, `1 Sept 2025` — `Sept` est FR (`sept.` ou `Sept.`) alors que `Aug`/`Jul` sont EN. C'est l'output de Intl en mode auto sur une locale fr-* (Intl produit `sept.` pour septembre vs `Aug` pour août selon tweaks). Confirmant que le formatter mixe locale `en` (`Aug`/`Jul`) et locale `fr` (`sept.`) sur la même page — possiblement deux helpers concurrents.

#### R2-7 · `/app/inventories` et fiche EDL : libellés "Bail #X · Bien #Y", date EN, pas de download PDF

- État des lieux #112 référence `Bail #103 · Bien #293` (ids bruts). Pas de titre du bien, pas de lien vers la fiche bail/bien, pas de bouton "Télécharger PDF" comme demandé par TC-LOC-41 Q3. Page utilisable en lecture mais pas exploitable. Aucun lien dans la sidebar pour atteindre cette section.

#### R2-8 · Section H3 "Delete my account" en anglais sur `/app/profile`

- Le bloc de suppression de compte (sécurité) est intégralement en EN : titre, description "Deletion is irreversible…", bouton "Delete my account". Le reste du panneau Sécurité (2FA, vérif téléphone, sessions) est en FR. Composant non passé en i18n.

#### R2-9 · `/app/profile/notifications` — préférence "Alerte seuil KPI" présentée à un customer

- Préférence de notification qui n'a pas de sens pour un client (KPI = métrique agent). À masquer selon le rôle. Mineur.

### Nouveaux P3

#### P3-5 · `/app/overview/super-admin` → 404 alors que `/app/overview/agency`/`owner`/`exports` redirigent

- Incohérence de comportement de gating : la plupart des routes overview pour des rôles que je n'ai pas → redirect (302 opaque), mais `super-admin` → 404. Soit toutes redirect, soit toutes 404.

### Round 2 — résumé des routes `/app/*` testées en customer

| Route | Statut HTTP | Comportement | Verdict |
|-------|------------:|--------------|---------|
| `/app` | 200 | Dashboard tenant FR ✅ | OK |
| `/app/overview` | 302 → `/app/overview/tenant` | OK | OK |
| `/app/overview/tenant` | 200 | KPI + échéances | OK |
| `/app/overview/agency` | redirect | gated proprement | OK |
| `/app/overview/owner` | redirect | gated proprement | OK |
| `/app/overview/super-admin` | **404** | différent des autres overview | P3-5 |
| `/app/overview/exports` | redirect | gated proprement | OK |
| `/app/properties` | **500** | `forbidden()` non configuré | **P0-5** |
| `/app/properties/[id]` | **500** | idem | **P0-6** |
| `/app/properties/new` | **500** | idem (déjà P0-4) | **P0-4** |
| `/app/customers` | **500** | idem (déjà P0-4) | **P0-4** |
| `/app/customers/[id]` | **500** | idem | **P0-6** |
| `/app/calendar` | **500** | idem (déjà P0-3) | **P0-3** |
| `/app/leases` | 200 | mais `Nouveau bail` exposé | P1-5 |
| `/app/leases/new` | 200 | accessible **sans gating** | **P1-12** |
| `/app/leases/[id]` | 200 | OK lecture | OK |
| `/app/bookings` | 200 | 1/4 listées | P1-8 |
| `/app/bookings/[id]` | 200 | mais "Enregistrer un paiement" agent | P1-4 |
| `/app/visits` | 200 | passées invisibles | P1-3 |
| `/app/visits/[id]` | 200 | "Impossible de charger" | **P1-15** |
| `/app/payments` | 500 (côté React) | crash Field | **P0-1** |
| `/app/messages` | 200 | empty state mixte FR/EN | P2-11 |
| `/app/maintenance` | 200 | OK | OK |
| `/app/maintenance/new` | 200 | sans `?property=` | P1-10 |
| `/app/maintenance/[id]` | 200 | non testé | 🔲 |
| `/app/documents` | 200 | OK | OK |
| `/app/inventories` | 200 | accessible mais pas dans sidebar | R2-7 |
| `/app/inventories/[id]` | 200 | OK lecture | OK |
| `/app/saved-searches` | 200 | mais création crashe | **P0-2** |
| `/app/favorites` | 200 | OK | OK |
| `/app/profile` | 200 | bloc EN (R2-8) | R2-8 |
| `/app/profile/notifications` | 200 | OK FR | OK |
| `/app/profile/reviews` | 200 | OK | OK |

### Round 2 — checks complémentaires effectués

- **Mobile responsive 390×844** : `/app` (drawer hamburger ✅), `/app/leases/[id]` (pas d'overflow horizontal ✅, échéancier scroll vertical OK).
- **Language toggle** : `/app` → menu Langue → English EN. `<html lang>` passe à `"en"`, mais aucun cookie `NEXT_LOCALE` posé, aucun texte n'est traduit (sidebar, KPI, dashboard restent FR). Identique sur Wolof — confirme P1-2 visiteur, **rien n'est fonctionnel**.
- **localStorage de l'app authentifiée** : seul `takussan.recently-viewed` est utilisé pour persister l'historique (4 ids). Pas de `takussan.favorites` (passe par l'API).
- **POST `/api/auth/login` avec email majuscules** : confirmé que c'est bien le frontend (`Next.js`) qui passe l'email lowercased en sortie de form (P1-1) — le backend renvoie 200 si on tape l'email exact côté curl.
- **Console JS** : aucune erreur JS pendant tous les parcours hors les 6 pages qui crashent côté Server Component (rendues en overlay Next dev).

### Mise à jour des hypothèses techniques

7. **`forbidden()` couvre 6+ pages** : la famille de bugs `forbidden()` non gated touche `/app/calendar`, `/app/properties/new`, `/app/customers`, `/app/properties`, `/app/properties/[id]`, `/app/customers/[id]`. Un seul fix d'architecture (remplacer par `redirect('/app')` ou activer `experimental.authInterrupts`) résout 6 pages d'un coup. Côté UX, `redirect` est meilleur (le customer n'a pas besoin de voir un 403, il doit revenir sur son dashboard).
8. **Format dates/montants — confirmation** : le helper de format n'utilise pas `'fr-FR'`. Confirmation : sur le **même utilisateur**, `/app` rend `5 mai 2026` (FR) tandis que `/app/leases/[id]` rend `21 Jun 2025` (EN). Au moins deux helpers en parallèle. À unifier dans `src/lib/format.ts`.
9. **i18n côté layout authentifié — confirmé** : la nav publique passe entièrement en EN dès qu'on est connecté, le footer aussi, plus la section "Recently viewed", plus le bloc "Delete my account" du profil. Le toggle de langue dans la nav `/app/*` ne change que `<html lang>` — aucun store/context i18n derrière. Recommandation : choisir `next-intl` ou `react-intl` puis migrer le shell connecté en priorité (les composants partagés `Footer`, `Navbar`, `RecentlyViewed`, `DeleteAccountSection`). Cf. P1-2 visiteur pour le détail.
10. **Booking polymorphisme** : la table `bookings` a `start_date`/`end_date`/`total_amount`/`deposit_amount` qui modélise correctement les deux usages (location courte + offre d'achat) mais le **frontend** ne distingue pas les contrats. Possibilité simple : sur `contract_type=sale`, modal différente avec champs `offer_amount` + `offer_expires_at` + CGU + financement, qui mappent vers `total_amount` + une métadata côté backend.

---

## Récap consolidé — top fixes

1. **Fixer `forbidden()`** sur 6 pages → résout P0-3, P0-4, P0-5, P0-6 (toute la fuite admin renvoyant 500).
2. **Wrapper le `Label` Base UI dans `<Field.Root>`** → résout P0-1 (`/app/payments`), P0-2 (`SaveSearchButton`).
3. **Hydrater la modale "Demander une visite"** avec les coordonnées du user authentifié → résout P1-2.
4. **Câbler une vraie passerelle paiement** sur `/app/bookings/[id]` et `/app/leases/[id]` (CTA tenant `Payer l'acompte` / `Payer le loyer`) → résout P1-4 et déverrouille TC-LOC-13/14/15/20.
5. **Filter visits/bookings par `customer_id`** côté backend → résout P1-3 et P1-15.
6. **Ajouter sélecteur de bien** sur `/app/maintenance/new` → résout P1-10.
7. **Différencier modale "Faire une offre" vs "Réserver"** selon `contract_type` → résout P1-13.
8. **Créer routes `/agents/[slug]` et `/agencies/[slug]`** + lien depuis le panneau agent → résout P1-14 et débloque TC-LOC-37.
9. **Masquer actions agent** sur `/app/leases`, `/app/leases/[id]`, navbar publique côté customer → résout P1-5, P1-6, P1-7, P1-12.
10. **i18n complète** : dossier `src/components/property/RecentlyViewed`, `Footer authentifié`, `DeleteAccountSection`, modaux (`Close`, `New group`, etc.), formatters dates/montants → résout P1-11, P1-17, R2-5/6/8 et la quasi-totalité des P2 i18n.
