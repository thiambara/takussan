# Rapport QA — Takussan Web App
**Date :** 29 avril 2026  
**Testeur :** Claude (MCP chrome-devtools)  
**Environnement :** localhost:3000 (frontend) · localhost:8002 (backend)  
**Compte testé :** `super@demo.takussan.sn` / `password` (super_admin)  
**Référence spec :** `docs/features-by-actor.md`

---

## Résumé exécutif

| Catégorie | Statut |
|-----------|--------|
| Pages publiques | ✅ Fonctionnelles avec remarques mineures |
| Authentification | ✅ Fonctionnelle |
| Espace perso (back-office) | ⚠️ Partiellement fonctionnel — 4 pages en erreur |
| Administration | ⚠️ Partiellement fonctionnel — 3 pages 404, 1 erreur runtime |
| Internationalisation | ❌ Plusieurs chaînes anglaises en production |
| Données de seed | ⚠️ Incohérences type/surface dans les données de test |

**Bloquants P0 :** 4 erreurs Runtime + 3 pages 404 côté back-office.

---

## 1. Pages publiques (Visiteur anonyme)

### 1.1 Page d'accueil (`/`)

| Élément | Statut | Note |
|---------|--------|------|
| Navbar : logo, recherche, Acheter/Louer, catégories, langue, Connexion, Publier | ✅ | |
| Section "Biens en vedette" (4 cartes visibles, 11 en scroll) | ✅ | |
| Section "Derniers ajouts" | ⚠️ | Affiche **les mêmes biens** que "En vedette" — tri identique, devrait être `sort=created_desc` |
| Cartes propriété : prix, titre, localisation, chambres, surface, type, statut, favoris, comparateur | ✅ | |
| Footer : newsletter, liens, réseaux sociaux | ⚠️ | **Tous les liens du footer pointent vers `#`** (morts) |
| Performance LCP | ⚠️ | Avertissement console : image LCP sans `loading="eager"` |

**Bug :** La barre de recherche saisit du texte (ex: "Dakar") mais le soumet comme filtre de type de contrat uniquement (`?contract_type=sale`). Le texte n'est **pas utilisé comme filtre de localisation** et n'est pas préservé dans l'URL.

**Amélioration :** 3 propriétés "Propriété Premium Featured" sans adresse dans les vedettes — les données seed devraient être plus représentatives.

---

### 1.2 Page de recherche (`/properties`)

| Élément | Statut | Note |
|---------|--------|------|
| Panneau filtres (transaction, type bien, ville, quartier, budget, chambres, SDB, surface, meublé, vedette, équipements, mot-clé) | ✅ | Complet |
| Compteur de résultats | ✅ | "64 biens trouvés" |
| Pagination (3 pages, 30/page) | ✅ | |
| Vue Liste | ✅ | |
| Vue Carte | ✅ | Marqueurs Leaflet/OpenStreetMap chargent bien |
| Tag de filtre actif ("Vente ×") | ✅ | |
| Tri (relevance, etc.) | ✅ | |
| "Sauvegarder la recherche" | ⚠️ | Présent mais l'action pour un anonyme n'a pas été testée (doit requérir connexion) |

**Bug :** La saisie dans la barre de recherche principale de la navbar n'est pas préservée après navigation vers `/properties`.

**Amélioration :** Les données de seed contiennent de nombreuses propriétés incohérentes (ex: "Studio meublé à Yoff" — 5 chambres, 17 m² ; "Appartement meublé F1 à Hann Maristes" — type: Ferme). À nettoyer avant démo.

---

### 1.3 Fiche bien (`/properties/[slug]`)

| Élément | Statut | Note |
|---------|--------|------|
| Breadcrumb (Accueil > Louer > Dakar > Sicap Baobab) | ✅ | |
| Galerie photos avec "Voir toutes les photos (N)" | ✅ | |
| Rating, vues, référence (PR-XXXXXXXX) | ✅ | |
| Badges statut (Disponible, Mis en avant) | ✅ | |
| Caractéristiques : chambres, SDB, surface, année, parking | ✅ | |
| Description | ✅ | |
| Tableau caractéristiques (type, contrat, statut, année de construction) | ✅ | |
| Sidebar : prix/mois, Réserver, Demander une visite, Envoyer un message | ✅ | |
| Agent contact : Message, Appeler, Contacter via WhatsApp | ✅ | |
| Historique du prix (avec motif : renovation, market_adjustment) | ✅ | |
| Avis (notation agrégée + liste avec texte) | ✅ | |
| Signaler cette annonce | ✅ | |
| **Carte de l'emplacement** | ❌ | **Zone grise vide — la carte Leaflet ne se charge pas sur la fiche bien** |
| Biens similaires | ❌ | **Absent** (P2 selon spec §1.2) |
| Partage (bouton présent) | ⚠️ | Fonctionnalité non testée |

---

## 2. Authentification

### 2.1 Page de connexion (`/auth/login`)

| Élément | Statut | Note |
|---------|--------|------|
| Design split (image villa + formulaire) | ✅ | |
| OAuth : Google, Apple, Facebook | ✅ (UI) | Non testé fonctionnellement |
| Email + mot de passe | ✅ | |
| Afficher/masquer mot de passe | ✅ | |
| "Mot de passe oublié ?" | ✅ (UI) | Lien présent |
| "Pas encore de compte ? S'inscrire" | ✅ | |
| Connexion réussie → redirection `/app` | ✅ | |

### 2.2 Page d'inscription (`/auth/register`)

Non visitée lors de ce test — à inclure dans un prochain cycle.

---

## 3. Espace personnel back-office (`/app`)

### 3.1 Tableau de bord (`/app`)

| Élément | Statut | Note |
|---------|--------|------|
| KPIs (Biens actifs, Clients, Réservations, Commissions) | ⚠️ | Tous affichent "—" — ne chargent pas pour super_admin sans agence |
| Corps de page | ⚠️ | Placeholder "En cours de développement" |
| Sidebar navigation (18 entrées) | ✅ | |

---

### 3.2 Mes biens (`/app/properties`)

**❌ ERREUR BLOQUANTE — Page inaccessible**

```
Runtime Error (Server)
Attempted to call fetchDashboardProperties() from the server but
fetchDashboardProperties is on the client. It's not possible to invoke
a client function from the server.

→ src/app/(dashboard)/app/properties/page.tsx (54:50)
```

**Priorité : P0** — Page critique pour tous les acteurs (agent, owner, admin).

---

### 3.3 Publier un bien (`/app/properties/new`)

| Élément | Statut | Note |
|---------|--------|------|
| Section Informations générales (Titre, Type de bien, Type de contrat) | ✅ (partiel) | |
| Section Prix (Montant, Devise, Fréquence) | ✅ (partiel) | |
| **Valeurs selects en anglais** ("apartment", "rent") | ❌ | Doit être traduit en français |
| Adresse / géolocalisation | ❌ | **Absent du formulaire** |
| Photos / médias | ❌ | **Absent du formulaire** |
| Description | ❌ | **Absent du formulaire** |
| Caractéristiques (chambres, SDB, surface, etc.) | ❌ | **Absent du formulaire** |
| Équipements / tags | ❌ | **Absent du formulaire** |

Le formulaire est très incomplet par rapport à la spec P0 (§1.1). Seuls les champs de base sont présents.

---

### 3.4 Mes favoris (`/app/favorites`)

✅ Page fonctionnelle — état vide avec CTA "Découvrir les biens".

---

### 3.5 Recherches sauvegardées (`/app/saved-searches`)

✅ Page fonctionnelle — état vide avec CTA "Lancer une recherche" et instruction claire.

---

### 3.6 Réservations (`/app/bookings`)

⚠️ Structure en place mais affiche : **"Impossible de charger vos réservations."**  
Probable erreur 403 API pour super_admin sans agence liée.

---

### 3.7 Baux (`/app/leases`)

⚠️ CTA "Nouveau bail" présent mais affiche : **"Impossible de charger les baux."**  
Même cause probable que Réservations.

---

### 3.8 Maintenance (`/app/maintenance`)

✅ **Fonctionnelle et bien peuplée.**

| Élément | Statut |
|---------|--------|
| Filtres Statut / Priorité | ✅ |
| Section "URGENCES PRIORITAIRES" bien visible | ✅ |
| CTA "Nouvelle demande" | ✅ |
| Liste avec statuts colorés (Urgent/Terminée, Prise en compte) | ✅ |

---

### 3.9 Messagerie (`/app/messages`)

⚠️ Interface en place mais légèrement incomplète.

| Élément | Statut | Note |
|---------|--------|------|
| Panel conversations + panel messages | ✅ | |
| État vide ("Pas encore de conversation.") | ✅ | |
| Placeholder détail ("Select a conversation to view messages.") | ❌ | **En anglais** |
| Bouton "+ New group" | ❌ | **En anglais** |

---

### 3.10 Documents (`/app/documents`)

**❌ ERREUR BLOQUANTE — Page inaccessible**

```
Runtime Error
Base UI: FieldRootContext is missing. Field parts must be placed
within <Field.Root>.

→ src/components/ui/label.tsx (18:5)
→ src/components/documents/DocumentsFilters.tsx (59:9)
```

Un `<Label>` de Base UI est utilisé hors de son `<Field.Root>` dans `DocumentsFilters`. **Priorité : P0.**

---

### 3.11 Statistiques (`/app/overview` → `/app/overview/agency`)

**❌ ERREUR BLOQUANTE — API 403**

```
Runtime Error (Server)
API error 403

→ src/lib/api.ts (105:11)
→ AgencyDashboardPage
→ src/app/(dashboard)/app/overview/agency/page.tsx (19:19)
```

Super_admin sans agence déclenche un 403 sur le dashboard agence. Le routing devrait vérifier ce cas.

---

### 3.12 États des lieux (`/app/inventories`)

✅ **Fonctionnel et bien peuplé.**

| Élément | Statut |
|---------|--------|
| Filtres Type / Statut | ✅ |
| Liste avec type (Sortie) + statut (Signé) | ✅ |
| Association bail visible (État des lieux #273 · Bail #249) | ✅ |

---

### 3.13 Visites (`/app/visits`)

⚠️ Structure en place (tabs "À venir" / "Passées") mais affiche : **"Impossible de charger vos visites."**

---

### 3.14 Calendrier (`/app/calendar`)

✅ **Fonctionnel et riche.**

| Élément | Statut |
|---------|--------|
| Vues Mois / Semaine / Jour / Liste | ✅ |
| Navigation (< Aujourd'hui >) | ✅ |
| Filtres Réservations / Visites | ✅ |
| Filtre par bien | ✅ |
| Événements bien affichés avec nom de bien | ✅ |

---

### 3.15 CRM — Clients (`/app/customers`)

✅ **Fonctionnel.**

| Élément | Statut | Note |
|---------|--------|------|
| Tableau (CLIENT, CONTACT, TAGS, PIPELINE, STATUT) | ✅ | |
| Barre de recherche | ✅ | |
| Filtres pipeline et statut | ⚠️ | Affichent **`__all__`** au lieu de "Tous" — valeur interne visible |
| CTA "Ajouter un client" | ✅ | |
| Données présentes (Khady Toure, Fatou Faye, Cheikh Mbaye...) | ✅ | |

---

### 3.16 Profil (`/app/profile`)

✅ **Fonctionnel.**

| Élément | Statut | Note |
|---------|--------|------|
| Avatar avec initiales | ✅ | |
| Nom, email, rôle affiché ("Super administrateur") | ✅ | |
| Email vérifié | ✅ | Badge "Vérifié" |
| Téléphone | ⚠️ | "Bientôt disponible" |
| Bio | ✅ (UI) | |
| "Modifier le profil" | ✅ (UI) | Non testé fonctionnellement |

---

## 4. Administration (`/admin`)

### 4.1 Tableau de bord agence

⚠️ Placeholder "En cours de développement".

### 4.2 Biens admin

**❌ 404** — `/admin/properties` n'existe pas. Le lien sidebar pointe vers une route non créée.

### 4.3 Équipe

⚠️ **"Équipe" apparaît 2 fois dans le sidebar admin** — doublon à supprimer.

### 4.4 Finances

⚠️ Placeholder "En cours de développement".

### 4.5 Modération avis (`/admin/moderation`)

✅ **Fonctionnelle et bien peuplée.**

| Élément | Statut |
|---------|--------|
| 284 avis en file d'attente | ✅ |
| Interface split liste + détail | ✅ |
| Actions : Approuver / Masquer / Supprimer | ✅ |
| Filtres statut / sujet / "Signalés uniquement" | ✅ |

### 4.6 Modération biens

✅ (3 en attente) — Vue non testée en détail mais accessible.

Le lien sidebar "/admin/moderation/reviews" → **404**. L'URL correcte est `/admin/moderation`.

### 4.7 Rôles & Permissions (`/admin/roles`)

⚠️ Placeholder "En cours de développement".

### 4.8 Journal d'audit (`/admin/audit`)

**❌ ERREUR BLOQUANTE**

```
Runtime Error
Base UI: useToastManager must be used within <Toast.Provider>.

→ src/components/ui/toast.tsx (35:25)
→ src/components/admin/AuditTrail.tsx (68:25)
```

`useToast()` est appelé dans `AuditTrail` mais le composant se trouve hors du provider `Toast.Provider`. **Priorité : P1.**

### 4.9 Paramètres (`/admin/settings`)

✅ **Fonctionnel.**

| Élément | Statut |
|---------|--------|
| Tabs : Général / Tags & amenités / Intégrations | ✅ |
| Tableau clé/valeur/portée (booking_expiry_days, branding, default_currency=XOF, etc.) | ✅ |
| CTA "Nouveau paramètre" | ✅ |
| Actions edit/delete par ligne | ✅ |

---

## 5. Récapitulatif des bugs — classés par priorité

### P0 — Bloquants (empêchent l'utilisation)

| # | Page | Description | Fichier |
|---|------|-------------|---------|
| B-01 | `/app/properties` | Runtime Error : `fetchDashboardProperties` client appelée depuis Server | `app/properties/page.tsx:54` |
| B-02 | `/app/documents` | Runtime Error : `FieldRootContext missing` dans `DocumentsFilters` | `components/documents/DocumentsFilters.tsx:59` |
| B-03 | `/app/overview` | API 403 pour super_admin sans agence (`AgencyDashboardPage`) | `app/overview/agency/page.tsx:19` |
| B-04 | `/admin/audit` | Runtime Error : `useToastManager` hors `Toast.Provider` dans `AuditTrail` | `components/admin/AuditTrail.tsx:68` |
| B-05 | Fiche bien | Carte de l'emplacement vide (Leaflet ne s'initialise pas) | `components/PropertyMap` |

### P1 — Importants (dégradent l'expérience)

| # | Page | Description |
|---|------|-------------|
| B-06 | `/admin/properties` | 404 — route inexistante, lien sidebar cassé |
| B-07 | `/admin/moderation/reviews` | 404 — URL incorrecte (la bonne est `/admin/moderation`) |
| B-08 | `/app/bookings` | "Impossible de charger vos réservations" — API 403 probable |
| B-09 | `/app/leases` | "Impossible de charger les baux" — API 403 probable |
| B-10 | `/app/visits` | "Impossible de charger vos visites" — API 403 probable |
| B-11 | `/app/properties/new` | Selects type de bien/contrat en anglais ("apartment", "rent") |
| B-12 | `/app/messages` | Textes en anglais ("New group", "Select a conversation...") |
| B-13 | Accueil | Texte saisi dans la recherche ignoré comme filtre localisation |

### P2 — Améliorations UX

| # | Page | Description |
|---|------|-------------|
| B-14 | Accueil | "Derniers ajouts" affiche les mêmes biens que "En vedette" |
| B-15 | Tous | Footer : tous les liens pointent vers `#` |
| B-16 | App | Header back-office en anglais ("Search a city, neighborhood...") |
| B-17 | `/app` | Dashboard KPIs affichent "—" sans loader ni message d'état |
| B-18 | `/admin` | Doublon "Équipe" × 2 dans le sidebar admin |
| B-19 | `/app/customers` | Filtres affichent `__all__` au lieu de "Tous" |
| B-20 | Accueil | Warning performance LCP (`loading="eager"` manquant) |
| B-21 | `/app/properties/new` | Formulaire incomplet (manque : adresse, photos, description, caractéristiques) |
| B-22 | Fiche bien | Section "Biens similaires" absente |
| B-23 | Accueil | Barre de recherche ne préserve pas le texte saisi après soumission |

### P3 — Qualité des données seed

| # | Observation |
|---|-------------|
| B-24 | "Studio meublé à Yoff" : 5 chambres, 17 m² (incohérent) |
| B-25 | "Appartement meublé F1 à Hann Maristes" : type = Ferme |
| B-26 | "Appartement meublé F2 à Grand-Yoff" : type = Usine |
| B-27 | "Bel appartement 4 chambres - Liberté 6" : type = Hôtel |
| B-28 | 3 × "Propriété Premium Featured" sans adresse ni photos réelles |

---

## 6. Fonctionnalités par statut (spec `features-by-actor.md`)

### Visiteur anonyme

| Fonctionnalité | Priorité spec | Statut |
|----------------|---------------|--------|
| Page d'accueil (biens en vedette, derniers ajouts) | P0 | ✅ Fonctionnel |
| Recherche plein-texte | P0 | ⚠️ Partiel (texte ignoré) |
| Filtres de base (ville, type, prix, chambres, surface, transaction) | P0 | ✅ |
| Fiche bien publique (galerie, détails, formulaire de contact) | P0 | ✅ (carte absente) |
| Tri des résultats | P0 | ✅ |
| Filtres avancés (amenités, disponibilité) | P1 | ✅ |
| Partage d'un bien | P1 | ⚠️ Bouton présent, non testé |
| Consulter les avis publics | P2 | ✅ |

### Tous les utilisateurs authentifiés

| Fonctionnalité | Priorité spec | Statut |
|----------------|---------------|--------|
| Inscription email/mot de passe | P0 | Non testé |
| Connexion (tokens Sanctum) | P0 | ✅ |
| Déconnexion | P0 | Non testé |
| Mot de passe oublié | P0 | UI présente |
| Édition de profil | P0 | ✅ UI |
| OAuth Google | P1 | UI présente |
| 2FA (TOTP) | P1 | Non visible |
| Notifications in-app | P0 | Non testées |
| Favoris | P1 | ✅ Page présente |
| Recherches sauvegardées | P1 | ✅ Page présente |
| Upload fichiers | P0 | Non testés |

### Agent immobilier

| Fonctionnalité | Priorité spec | Statut |
|----------------|---------------|--------|
| Créer un bien | P0 | ⚠️ Formulaire partiel |
| Mes biens (liste) | P0 | ❌ Erreur runtime |
| Clients CRM | P0 | ✅ |
| Messagerie | P1 | ✅ UI |
| Maintenance | P1 | ✅ |
| États des lieux | P1 | ✅ |
| Visites | P2 | ⚠️ Erreur chargement |
| Calendrier | P1 | ✅ |
| Documents | P0 | ❌ Erreur runtime |
| Baux | P1 | ⚠️ Erreur chargement |
| Réservations | P1 | ⚠️ Erreur chargement |

### Admin d'agence / Super-admin

| Fonctionnalité | Priorité spec | Statut |
|----------------|---------------|--------|
| Modération avis | P2 | ✅ |
| Modération biens | P2 | ✅ |
| Rôles & Permissions | P0 | ⚠️ Placeholder |
| Journal d'audit | P1 | ❌ Erreur runtime |
| Paramètres (tags, amenités, config) | P0 | ✅ |
| Finances | P1 | ⚠️ Placeholder |
| Dashboard agence | P1 | ⚠️ 403 pour super_admin |

---

## 7. Recommandations prioritaires

1. **Corriger les 4 erreurs Runtime** (B-01 à B-04) — les pages sont totalement inaccessibles.
2. **Corriger la carte Leaflet sur les fiches bien** (B-05) — visible par tous les visiteurs.
3. **Gérer le cas super_admin sans agence** pour les statistiques et les erreurs "Impossible de charger" (B-03, B-08, B-09, B-10) — afficher un état vide explicatif plutôt qu'une erreur.
4. **Traduire les chaînes anglaises** restantes dans le back-office (B-11, B-12, B-16).
5. **Compléter le formulaire "Publier un bien"** (adresse, photos, description, caractéristiques) — c'est un parcours critique P0.
6. **Corriger les liens footer** (B-15) — tous les liens institutionnels sont cassés.
7. **Supprimer le doublon "Équipe"** dans le sidebar admin (B-18).
8. **Corriger les URLs sidebar admin** (`/admin/properties`, `/admin/moderation/reviews`).
9. **Nettoyer les données de seed** pour avoir des propriétés représentatives en démo (B-24 à B-28).
10. **Câbler les KPIs du dashboard** avec les vraies données API (B-17).
