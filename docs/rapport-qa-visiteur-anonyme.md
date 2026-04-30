# Rapport QA — Visiteur Anonyme
**Date :** 30 avril 2026  
**Testeur :** Antigravity (Browser Subagent)  
**Environnement :** localhost:3000 (frontend) · localhost:8002 (backend)  
**Profil :** Visiteur non connecté  

---

## Résumé exécutif

| Catégorie | Statut |
|-----------|--------|
| Page d'accueil | ✅ Fonctionnelle avec remarques |
| Recherche et filtres | ✅ Fonctionnelle, pagination et tri OK |
| Vue carte (Map) | ✅ Leaflet charge correctement |
| Fiche bien | ⚠️ Fonctionnelle avec bugs visuels |
| Page de connexion | ✅ Fonctionnelle, 1 bug i18n |
| Page d'inscription | ✅ Fonctionnelle et complète |
| Mot de passe oublié | ✅ Fonctionnel |
| Protection des routes | ✅ Redirection correcte |
| Internationalisation | ⚠️ Quelques chaînes en anglais |
| Données seed | ⚠️ Propriétés test visibles en production |

**Bugs critiques (P0) :** 0  
**Bugs importants (P1) :** 2  
**Bugs modérés (P2) :** 4  
**Bugs mineurs (P3) :** 2  
**Améliorations proposées :** 12  

---

## 1. Page d'accueil (`/`)

| Élément | Statut | Note |
|---------|--------|------|
| Logo "Takussan" | ✅ | Affiché en haut à gauche |
| Navbar : Recherche, Acheter/Louer, catégories | ✅ | Fonctionne bien |
| Catégories rapides (Appartement, Villa, Terrain, Commerce, Maison, Bureau, Plus) | ✅ | Navigation rapide fonctionnelle |
| Sélecteur de langue (EN) | ✅ | Présent dans la navbar |
| Bouton "Connexion" | ✅ | Redirige vers /auth/login |
| Bouton "Publier" | ✅ | Redirige vers l'auth si non connecté |
| Section "Biens en vedette" | ✅ | Cartes affichées avec prix, localisation, type |
| Section "Derniers ajouts" | ✅ | **CORRIGÉ** — Affiche maintenant des biens différents des vedettes |
| Footer (newsletter, liens, réseaux sociaux) | ✅ | **CORRIGÉ** — Liens fonctionnels |
| Barre de recherche | ✅ | Texte préservé dans l'URL après soumission |
| Performance LCP | ⚠️ | Avertissement console image LCP sans `loading="eager"` |

### Bugs identifiés sur l'accueil

| # | Sévérité | Description |
|---|----------|-------------|
| V-01 | P2 | **3 propriétés "Propriété Premium Featured"** avec prix affiché **999 999 999 F CFA** — prix irréaliste, vraisemblablement un placeholder seed mal configuré |
| V-02 | P2 | **Images placeholder "Photo à veni..."** (texte tronqué) sur de nombreuses cartes — les propriétés seed n'ont pas de photos réelles |
| V-03 | P3 | Certaines propriétés affichent des noms comme "Property Test Filter - ViMTMsrO" — données de test visibles en prod |

---

## 2. Page de recherche (`/properties`)

| Élément | Statut | Note |
|---------|--------|------|
| Compteur de résultats | ✅ | "303 biens trouvés" |
| Filtres : Type de transaction (Vente, Location) | ✅ | Fonctionne correctement |
| Filtres : Type de bien (14 catégories) | ✅ | Appartement, Villa, Studio, Terrain, Bureau, Commerce, Entrepôt, Chambre, Hôtel, Complexe, Garage, Parking, Ferme, Usine, Autre |
| Filtres : Localisation (Ville, Quartier) | ✅ | |
| Filtres : Budget (min/max) | ✅ | |
| Filtres : Chambres, SDB, Surface | ✅ | Filtre "2 ch." réduit à 126 résultats |
| Tags de filtres actifs (avec ×) | ✅ | Ex: "2 ch. ×" avec compteur de filtres |
| Bouton "Tout effacer" | ✅ | |
| Pagination | ✅ | Fonctionne sur plusieurs pages |
| Vue Liste | ✅ | Affichage correct des cartes |
| Vue Carte | ✅ | **CORRIGÉ** — Carte Leaflet charge correctement avec marqueurs |
| Tri | ⚠️ | Fonctionne mais labels internes visibles |
| "Sauvegarder la recherche" | ⚠️ | Présent mais comportement non vérifié pour visiteur anonyme |

### Bugs identifiés sur la recherche

| # | Sévérité | Description |
|---|----------|-------------|
| V-04 | P2 | **Dropdown de tri** affiche les valeurs internes (`price_asc`, `relevance`) au lieu de labels traduits ("Prix croissant", "Pertinence") |
| V-05 | P3 | Propriétés de test visibles ("Property Test Filter - xUWpGDVy", "Property Test Filter - YlP66BEN") — données à nettoyer |

---

## 3. Fiche bien (`/properties/[slug]`)

| Élément | Statut | Note |
|---------|--------|------|
| Breadcrumb | ✅ | Navigation correcte (Accueil > Louer > Ville > Quartier) |
| Galerie photos | ⚠️ | Fonctionne mais beaucoup de placeholder "Photo à venir" |
| Prix / mois | ✅ | "1 150 000 F CFA / mois" affiché correctement |
| Titre et adresse | ✅ | |
| Caractéristiques (chambres, SDB, surface, année) | ✅ | |
| Description | ✅ | Texte Lorem Ipsum (données seed) |
| Tableau caractéristiques | ✅ | Type, contrat, statut, année |
| Sidebar : Réserver / Demander une visite / Message | ✅ | Boutons affichés |
| Agent contact (Message, Appeler, WhatsApp) | ✅ | Agent "Pape Cissé - Dakar Immo ✓" affiché avec badge vérifié |
| Signaler cette annonce | ✅ | Lien présent et cliquable |
| Barre d'action sticky (mobile) | ✅ | "Visiter" et "Réserver" en barre fixe bas |

### Bugs identifiés sur la fiche bien

| # | Sévérité | Description |
|---|----------|-------------|
| V-06 | P1 | **"Réserver" accessible aux visiteurs anonymes** — le bouton est cliquable sans vérifier l'authentification. Devrait rediriger vers login ou afficher un message demandant de se connecter |
| V-07 | P2 | Description en Lorem Ipsum — données seed non réalistes pour la démo |

---

## 4. Pages d'authentification

### 4.1 Page de connexion (`/auth/login`)

| Élément | Statut | Note |
|---------|--------|------|
| Design split-screen (image + formulaire) | ✅ | Design premium, photo de villa moderne |
| Titre "Content de vous revoir" | ✅ | En français |
| Sous-titre explicatif | ✅ | "Connectez-vous pour accéder à votre espace Takussan." |
| OAuth : Google | ✅ | "Continuer avec Google" |
| OAuth : Apple | ✅ | "Continuer avec Apple" |
| OAuth : Facebook | ✅ | "Continuer avec Facebook" |
| Séparateur "OU CONTINUER AVEC EMAIL" | ✅ | |
| Champ "Adresse email *" | ✅ | |
| Champ "Mot de passe *" | ✅ | |
| Toggle afficher/masquer mot de passe (👁) | ✅ | |
| Lien "Mot de passe oublié ?" | ✅ | Redirige vers /auth/forgot-password |
| Bouton "Se connecter" | ✅ | |
| Lien "Pas encore de compte ? S'inscrire" | ✅ | |
| Validation champs vides | ✅ | Messages d'erreur en français |
| Validation email invalide | ✅ | Message en français |

### Bug identifié

| # | Sévérité | Description |
|---|----------|-------------|
| V-08 | P1 | **Message d'erreur "Invalid credentials."** en anglais après tentative de connexion avec de mauvais identifiants. Devrait être "Identifiants invalides." ou "Email ou mot de passe incorrect." |

### 4.2 Page d'inscription (`/auth/register`)

| Élément | Statut | Note |
|---------|--------|------|
| Design split-screen | ✅ | Cohérent avec la page de login |
| OAuth : Google, Apple, Facebook | ✅ | |
| Champ "Prénom *" | ✅ | |
| Champ "Nom *" | ✅ | |
| Champ "Adresse email *" | ✅ | Placeholder "vous@exemple.com" |
| Champ "Mot de passe *" | ✅ | Placeholder "Au moins 8 caractères" |
| Champ "Confirmer le mot de passe *" | ✅ | |
| Toggle mot de passe | ✅ | |
| CGU | ✅ | "J'accepte les conditions générales et la politique de confidentialité" avec liens cliquables |
| Bouton "Créer mon compte" | ✅ | |
| Lien "Déjà un compte ? Se connecter" | ✅ | |
| Validation champs vides | ✅ | Messages en français |
| Validation CGU non cochées | ✅ | |

### 4.3 Mot de passe oublié (`/auth/forgot-password`)

| Élément | Statut | Note |
|---------|--------|------|
| Titre "Mot de passe oublié" | ✅ | |
| Texte explicatif | ✅ | "Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe." |
| Champ "Adresse email" | ✅ | |
| Bouton "Envoyer le lien" | ✅ | |
| Lien "← Retour à la connexion" | ✅ | |
| Message de confirmation après soumission | ✅ | "Vérifiez votre boîte mail..." en français |

---

## 5. Protection des routes

| Route protégée | Comportement | Statut |
|----------------|-------------|--------|
| `/app` (Dashboard) | Redirection vers `/auth/login` | ✅ |
| `/app/properties` | Redirection vers `/auth/login` | ✅ |
| `/admin` | Redirection vers `/auth/login` | ✅ |

---

## 6. Récapitulatif des bugs

### P1 — Importants (dégradent l'expérience)

| # | Page | Description |
|---|------|-------------|
| V-06 | Fiche bien | Bouton "Réserver" accessible aux visiteurs anonymes sans redirection vers login |
| V-08 | Login | Message d'erreur "Invalid credentials." en anglais |

### P2 — Modérés

| # | Page | Description |
|---|------|-------------|
| V-01 | Accueil | 3 "Propriété Premium Featured" avec prix 999 999 999 F CFA |
| V-02 | Partout | Images placeholder "Photo à veni..." tronquées |
| V-04 | Recherche | Dropdown de tri affiche les valeurs internes (price_asc) au lieu de labels traduits |
| V-07 | Fiche bien | Description Lorem Ipsum (données seed) |

### P3 — Mineurs / Cosmétiques

| # | Page | Description |
|---|------|-------------|
| V-03 | Accueil/Recherche | Propriétés "Property Test Filter" visibles |
| V-05 | Recherche | Propriétés de test avec noms aléatoires visibles |

---

## 7. Améliorations proposées

| # | Page | Proposition | Impact |
|---|------|------------|--------|
| A-01 | Inscription | Ajouter un indicateur de force du mot de passe (barre colorée) | UX |
| A-02 | Recherche | Traduire les labels du dropdown de tri en français (pertinence, prix ↑, prix ↓, etc.) | i18n |
| A-03 | Fiche bien | Vérifier l'authentification avant de permettre "Réserver" ou "Demander une visite" | Sécurité |
| A-04 | Accueil | Ajouter `loading="eager"` à l'image hero/LCP pour améliorer les performances | Performance |
| A-05 | Recherche | Ajouter un bouton "Réinitialiser les filtres" plus visible | UX |
| A-06 | Fiche bien | Ajouter une section "Biens similaires" en bas de page (recommandation) | Engagement |
| A-07 | Accueil | Mettre en avant les catégories de biens avec des compteurs (ex: "342 Appartements") | UX |
| A-08 | Global | Ajouter un bouton "Retour en haut" flottant sur les longues pages | UX |
| A-09 | Recherche | Afficher un état vide illustré quand aucun résultat ne correspond aux filtres | UX |
| A-10 | Inscription | Ajouter un champ téléphone optionnel à l'inscription | Completeness |
| A-11 | Accueil | Afficher les vrais avis clients en section témoignage | Social Proof |
| A-12 | Seed Data | Supprimer/masquer les propriétés de test ("Property Test Filter") en environnement de démo | Data Quality |

---

## 8. Comparaison avec le rapport QA-1

### Bugs corrigés depuis le dernier rapport
- ✅ **B-14** : "Derniers ajouts" affiche maintenant des biens différents des "En vedette"
- ✅ **B-15** : Les liens du footer ne pointent plus vers `#`
- ✅ **B-23** : La barre de recherche préserve le texte saisi après soumission

### Bugs toujours présents
- ⚠️ **B-20** : Warning performance LCP (`loading="eager"` manquant)
- ⚠️ Données seed incohérentes (propriétés Premium Featured avec prix 999M)

### Nouveaux bugs identifiés
- 🆕 **V-06** : Bouton "Réserver" accessible aux visiteurs anonymes
- 🆕 **V-08** : Message d'erreur login en anglais
- 🆕 **V-04** : Labels de tri non traduits
