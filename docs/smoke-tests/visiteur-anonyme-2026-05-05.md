---
date: 2026-05-05
tester: Claude (smoke test browser)
account: Visiteur anonyme (incognito context, aucune session)
env: localhost:3000 (web Next.js 16.2.3) + localhost:8002 (api Laravel)
spec: docs/qa/visiteur-anonyme-qa.md
scope: parcours public — home, listing, fiche bien, comparateur, favoris anonymes, routes protégées, i18n, footer, responsive
---

# Smoke test — Visiteur anonyme (parcours public)

Test browser exhaustif des pages accessibles sans authentification, suivant la grille `docs/qa/visiteur-anonyme-qa.md`.
Bugs et anomalies recensés ci-dessous, classés par sévérité puis par module.

## Légende sévérité

- **P0** — bloque l'usage du module (page blanche, crash, action principale impossible)
- **P1** — fonctionnalité dégradée mais contournable (erreur visible, donnée manquante, obligation légale non respectée)
- **P2** — anomalie UX/i18n/données incohérentes sans blocage
- **P3** — petits écarts, warnings console, polish

---

## Synthèse

| Sévérité | Nombre |
|----------|-------:|
| P0       |      0 |
| P1       |      6 |
| P2       |     12 |
| P3       |      4 |
| **Total**| **22** |

**Verdict** : aucun chemin critique cassé — un visiteur peut chercher, consulter, ajouter des favoris, comparer, trouver l'agent. Les blocages sont **côté légal/UX** : pages légales toutes en 404, sélecteur de langue inopérant (FR/EN/WO non traduits), comparateur entièrement en anglais, formulaire de contact public absent (modale "Connexion requise" à la place — divergence avec la spec QA). À traiter en priorité avant lancement public.

---

## P1 — dégradé

### P1-1 · Toutes les pages légales/footer renvoient 404

- **Reproduction** : `curl -I http://localhost:3000/{mentions-legales,cgu,confidentialite,cookies,a-propos,contact}` → toutes 404.
- **Observé** : aucune des 6 routes attendues par TC-VA-27 n'existe. Le footer est minimal et ne contient ni "Mentions légales", ni "CGU", ni "Politique de confidentialité", ni "Cookies", ni "Contact", ni "À propos".
- **Impact** : non-conformité légale (RGPD, mentions obligatoires d'éditeur, droit de la consommation), aucun moyen de contact. Bloque tout lancement public au Sénégal/UE.
- **À faire** : créer les 6 pages, brancher les liens dans le footer.

### P1-2 · Sélecteur de langue n'effectue aucune traduction

- **Reproduction** : sur `/`, ouvrir le menu Langue → cliquer "English EN" (TC-VA-26).
- **Observé** : `<html lang>` passe à `"en"` (donc le clic est traité), mais **aucun texte n'est traduit** : title FR, hero `À découvrir à Dakar`, nav `Connexion / Publier`, footer FR, recherche FR. Idem si on choisit `WO`.
- **Aucun cookie ni localStorage n'est posé** pour persister la langue (`NEXT_LOCALE`, `i18n`, etc. absents) — le choix est perdu au prochain rechargement.
- **Impact** : promesse trilingue de la home cassée, fonctionnalité non fonctionnelle. À retirer du menu ou implémenter un vrai i18n (next-intl, router locale).

### P1-3 · Page `/compare` quasi entièrement en anglais

- **Reproduction** : ajouter 2 biens via l'icône comparateur, naviguer sur `/compare`.
- **Observé** : tous les libellés UI sont en anglais alors que la home est en FR — `COMPARATOR`, `Compare properties`, `2 properties selected — compare to decide.`, `CRITERION`, `View property`, `Remove …`, `Price`, `Transaction`, `Property type`, `Billing period`, `City`, `Neighborhood`, `Area`, `Bedrooms`, `Bathrooms`, `Floor`, `Furnished`, `No`, `Year built`, `Parking spots`, `Amenities`, `Other tags`. Seules les valeurs métier restent en français (`À vendre`, `Appartement`, `Dakar`).
- **Impact** : page entière de comparaison illisible pour un utilisateur francophone. À traduire intégralement (`takussan-web/src/app/.../compare/...`).

### P1-4 · Barre flottante "Comparator" entièrement en anglais (visible site-wide)

- **Reproduction** : ajouter ≥ 1 bien au comparateur depuis n'importe quelle carte. Une barre fixe apparaît en bas.
- **Observé** : `Comparator`, `1 / 4 propertie(s)` (typo — pluriel parenthésé en plus), `Remove property #621 from the comparator`, `Compare (1)`, `Clear comparator`. Cette barre est rendue sur **toutes les pages** (home, listing, fiche, favoris, compare).
- **Impact** : très visible, donne une impression de produit non fini partout. Toast `Ajouté au comparateur` est en revanche bien en FR — le composant store/store-bar a juste été oublié dans la passe i18n.

### P1-5 · Page `/favorites` — H1 et message en anglais

- **Reproduction** : ouvrir `/favorites` (TC-VA-24 Q5).
- **Observé** : `<title>` est `"Mes favoris — Takussan — Takussan"` (FR + duplication, voir P3-1) mais le `<h1>` affiché à l'écran est `"My favorites"` et le message vide est `"1 saved property."`.
- **Impact** : incohérence FR/EN sur la même page. Cohérent avec P1-2.

### P1-6 · Formulaire de contact public absent — fiche bien

- **Spec QA TC-VA-16 Q2** demande explicitement : « pour un visiteur anonyme, un formulaire public s'affiche avec les champs Nom, Email, Téléphone, Message ».
- **Observé** : sur `/properties/[slug]`, cliquer **Envoyer un message** ouvre une modale `Connexion requise`, **pas** de formulaire public. Idem pour **Réserver** (modale "Connectez-vous pour réserver") et **Demander une visite**.
- **Impact** : un visiteur anonyme ne peut **pas** contacter l'agent — barrière forte à la conversion (lead). Soit corriger la spec QA (et accepter ce flow), soit ajouter le formulaire public minimal. Recommandation : formulaire public minimal (nom + email + message + reCAPTCHA) ou au minimum lien WhatsApp / Appeler exposé sans login (déjà cliquable mais déclenche probablement aussi modale — non vérifié).

---

## P2 — UX / i18n

### P2-1 · Auto-complétion barre de recherche en anglais

- Sur `/`, taper `Da` dans le champ "Où cherchez-vous ?" : la listbox affiche `Search a city, neighborhood, property type…`, `See all cities`, `All types` — tout en anglais.
- **Aucune suggestion contextuelle** n'apparaît pour `Da` (Dakar, Dakar Plateau attendus selon TC-VA-05 Q1).
- **Impact** : i18n incomplet + UX dégradée (pas de suggestions intelligentes).

### P2-2 · Boutons de navbar en anglais (`My favorites`, `Language`)

- `aria-label` du bouton cœur navbar = `"My favorites"`, du bouton drapeau = `"Language"`.
- Visible aux lecteurs d'écran et aux outils d'audit.
- **Impact** : a11y FR cassée. Renommer en "Mes favoris" et "Langue".

### P2-3 · Boutons "Close" des modales en anglais

- Modales **Connexion requise** (Réserver, Envoyer un message, Signaler), **Partager cette annonce** : toutes ont un bouton invisible `Close` (icône X) dont l'`aria-label` est en anglais.
- **Impact** : a11y FR cassée.

### P2-4 · Carte interactive (Leaflet) — boutons zoom en anglais

- Sur fiche bien et `/properties` (vue Carte), Leaflet expose `Zoom in` / `Zoom out` / `Marker` en anglais (description et accessible name).
- Solution : passer la locale Leaflet ou customiser via `attributionControl`/`zoomControl` props.

### P2-5 · Marqueurs carte sans prix

- Spec TC-VA-11 Q2 demande : « Les biens sont représentés par des marqueurs avec leur prix sur la carte ». Observé : marqueurs Leaflet par défaut (pin générique), aucun prix affiché. Cluster non plus.
- **Impact** : navigation par budget impossible depuis la carte.

### P2-6 · Données de seed visibles publiquement — biens "Property Test Filter - …"

- 17+ biens nommés `Property Test Filter - <random-id>` apparaissent dans toutes les listes publiques (home, `/properties`, fiche). Exemple : `Property Test Filter - 32a2BEu2`, `LsTIx6oY`, `3LVqHI5q`, `1aYPeZx5`, etc.
- **Impact** : tous les visiteurs voient ces fixtures bidons. À nettoyer en base ou à exclure côté `/api/public/properties*` via un flag `is_test`.

### P2-7 · Tarif `999 999 999 F CFA` (≈ 1 milliard) sur 3 biens "Propriété Premium Featured"

- Trois doublons en featured (`zh11`, `trej`, `HeM8`) tous au prix de **999 999 999 F CFA**, tous Almadies, tous identiques (titre, photo placeholder, surface 100 m², 2 ch). C'est un placeholder seed mis en évidence.
- **Impact** : crédibilité de la home (les 3 premiers résultats "Près de toi" sont des faux). À nettoyer ou reseeder.

### P2-8 · Adresse fiche bien dupliquée — "Amitié, Dakar, Dakar, SN"

- Dans le banner et la section Emplacement, l'adresse est `"Amitié, Dakar, Dakar, SN"` — quartier + ville + ville + pays.
- **Impact** : composition de l'adresse dans le formatter à corriger (probablement double inclusion city + region quand region == city).

### P2-9 · Section "Sélection de la semaine" : format de carte différent et hétérogène

- Sur la home, la section "Sélection de la semaine" (featured) affiche des cartes cover-style (ville en uppercase `ALMADIES`, pas de surface/chambres/SDB), tandis que "Près de toi" et "Pour ton prochain logement" affichent des cartes standard avec `ch • m² • sdb`. Section "Tout juste publié" : cartes standard sans `sdb`.
- **Impact** : 4 sections, 3 formats de carte différents — impression d'incohérence. À unifier (cf. memory `project_homepage_design_direction.md`).

### P2-10 · Footer extrêmement minimal — colonnes manquantes

- Le footer ne contient que : nom Takussan + tagline, formulaire newsletter, **2 liens** (`Biens en vedette`, `Nouveautés`), copyright. La spec QA TC-VA-03 attend : « colonnes à propos / liens utiles / contact / réseaux sociaux + icônes WhatsApp/FB/Twitter/Instagram + newsletter ».
- **Manque** : icônes réseaux sociaux, contact, à propos, mentions légales (cf. P1-1), liens vers les pages catégories.

### P2-11 · Doublons de biens entre sections home

- "Près de toi" (`?city=Dakar`) et "Pour ton prochain logement" (`?contract_type=rent`) partagent au moins 6 biens identiques (Maison Amitié, Chambre Guédiawaye, Hangar Ouest Foire, Bureau Dieuppeul, Property Test Filter -32a2BEu2, -LsTIx6oY). Spec TC-VA-02 Q2 demande des biens distincts.

### P2-12 · Bouton "Réserver" affiché pour un bien à louer

- La fiche `/properties/maison-de-standing-a-amitie-…` est un bien à louer (« 1 270 000 F CFA / mois », badge `À louer`), pourtant le CTA principal est `Réserver` (verbe normalement réservé à la location courte ou la vente). Pour un bien en location longue, le CTA attendu est plutôt **Demander une visite** (déjà présent en secondaire) ou **Postuler / Faire une demande**.
- Cohérence avec spec : TC-VA-17 Q1 demande `Réserver` pour location, `Faire une offre` pour vente — donc OK pour location courte. À clarifier si la location longue / location courte sont distinguées dans le modèle.

---

## P3 — polish / cosmétique

### P3-1 · `<title>` dupliqué : « X — Takussan — Takussan »

- Toutes les pages internes ont leur title doublé :
  - `/properties?city=Dakar` → `Rechercher des biens – Takussan — Takussan`
  - `/properties/[slug]` → `Maison de standing à Amitié · Takussan — Takussan`
  - `/compare` → `Comparer des biens — Takussan — Takussan`
  - `/favorites` → `Mes favoris — Takussan — Takussan`
- La home (`/`) est correcte (un seul "Takussan"). Probablement un `metadata.title.template` qui s'applique sur des titres déjà suffixés.

### P3-2 · Libellés de tri concis mais divergents de la spec

- Combobox tri propose `Pertinence`, `Prix ↑`, `Prix ↓`, `Plus récent`. Spec TC-VA-08 Q1 demande `Pertinence, Prix croissant, Prix décroissant, Plus récent`.
- Acceptable, mais à harmoniser dans la spec ou le code selon la convention retenue.

### P3-3 · Route `/super-admin` redirige sans paramètre `redirect=`

- `/app/*` et `/admin/*` redirigent correctement vers `/auth/login?redirect=%2F<path>` — comportement attendu.
- `/super-admin` redirige vers `/auth/login` **sans `redirect=`**. Inconsistant. Probable cause : route inexistante côté Next, donc 404 → fallback vers /auth/login sans capture du redirect.

### P3-4 · Console : 2 `<link rel="preload">` non utilisés

- Sur la home : avertissement Chrome `The resource …600-preview.jpg&w=384&q=75 was preloaded using link preload but not used within a few seconds`. Causé par le `next/image` `priority` sur des cartes hors viewport ou un mauvais `sizes`.
- Coût : -1 sur Lighthouse Best Practices.

---

## Couverture des cas testés

| TC | Page | Statut global | Notes |
|----|------|---------------|-------|
| TC-VA-01 | Accueil — chargement | ✅ | logo, nav, langue (sélecteur visible) ; pas de hero classique avec barre centrée — tout est dans la nav |
| TC-VA-02 | Accueil — sections | ⚠️ | doublons inter-sections (P2-11), 3 cartes featured identiques (P2-7), formats de carte hétérogènes (P2-9) |
| TC-VA-03 | Footer | ❌ | minimal, manque colonnes, légal, social, contact (P2-10) |
| TC-VA-04 | CTA Connexion / Publier | ✅ | redirection auth correcte |
| TC-VA-05 | Recherche depuis hero | ⚠️ | recherche par ville fonctionne, mais auto-complétion en EN sans suggestions (P2-1) |
| TC-VA-06 → 09 | Listing, filtres, tri, pagination | ✅ | 152 biens, filtres complets, pagination 6 pages, tri OK, chips OK, "Tout effacer" OK |
| TC-VA-10 | Filtres avancés | ✅ | Étage, Disponibilité, Équipements, Meublé, Featured tous présents |
| TC-VA-11 | Vue carte | ⚠️ | carte Leaflet OK, marqueurs présents — **mais sans prix** (P2-5) ; libellés Leaflet en EN (P2-4) |
| TC-VA-12 → 14 | Fiche bien | ✅ | breadcrumb, galerie 6 photos, caractéristiques, carte, agent ✓ |
| TC-VA-15 | Compteur de vues | ✅ | "5 vues" affiché |
| TC-VA-16 | Formulaire contact | ❌ | formulaire public anonyme absent — modale "Connexion requise" à la place (P1-6) |
| TC-VA-17 | Réservation | ✅ | modale "Connexion requise" pour anonyme |
| TC-VA-18 | Demande visite | ✅ | même flow |
| TC-VA-19 | Partage | ✅ | modale OK avec WhatsApp/FB/X/Email + bouton Copier |
| TC-VA-20 | Avis publics | ✅ | section présente, message vide "Aucun avis pour l'instant." |
| TC-VA-21 | Signaler | ✅ | modale "Connexion requise" |
| TC-VA-22 | Biens similaires | ✅ | 6 biens "Maison" même type listés |
| TC-VA-23 | Comparateur | ⚠️ | fonctionnel, **mais entièrement en anglais** (P1-3, P1-4) |
| TC-VA-24 | Favoris anonymes | ⚠️ | localStorage `takussan.favorites` OK + persistance, badge nav OK ; H1 page en EN (P1-5) |
| TC-VA-25 | Routes protégées | ✅ | `/app/*`, `/admin/*` → `/auth/login?redirect=<path>` ; `/super-admin` sans redirect (P3-3) |
| TC-VA-26 | i18n | ❌ | sélecteur de langue inopérant (P1-2) |
| TC-VA-27 | Liens footer / pages légales | ❌ | toutes 404 (P1-1) |
| TC-VA-29 | Responsive mobile | ✅ | 390×844 — hamburger, drawer filtres, pas d'overflow horizontal, cards 2-col |

---

## Hypothèses techniques sur les causes principales

1. **i18n** : un système est partiellement câblé (le `<html lang>` change), mais aucun catalogue (FR/EN/WO) n'alimente les composants. Probablement pas de `next-intl` ou middleware de locale actif. Le toggle est un changement d'attribut DOM uniquement.
2. **Comparateur** : module probablement développé après une bascule i18n et oublié dans la passe de traduction (toast OK, le reste en EN).
3. **Pages légales** : non créées du tout dans `takussan-web/src/app/`. À ajouter en 6 fichiers `page.tsx` minimaux + branchement dans le composant Footer.
4. **Données seed** : le seeder `database/seeders/PropertySeeder.php` produit des biens `Property Test Filter - <random>` et 3 `Propriété Premium Featured` à 999 999 999 F CFA qui ne sont pas filtrés du flux public. Filtrer côté API publique ou re-seed.

---

## Notes du testeur

- Toutes les requêtes API utilisées par le visiteur anonyme passent par `/api/public/properties*` → 200 OK, aucune erreur 4xx/5xx.
- Aucune erreur console JavaScript pendant tous les parcours (juste 4 warnings preload non utilisés sur la home).
- Pas de flash de contenu privé sur les routes protégées — la redirection est nette.
- Les boutons WhatsApp / Appeler / Message dans le panneau agent n'ont pas été cliqués individuellement (probablement même flow modale "Connexion requise" — à vérifier).
- Les avis (TC-VA-20) n'ont pas pu être testés avec données réelles, le bien testé n'avait pas d'avis.
- Lighthouse n'a pas été exécuté dans cette passe (TC-VA-28 non évalué).
