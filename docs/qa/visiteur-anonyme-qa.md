# QA — Visiteur anonyme 👤

**Acteur :** Visiteur non connecté (aucun compte requis)
**Environnement :** `http://localhost:3000` (frontend) · `http://localhost:8002` (backend)
**Testeur :** Claude Code (MCP Chrome DevTools)
**Date :** 2026-04-30
**Version :** dev branch

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
> Réponse : Quelques avertissements mineurs (Leaflet CSS) mais aucune erreur bloquante
> Statut : ✅

**Q2 :** Le logo Takussan est visible dans la navbar ?
> Réponse : Oui, "Takussan" affiché en haut à gauche
> Statut : ✅

**Q3 :** La navbar affiche les liens de navigation (Recherche, Acheter/Louer, catégories) ?
> Réponse : Oui — dropdown "Acheter", barre de recherche, catégories (Appartement, Villa, Terrain, Commerce, Maison, Bureau, Plus)
> Statut : ✅

**Q4 :** Les boutons "Connexion" et "Publier" sont visibles ?
> Réponse : Oui, "Connexion" et "Publier" (bleu) présents en haut à droite
> Statut : ✅

**Q5 :** La section "Biens en vedette" affiche des cartes de biens avec prix, localisation et type ?
> Réponse : Oui, section présente avec cartes prix/localisation/type
> Statut : ✅

**Q6 :** La section "Derniers ajouts" affiche des biens différents de "En vedette" ?
> Réponse : Certains biens apparaissent dans les deux sections simultanément
> Statut : ⚠️

**Q7 :** Le footer est complet (liens, réseaux sociaux, newsletter) et fonctionnel ?
> Réponse : Footer présent avec tagline, newsletter et liens "Découvrir". Icônes réseaux sociaux absentes (WhatsApp, Facebook, Twitter/X manquants)
> Statut : ⚠️

**Q8 :** En cliquant "Connexion", la redirection va vers `/auth/login` ?
> Réponse : Oui, redirige correctement vers /auth/login
> Statut : ✅

**Q9 :** En cliquant "Publier" sans être connecté, l'utilisateur est redirigé vers l'authentification ?
> Réponse : Oui, redirige vers /auth/login
> Statut : ✅

---

## 2. Recherche plein-texte et filtres de base (`/properties`)

### TC-VA-02 — Barre de recherche

**Q1 :** La barre de recherche sur l'accueil redirige vers `/properties?search=...` après soumission ?
> Réponse : NON — la barre envoie `city=` au lieu de `search=`. Ex : "Dakar" → `/properties?city=Dakar` (pas `?search=Dakar`)
> Statut : ❌

**Q2 :** Le texte saisi est bien préservé dans l'URL après soumission ?
> Réponse : Oui, le texte est dans l'URL, mais sous le mauvais paramètre (`city=` au lieu de `search=`)
> Statut : ⚠️

**Q3 :** La recherche "appartement Dakar" retourne des résultats cohérents ?
> Réponse : NON — 0 résultats car la valeur entière "appartement Dakar" est passée comme nom de ville exact
> Statut : ❌

**Q4 :** Le compteur de résultats ("X biens trouvés") est affiché et se met à jour avec les filtres ?
> Réponse : Oui, "303 biens trouvés" affiché, se met à jour avec les filtres actifs
> Statut : ✅

### TC-VA-03 — Filtres de base

**Q1 :** Le filtre **Type de transaction** (Vente / Location) fonctionne et réduit les résultats ?
> Réponse : Oui, cliquer "Vente" ou "Location" filtre correctement les résultats
> Statut : ✅

**Q2 :** Le filtre **Type de bien** (Appartement, Villa, Terrain, Commerce, etc.) fonctionne ?
> Réponse : Oui, tous les types présents (Appartement, Maison, Villa, Studio, Chambre, Terrain, Bureau, Commerce, Entrepôt, Hôtel, Complexe, Garage, Parking, Ferme, Usine, Autre)
> Statut : ✅

**Q3 :** Le filtre **Ville** fonctionne et réduit les résultats ?
> Réponse : Oui, via `?city=Dakar` — les résultats sont filtrés par ville
> Statut : ✅

**Q4 :** Le filtre **Budget min/max** fonctionne correctement ?
> Réponse : Oui, champs Min/Max FCFA présents et fonctionnels (ex: `?price_min=50000&price_max=200000`)
> Statut : ✅

**Q5 :** Le filtre **Chambres** fonctionne (ex: "2 ch." réduit les résultats) ?
> Réponse : Oui, filtre Chambres présent et réduit les résultats correctement
> Statut : ✅

**Q6 :** Le filtre **Surface** (min/max m²) fonctionne ?
> Réponse : Oui, champs Min m² / Max m² présents et fonctionnels
> Statut : ✅

**Q7 :** Les tags de filtres actifs (avec ×) apparaissent au-dessus des résultats ?
> Réponse : Oui, chips de filtres actifs affichées avec × pour supprimer individuellement
> Statut : ✅

**Q8 :** Le bouton "Tout effacer" supprime tous les filtres et restaure les résultats complets ?
> Réponse : Oui, "Tout effacer" réinitialise tous les filtres et recharge les 303 résultats
> Statut : ✅

### TC-VA-04 — Tri des résultats

**Q1 :** Le tri par **Prix croissant** réordonne les biens correctement ?
> Réponse : Oui — `?sort=price_asc` : 50 000 → 50 000 → 100 000 → 197 552 → 226 077 F CFA
> Statut : ✅

**Q2 :** Le tri par **Prix décroissant** fonctionne ?
> Réponse : Oui — `?sort=price_desc` : 999 999 999 → 999 999 999 → 500 000 000 → 451 000 000 F CFA
> Statut : ✅

**Q3 :** Le tri par **Récence** (derniers ajouts en premier) fonctionne ?
> Réponse : Oui — `?sort=created_desc` affiche "il y a 4 jours", "la semaine dernière" en tête
> Statut : ✅

**Q4 :** Le tri par **Pertinence** fonctionne quand une recherche textuelle est active ?
> Réponse : Le paramètre `sort=relevance` ne provoque pas d'erreur mais la recherche textuelle (`search=`) ne filtre pas réellement, donc la pertinence ne peut pas être pleinement évaluée
> Statut : ⚠️

**Q5 :** Les labels du dropdown de tri sont en français (pas les valeurs internes comme `price_asc`) ?
> Réponse : NON — le bouton/trigger du dropdown affiche les clés internes (`relevance`, `price_asc`, `created_desc`) quand une option est sélectionnée. Les options dans le dropdown ouvert sont en français (Pertinence, Prix ↑, Prix ↓, Plus récent)
> Statut : ❌

### TC-VA-05 — Pagination

**Q1 :** La pagination est présente et fonctionnelle (page 1, 2, 3…) ?
> Réponse : Oui — 11 pages pour 303 résultats (30/page), navigation 1, 2, ..., 11 fonctionnelle
> Statut : ✅

**Q2 :** Le changement de page ne remet pas les filtres à zéro ?
> Réponse : Oui, les paramètres de filtre sont maintenus dans l'URL lors du changement de page
> Statut : ✅

---

## 3. Filtres avancés (P1)

### TC-VA-06 — Filtres avancés

**Q1 :** Un filtre **Amenités / Équipements** (piscine, parking, gardiennage, etc.) est disponible ?
> Réponse : Oui — section "Équipements" avec champ texte libre (placeholder "piscine, parking, terrasse..."), séparation par virgules
> Statut : ✅

**Q2 :** Le filtre **Disponibilité** (disponible immédiatement, date) existe ?
> Réponse : Non — aucun filtre de disponibilité trouvé dans le panneau de filtres
> Statut : ❌

**Q3 :** Le filtre **Étage** est disponible pour les appartements ?
> Réponse : Non — aucun filtre d'étage trouvé dans le panneau de filtres
> Statut : ❌

**Q4 :** Le filtre **Meublé / Non meublé** est disponible ?
> Réponse : Toggle "Meublé uniquement" présent sous "État du bien" — permet de filtrer uniquement les meublés, pas une option binaire meublé/non-meublé
> Statut : ⚠️

---

## 4. Fiche bien publique (`/properties/[slug]`)

### TC-VA-07 — Affichage de la fiche bien

**Q1 :** La fiche bien s'affiche avec un titre, une adresse, le prix et la surface ?
> Réponse : Oui — "Appartement F2 à Yoff", adresse "Yoff, Dakar, Dakar, SN", 174 000 000 F CFA, surface visible
> Statut : ✅

**Q2 :** La galerie photos s'affiche correctement et est navigable (précédent/suivant) ?
> Réponse : Zone galerie présente mais affiche "Aucune photo disponible" / "Photo à venir" — données de dev sans photos
> Statut : ⚠️

**Q3 :** Les caractéristiques détaillées (chambres, SDB, surface, année de construction) sont visibles ?
> Réponse : Oui — chambres, SDB, surface, année de construction (2027) affichés dans les caractéristiques
> Statut : ✅

**Q4 :** La description du bien est affichée ?
> Réponse : Oui — "Magnifique bien situé à Yoff, eau et électricité disponibles..."
> Statut : ✅

**Q5 :** L'agent responsable est affiché (nom, agence) ?
> Réponse : Oui — nom de l'agent et agence affichés dans le panneau de droite
> Statut : ✅

**Q6 :** Le breadcrumb de navigation est présent (Accueil > Type > Ville > Quartier) ?
> Réponse : Oui — "Accueil > Acheter > Dakar > Yoff"
> Statut : ✅

### TC-VA-08 — Formulaire de contact

**Q1 :** Un formulaire de contact ou un bouton "Contacter l'agent" est présent sur la fiche ?
> Réponse : Oui — bouton "Envoyer un message" présent dans le panneau de droite
> Statut : ✅

**Q2 :** Tenter de contacter sans être connecté redirige vers la page de login ?
> Réponse : NON — cliquer "Envoyer un message" affiche une modale "Connexion requise" au lieu de rediriger vers /auth/login
> Statut : ⚠️

**Q3 :** Le bouton "Réserver" est visible sur la fiche bien ?
> Réponse : Bouton de réservation présent mais libellé "Faire une offre" (pas "Réserver") — incohérence avec la spec
> Statut : ⚠️

**Q4 :** Cliquer "Réserver" sans être connecté demande bien de se connecter (pas d'accès direct) ?
> Réponse : Oui — modale "Connectez-vous pour réserver / Vous devez être connecté pour faire une demande de réservation"
> Statut : ✅

**Q5 :** Le bouton "Demander une visite" est visible ?
> Réponse : Oui, visible. MAIS : le formulaire s'ouvre directement sans demander de connexion — bug d'authentification (visiteur anonyme peut soumettre une demande de visite)
> Statut : ❌

---

## 5. Partage d'un bien (P1)

### TC-VA-09 — Partage

**Q1 :** Un bouton ou lien de partage est présent sur la fiche bien ?
> Réponse : Oui — bouton "Partager" en haut de la fiche, à côté du titre
> Statut : ✅

**Q2 :** L'option "Copier le lien" génère une URL directe vers la fiche ?
> Réponse : Oui — URL correcte affichée : `http://localhost:3000/properties/appartement-f2-a-yoff-2p27sk`, bouton "Copier" présent (sans feedback visuel de confirmation)
> Statut : ✅

**Q3 :** Des icônes de partage sur les réseaux sociaux (WhatsApp, Facebook, Twitter/X) sont disponibles ?
> Réponse : Oui — WhatsApp, Facebook, X, Email présents dans la modale de partage
> Statut : ✅

**Q4 :** L'URL partagée ouvre bien la bonne fiche bien quand on la colle dans le navigateur ?
> Réponse : Oui — l'URL slug ouvre directement la fiche correspondante
> Statut : ✅

---

## 6. Avis publics (P2)

### TC-VA-10 — Consultation des avis

**Q1 :** La section "Avis" est visible sur la fiche bien (ou la fiche agence/agent) ?
> Réponse : Oui — section "Avis" présente en bas de la fiche bien, affiche "Aucun avis pour l'instant"
> Statut : ✅

**Q2 :** Les avis affichent auteur, note (étoiles), date et texte ?
> Réponse : Impossible à vérifier — aucun avis dans les données de développement
> Statut : 🔲

**Q3 :** Les réponses publiques des propriétaires/agents aux avis sont visibles ?
> Réponse : Impossible à vérifier — aucun avis dans les données de développement
> Statut : 🔲

### TC-VA-11 — Signalement d'un avis

**Q1 :** Un lien "Signaler cet avis" est disponible sur chaque avis public ?
> Réponse : Lien "Signaler cette annonce" présent pour l'annonce globale. Pas de signalement par avis individuel (aucun avis disponible pour vérifier)
> Statut : ⚠️

**Q2 :** Le clic sur "Signaler" sans être connecté demande de se connecter ?
> Réponse : NON — le formulaire "Signaler cette annonce" s'ouvre directement sans authentification
> Statut : ❌

**Q3 :** Le formulaire de signalement permet de choisir un motif ?
> Réponse : Oui — dropdown Motif avec : Spam, Annonce trompeuse, Arnaque / fraude, Contenu inapproprié, Autre. NOTE : le trigger affiche la clé interne `spam` au lieu du label "Spam" quand fermé
> Statut : ✅

---

## 7. Protection des routes

### TC-VA-12 — Accès refusé aux zones privées

| Route | Comportement attendu | Comportement observé | Statut |
|-------|---------------------|----------------------|--------|
| `/app` | Redirection vers `/auth/login` | Redirige vers `/auth/login` | ✅ |
| `/app/properties` | Redirection vers `/auth/login` | Redirige vers `/auth/login?redirect=%2Fapp%2Fproperties` | ✅ |
| `/app/leases` | Redirection vers `/auth/login` | Redirige vers `/auth/login?redirect=%2Fapp%2Fleases` | ✅ |
| `/app/messages` | Redirection vers `/auth/login` | Redirige vers `/auth/login?redirect=%2Fapp%2Fmessages` | ✅ |
| `/admin` | Redirection vers `/auth/login` | Redirige vers `/auth/login?redirect=%2Fadmin` | ✅ |
| `/admin/team` | Redirection vers `/auth/login` | Redirige vers `/auth/login?redirect=%2Fadmin%2Fteam` | ✅ |

---

## 8. Récapitulatif des bugs trouvés

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 | P1 | TC-VA-02 Q1 | `/` | Barre de recherche accueil envoie `city=` au lieu de `search=` — recherche textuelle non fonctionnelle | Ouvert |
| 2 | P1 | TC-VA-02 Q3 | `/` | "appartement Dakar" retourne 0 résultats (valeur entière traitée comme ville) | Ouvert |
| 3 | P1 | TC-VA-08 Q5 | `/properties/[slug]` | "Demander une visite" ouvre le formulaire sans authentification — visiteur anonyme peut soumettre | Ouvert |
| 4 | P1 | TC-VA-11 Q2 | `/properties/[slug]` | "Signaler cette annonce" accessible sans connexion — formulaire ouvert directement | Ouvert |
| 5 | P2 | TC-VA-04 Q5 | `/properties` | Dropdown tri affiche les clés internes (`relevance`, `price_asc`, `created_desc`) quand fermé | Ouvert |
| 6 | P2 | TC-VA-08 Q2 | `/properties/[slug]` | "Envoyer un message" affiche une modale au lieu de rediriger vers `/auth/login` | Ouvert |
| 7 | P2 | TC-VA-08 Q3 | `/properties/[slug]` | Bouton "Réserver" libellé "Faire une offre" — incohérence avec la spec | Ouvert |
| 8 | P2 | TC-VA-06 Q2 | `/properties` | Filtre "Disponibilité" absent du panneau de filtres | Ouvert |
| 9 | P2 | TC-VA-06 Q3 | `/properties` | Filtre "Étage" absent du panneau de filtres | Ouvert |
| 10 | P3 | TC-VA-01 Q7 | `/` | Footer sans icônes réseaux sociaux (WhatsApp, Facebook, Twitter/X) | Ouvert |
| 11 | P3 | TC-VA-01 Q6 | `/` | Certains biens apparaissent dans "En vedette" ET "Derniers ajouts" simultanément | Ouvert |
| 12 | Info | TC-VA-07 Q2 | `/properties/[slug]` | Aucune photo dans les données de dev ("Photo à venir" / "Aucune photo disponible") | Data dev |

---

## 9. Notes du testeur

> Tests réalisés via MCP Chrome DevTools sur environnement local (frontend :3000, backend :8002).
> Les données de dev ne contiennent pas de photos ni d'avis — les TC correspondants ne peuvent être pleinement évalués.
> Le paramètre `sort=-created_at` (Spatie Laravel format) renvoie une erreur API — le frontend utilise `created_desc` comme valeur correcte.
> La protection des routes `/app/*` et `/admin/*` fonctionne parfaitement avec redirection + param `redirect=` pour retour post-login.
