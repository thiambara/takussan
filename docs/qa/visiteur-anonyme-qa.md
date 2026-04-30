# QA — Visiteur anonyme 👤

**Acteur :** Visiteur non connecté (aucun compte requis)
**Environnement :** `http://localhost:3000` (frontend) · `http://localhost:8002` (backend)
**Testeur :**
**Date :**
**Version :**

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ Pass | Fonctionne comme attendu |
| ❌ Fail | Bug ou comportement incorrect |
| ⚠️ Partiel | Fonctionne avec réserves |
| 🔲 Non testé | Pas encore vérifié |

---

## 1. Page d'accueil (`/`)

### TC-VA-01 — Chargement de la page d'accueil

**Q1 :** La page se charge sans erreur console (F12) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le logo Takussan est visible dans la navbar ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La navbar affiche les liens de navigation (Recherche, Acheter/Louer, catégories) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les boutons "Connexion" et "Publier" sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** La section "Biens en vedette" affiche des cartes de biens avec prix, localisation et type ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** La section "Derniers ajouts" affiche des biens différents de "En vedette" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Le footer est complet (liens, réseaux sociaux, newsletter) et fonctionnel ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q8 :** En cliquant "Connexion", la redirection va vers `/auth/login` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q9 :** En cliquant "Publier" sans être connecté, l'utilisateur est redirigé vers l'authentification ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Recherche plein-texte et filtres de base (`/properties`)

### TC-VA-02 — Barre de recherche

**Q1 :** La barre de recherche sur l'accueil redirige vers `/properties?search=...` après soumission ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le texte saisi est bien préservé dans l'URL après soumission ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La recherche "appartement Dakar" retourne des résultats cohérents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le compteur de résultats ("X biens trouvés") est affiché et se met à jour avec les filtres ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-03 — Filtres de base

**Q1 :** Le filtre **Type de transaction** (Vente / Location) fonctionne et réduit les résultats ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le filtre **Type de bien** (Appartement, Villa, Terrain, Commerce, etc.) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le filtre **Ville** fonctionne et réduit les résultats ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le filtre **Budget min/max** fonctionne correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Le filtre **Chambres** fonctionne (ex: "2 ch." réduit les résultats) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Le filtre **Surface** (min/max m²) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Les tags de filtres actifs (avec ×) apparaissent au-dessus des résultats ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q8 :** Le bouton "Tout effacer" supprime tous les filtres et restaure les résultats complets ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-04 — Tri des résultats

**Q1 :** Le tri par **Prix croissant** réordonne les biens correctement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le tri par **Prix décroissant** fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le tri par **Récence** (derniers ajouts en premier) fonctionne ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le tri par **Pertinence** fonctionne quand une recherche textuelle est active ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les labels du dropdown de tri sont en français (pas les valeurs internes comme `price_asc`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-05 — Pagination

**Q1 :** La pagination est présente et fonctionnelle (page 1, 2, 3…) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le changement de page ne remet pas les filtres à zéro ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Filtres avancés (P1)

### TC-VA-06 — Filtres avancés

**Q1 :** Un filtre **Amenités / Équipements** (piscine, parking, gardiennage, etc.) est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le filtre **Disponibilité** (disponible immédiatement, date) existe ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le filtre **Étage** est disponible pour les appartements ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Le filtre **Meublé / Non meublé** est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Fiche bien publique (`/properties/[slug]`)

### TC-VA-07 — Affichage de la fiche bien

**Q1 :** La fiche bien s'affiche avec un titre, une adresse, le prix et la surface ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La galerie photos s'affiche correctement et est navigable (précédent/suivant) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les caractéristiques détaillées (chambres, SDB, surface, année de construction) sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La description du bien est affichée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** L'agent responsable est affiché (nom, agence) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Le breadcrumb de navigation est présent (Accueil > Type > Ville > Quartier) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-08 — Formulaire de contact

**Q1 :** Un formulaire de contact ou un bouton "Contacter l'agent" est présent sur la fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Tenter de contacter sans être connecté redirige vers la page de login ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le bouton "Réserver" est visible sur la fiche bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Cliquer "Réserver" sans être connecté demande bien de se connecter (pas d'accès direct) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Le bouton "Demander une visite" est visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Partage d'un bien (P1)

### TC-VA-09 — Partage

**Q1 :** Un bouton ou lien de partage est présent sur la fiche bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** L'option "Copier le lien" génère une URL directe vers la fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Des icônes de partage sur les réseaux sociaux (WhatsApp, Facebook, Twitter/X) sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** L'URL partagée ouvre bien la bonne fiche bien quand on la colle dans le navigateur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Avis publics (P2)

### TC-VA-10 — Consultation des avis

**Q1 :** La section "Avis" est visible sur la fiche bien (ou la fiche agence/agent) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les avis affichent auteur, note (étoiles), date et texte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Les réponses publiques des propriétaires/agents aux avis sont visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-11 — Signalement d'un avis

**Q1 :** Un lien "Signaler cet avis" est disponible sur chaque avis public ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le clic sur "Signaler" sans être connecté demande de se connecter ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le formulaire de signalement permet de choisir un motif ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Protection des routes

### TC-VA-12 — Accès refusé aux zones privées

| Route | Comportement attendu | Comportement observé | Statut |
|-------|---------------------|----------------------|--------|
| `/app` | Redirection vers `/auth/login` | | 🔲 |
| `/app/properties` | Redirection vers `/auth/login` | | 🔲 |
| `/app/leases` | Redirection vers `/auth/login` | | 🔲 |
| `/app/messages` | Redirection vers `/auth/login` | | 🔲 |
| `/admin` | Redirection vers `/auth/login` | | 🔲 |
| `/admin/team` | Redirection vers `/auth/login` | | 🔲 |

---

## 8. Récapitulatif des bugs trouvés

| # | Sévérité | Page | Description | Statut |
|---|----------|------|-------------|--------|
| | P0 | | | |
| | P1 | | | |
| | P2 | | | |
| | P3 | | | |

---

## 9. Notes du testeur

> _______________________________________________
> _______________________________________________
> _______________________________________________
