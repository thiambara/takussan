# QA — Visiteur anonyme 👤

**Acteur :** Visiteur non connecté (aucun compte requis)
**Précondition globale :** Ouvrir une fenêtre **incognito / privée** pour éviter toute session résiduelle.
**Environnement :** `http://localhost:3000` (frontend) · `http://localhost:8002` (backend)
**Testeur :**
**Date :**
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

## Ordre de test optimisé

> Suivre l'ordre ci-dessous pour minimiser les allers-retours entre pages.

1. **Page d'accueil** (`/`) — header, hero, sections, footer
2. **Liste des biens** (`/properties`) — recherche, filtres, tri, pagination
3. **Filtres avancés** sur la même page
4. **Fiche bien publique** (`/properties/[slug]`) — galerie, infos, contact, partage, avis
5. **Comparateur** (`/compare`) — depuis la liste
6. **Favoris anonymes** (`/favorites`) — depuis la fiche bien
7. **Protection des routes privées** — vérification d'accès refusé
8. **i18n & footer** — changement de langue, liens légaux

---

## 1. Page d'accueil (`/`)

### TC-VA-01 — Chargement initial

**Étape 1 :** Naviguer vers `http://localhost:3000/` en navigation privée.

**Q1 :** La page se charge en moins de 3 secondes sans erreur bloquante dans la console (F12 → Console) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le logo "Takussan" est visible en haut à gauche, cliquable, et renvoie sur `/` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La barre de navigation affiche le sélecteur "Acheter / Louer", la barre de recherche (champ ville/quartier) et le bouton "Rechercher" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La barre de catégories sous le hero affiche au moins : Appartement, Villa, Terrain, Commerce, Maison, Bureau, et un menu "Plus" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Les boutons "Connexion" et "Publier" (CTA bleu) sont visibles en haut à droite ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Le sélecteur de langue (FR / EN / WO) est présent dans la barre supérieure ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-02 — Sections de découverte

**Q1 :** La section "Biens en vedette" affiche au moins 4 cartes avec photo, prix en F CFA, ville, type de bien et nombre de chambres ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La section "Derniers ajouts" affiche des biens distincts de "En vedette" (pas de doublons visibles) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Survoler une carte de bien fait apparaître un effet visuel (ombre, agrandissement, ou bouton "Voir") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Cliquer sur une carte ouvre la fiche détaillée du bien sur `/properties/[slug]` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-03 — Footer

**Étape 1 :** Faire défiler la page jusqu'en bas.

**Q1 :** Le footer contient les colonnes : à propos / liens utiles / contact / réseaux sociaux ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les icônes des réseaux sociaux (WhatsApp, Facebook, Twitter/X, Instagram) sont présentes et cliquables ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le formulaire de newsletter est présent et accepte une saisie d'email ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Soumettre la newsletter avec un email valide renvoie un message de confirmation ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Soumettre la newsletter avec un email vide ou invalide affiche une erreur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-04 — CTAs Connexion / Publier (route protégée)

**Étape 1 :** Cliquer sur "Connexion" en haut à droite.

**Q1 :** La redirection mène vers `/auth/login` avec le formulaire de connexion ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Revenir à `/` (logo Takussan) puis cliquer sur "Publier".

**Q2 :** L'utilisateur anonyme est redirigé vers `/auth/login?redirect=...` (page de connexion avec retour prévu) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 2. Recherche depuis la page d'accueil

### TC-VA-05 — Recherche plein-texte (depuis le hero)

**Étape 1 :** Sur `/`, cliquer dans la barre de recherche (champ ville/quartier).

**Q1 :** Une auto-complétion affiche des suggestions dès la saisie de 2-3 caractères (ex: "Da" → Dakar, Dakar Plateau…) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Saisir `Dakar` puis cliquer sur "Rechercher".

**Q2 :** L'URL résultante est `/properties?city=Dakar` (ou équivalent) avec des résultats correspondants ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Revenir à `/`, sélectionner "Louer" dans le sélecteur, saisir `Yoff` puis rechercher.

**Q3 :** Les résultats sont filtrés à la fois par ville **et** par type de transaction (location uniquement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Revenir à `/`, saisir une chaîne libre comme `appartement avec piscine`.

**Q4 :** La recherche envoie cette saisie comme paramètre de recherche textuelle (`search=` ou équivalent) et renvoie des résultats pertinents ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 3. Liste des biens (`/properties`)

> ⚠️ Tous les TC suivants se font sur `/properties`. Garder l'onglet ouvert pour éviter les rechargements.

### TC-VA-06 — Affichage de la liste

**Étape 1 :** Naviguer directement vers `http://localhost:3000/properties` (sans filtre).

**Q1 :** Le compteur de résultats ("X biens trouvés" ou similaire) est affiché en haut de la liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Chaque carte affiche : photo (ou placeholder), titre, prix F CFA, ville, type, surface en m², chambres/SDB ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un panneau de filtres latéral (gauche) ou en haut est visible avec les sections : Transaction, Type, Ville, Budget, Chambres, Surface ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un dropdown de tri (Pertinence, Prix ↑, Prix ↓, Récents) est visible en haut à droite des résultats ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-07 — Filtres de base

**Étape 1 :** Cliquer sur le filtre "Vente" (ou case "Acheter" dans le filtre Transaction).

**Q1 :** Les résultats sont mis à jour, l'URL contient `transaction=sale` (ou équivalent), le compteur diminue ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cocher "Appartement" dans le filtre "Type de bien".

**Q2 :** Les résultats sont à nouveau filtrés (uniquement appartements en vente) et l'URL est mise à jour ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir `Dakar` dans le filtre "Ville".

**Q3 :** Les résultats sont filtrés par ville et le compteur reflète le changement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Saisir un budget min de `50000` et un budget max de `200000000` (en F CFA).

**Q4 :** Les résultats hors plage (< 50 000 ou > 200 000 000) disparaissent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Sélectionner "2+" dans le filtre "Chambres".

**Q5 :** Les résultats à 0 ou 1 chambre disparaissent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 6 :** Saisir une surface min de `50` m².

**Q6 :** Les biens < 50 m² disparaissent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 7 :** Vérifier en haut des résultats que des chips/tags de filtres actifs sont affichés (avec un × pour les retirer un par un).

**Q7 :** Les chips reflètent fidèlement chaque filtre actif (Vente, Appartement, Dakar, 50k–200M, 2+ ch., 50+ m²) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 8 :** Cliquer sur le × du chip "Dakar".

**Q8 :** Le filtre Ville est retiré, l'URL est mise à jour, les résultats incluent à nouveau les autres villes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 9 :** Cliquer sur le bouton "Tout effacer" / "Réinitialiser les filtres".

**Q9 :** Tous les filtres sont vidés, l'URL revient à `/properties` simple, le compteur affiche le total initial ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-08 — Tri des résultats

**Étape 1 :** Ouvrir le dropdown de tri en haut à droite.

**Q1 :** Les options affichent des libellés français (Pertinence, Prix croissant, Prix décroissant, Plus récent) — pas des clés techniques (`price_asc`, `created_desc`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sélectionner "Prix croissant".

**Q2 :** Les premiers résultats affichent les prix les plus bas, en ordre croissant strict ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le dropdown affiche ensuite "Prix croissant" (libellé français) — pas la clé interne `price_asc` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sélectionner "Prix décroissant".

**Q4 :** Les premiers résultats affichent les prix les plus élevés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Sélectionner "Plus récent".

**Q5 :** Les biens créés/publiés le plus récemment apparaissent en premier (date "il y a X jours" visible) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Saisir un mot-clé dans la barre de recherche en haut, puis sélectionner "Pertinence".

**Q6 :** Les résultats les plus pertinents pour le mot-clé apparaissent en premier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-09 — Pagination

**Étape 1 :** Réinitialiser les filtres pour avoir le maximum de résultats. Faire défiler en bas de la liste.

**Q1 :** Une pagination (1, 2, 3 … N) est présente et indique correctement le nombre total de pages ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur la page 2.

**Q2 :** Les résultats changent (nouveaux biens), l'URL contient `page=2`, le scroll remonte en haut de la liste ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Appliquer un filtre (ex: Vente), puis cliquer sur la page 2.

**Q3 :** Les filtres sont conservés sur la page 2 (URL contient `transaction=sale&page=2`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Cliquer sur le bouton "Précédent" / "Suivant" pour vérifier la navigation.

**Q4 :** Les boutons précédent/suivant sont désactivés sur la première / dernière page ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-10 — Filtres avancés (P1)

**Étape 1 :** Sur `/properties`, ouvrir le panneau de filtres avancés (peut nécessiter un bouton "Plus de filtres").

**Q1 :** Un filtre "Amenités / Équipements" (piscine, parking, gardiennage…) est disponible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un filtre "Disponibilité" (date à partir de laquelle le bien est disponible) est présent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un filtre "Étage" (pour les appartements) est présent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Un toggle ou filtre "Meublé / Non meublé" est présent ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Activer un de ces filtres avancés et vérifier que les résultats sont mis à jour.

**Q5 :** L'application des filtres avancés se reflète dans l'URL et le compteur diminue cohéremment ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-11 — Recherche par carte (P1)

**Étape 1 :** Repérer un toggle "Vue carte" / icône carte sur `/properties`.

**Q1 :** Le toggle "Vue carte" est présent et bascule l'affichage sur une carte interactive ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les biens sont représentés par des marqueurs avec leur prix sur la carte ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Cliquer sur un marqueur ouvre une mini-fiche du bien (prix, photo, lien) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Déplacer/zoomer sur la carte met à jour la liste et les marqueurs visibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 4. Fiche bien publique (`/properties/[slug]`)

### TC-VA-12 — Ouverture de la fiche

**Étape 1 :** Depuis `/properties`, cliquer sur la première carte de bien.

**Q1 :** L'URL devient `/properties/[slug-du-bien]` (slug lisible) et la page se charge sans erreur ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Un breadcrumb (fil d'Ariane) est affiché : Accueil > Acheter|Louer > Ville > Quartier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-13 — Galerie photos

**Q1 :** La galerie principale affiche la photo de couverture du bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Des miniatures de photos secondaires sont visibles sous la photo principale ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Cliquer sur une miniature change la photo principale ou ouvre une lightbox ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La navigation précédent/suivant fonctionne (clavier ← →, ou flèches sur l'image) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Si le bien n'a aucune photo, un placeholder explicite est affiché ("Photo à venir" ou similaire) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-14 — Caractéristiques détaillées

**Q1 :** Le titre, le prix (F CFA, format "1 234 567"), l'adresse complète et le type de transaction sont en haut de la fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les caractéristiques principales sont listées : surface, chambres, SDB, étage (si applicable), année de construction ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** La description complète du bien est affichée en pleine largeur (paragraphes lisibles) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les amenités/équipements (piscine, parking, climatisation…) sont affichés sous forme de liste avec icônes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Une carte (Leaflet/Google Maps) montre la localisation du bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** L'agent ou l'agence responsable du bien est identifié·e dans une carte/panneau dédié (nom, photo, agence) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q7 :** Une référence unique du bien (ex: TK-2025-001) est visible quelque part sur la fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-15 — Compteur de vues

**Étape 1 :** Noter le nombre de vues affiché (s'il existe). Recharger la page (F5).

**Q1 :** Un compteur "X vues" est visible sur la fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Le compteur s'incrémente (au plus tard après plusieurs rechargements) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-16 — Formulaire de contact

**Étape 1 :** Repérer le bouton "Contacter l'agent" / "Envoyer un message" dans le panneau latéral.

**Q1 :** Le bouton est visible et cliquable ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur le bouton de contact.

**Q2 :** Pour un visiteur anonyme, un formulaire public s'affiche avec les champs : Nom, Email, Téléphone, Message ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le bouton "Envoyer" est désactivé tant que les champs requis ne sont pas remplis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Saisir nom = `Test Visiteur`, email invalide `pasunemail`, message = `Bonjour`, puis tenter d'envoyer.

**Q4 :** Une erreur de validation sur l'email s'affiche ("Adresse e-mail invalide" ou similaire) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Corriger l'email en `visiteur@test.fr`, soumettre.

**Q5 :** Un toast/banner de succès s'affiche ("Message envoyé") et le formulaire se ferme ou se vide ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-17 — Demande de réservation (route protégée)

**Étape 1 :** Sur la fiche bien, repérer le bouton "Réserver" / "Faire une offre".

**Q1 :** Le bouton est visible avec un libellé clair (cohérent avec la spec : "Réserver" pour location, "Faire une offre" pour vente) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur "Réserver".

**Q2 :** Une modale "Connexion requise" s'affiche **OU** redirection vers `/auth/login?redirect=...` ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un visiteur anonyme ne peut **pas** soumettre une demande de réservation sans s'authentifier ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-18 — Demande de visite (route protégée)

**Étape 1 :** Sur la fiche bien, repérer le bouton "Demander une visite" / "Planifier une visite".

**Q1 :** Le bouton est visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur "Demander une visite".

**Q2 :** Une modale demande de se connecter **OU** redirige vers `/auth/login` (le formulaire de visite ne doit PAS s'ouvrir directement pour un visiteur anonyme) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-19 — Partage du bien

**Étape 1 :** Sur la fiche bien, repérer le bouton "Partager" en haut.

**Q1 :** Le bouton est visible et ouvre une modale au clic ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La modale affiche une URL canonique du bien (`/properties/[slug]`) avec un bouton "Copier" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur "Copier".

**Q3 :** Un feedback visuel ("Lien copié !") s'affiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Coller l'URL dans un nouvel onglet ouvre la même fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Des boutons de partage WhatsApp, Facebook, X/Twitter, Email sont présents et fonctionnels ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-20 — Avis publics (P2)

**Étape 1 :** Faire défiler la fiche bien jusqu'à la section "Avis".

**Q1 :** La section "Avis" est visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Si des avis existent : auteur, note (étoiles), date, texte sont affichés ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Si aucun avis n'existe, un message clair "Aucun avis pour l'instant" s'affiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Les éventuelles réponses publiques de l'agent / propriétaire sont visibles sous l'avis ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-21 — Signaler un avis ou une annonce (P2)

**Étape 1 :** Sur la fiche bien, repérer le lien "Signaler cette annonce".

**Q1 :** Le lien est visible (souvent en bas de la fiche) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur "Signaler cette annonce".

**Q2 :** Pour un visiteur anonyme, soit une modale "Connexion requise" s'affiche, soit un formulaire public minimal (motif + email) s'ouvre ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Le menu "Motif" propose : Spam, Annonce trompeuse, Arnaque/fraude, Contenu inapproprié, Autre — avec libellés français (pas les clés techniques) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Si un avis est présent dans la section avis, repérer un bouton "Signaler cet avis" sur l'avis lui-même.

**Q4 :** Un signalement par avis individuel est-il disponible (sinon : géré globalement par signalement d'annonce) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

### TC-VA-22 — Biens similaires (P2)

**Étape 1 :** Faire défiler tout en bas de la fiche bien.

**Q1 :** Une section "Biens similaires" affiche 3 à 6 biens dans la même ville ou du même type ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Cliquer sur un bien similaire mène à sa fiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 5. Comparateur de biens (`/compare`) (P2)

### TC-VA-23 — Sélection de biens à comparer

**Étape 1 :** Retourner sur `/properties`. Repérer un bouton "Comparer" ou une case à cocher sur les cartes.

**Q1 :** Une case à cocher / bouton "Comparer" est présente sur chaque carte de bien ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cocher 2 biens.

**Q2 :** Une barre flottante apparaît en bas de l'écran indiquant "X biens sélectionnés" avec un bouton "Comparer" ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cocher un 3e, puis un 4e bien.

**Q3 :** La sélection est plafonnée (max 4 biens) avec un toast d'avertissement si dépassement ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Cliquer sur "Comparer" dans la barre flottante.

**Q4 :** L'URL devient `/compare?ids=...` et un tableau comparatif (prix, surface, chambres, type, ville, équipements) s'affiche en colonnes ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Chaque colonne du comparateur a un bouton "✕" pour retirer le bien et un lien vers la fiche complète ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 6. Favoris anonymes (`/favorites`)

### TC-VA-24 — Ajouter un favori anonyme

**Étape 1 :** Retourner sur `/properties`. Repérer une icône "♥" (cœur) sur les cartes de bien.

**Q1 :** L'icône cœur est présente sur chaque carte et cliquable sans être connecté ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Cliquer sur le cœur d'un bien.

**Q2 :** Le cœur passe à l'état "rempli" (couleur active) et un toast "Ajouté aux favoris" apparaît ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Un compteur de favoris apparaît dans la navbar (icône cœur avec badge "1") ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Cliquer sur l'icône favoris dans la navbar.

**Q4 :** Un popover affiche les biens favoris stockés localement (Zustand store) avec photo + titre + prix ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Cliquer sur "Voir tous mes favoris" (ou équivalent).

**Q5 :** L'URL devient `/favorites` et la liste complète des favoris anonymes s'affiche ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q6 :** Recharger la page (F5) — les favoris sont-ils conservés (persistance localStorage) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 5 :** Cliquer à nouveau sur le cœur d'un favori pour le retirer.

**Q7 :** Le cœur redevient vide, le toast "Retiré des favoris" apparaît, le compteur diminue ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 7. Protection des routes privées

### TC-VA-25 — Tentatives d'accès direct aux zones protégées

**Étape 1 :** Pour chaque URL ci-dessous, saisir l'URL directement dans la barre d'adresse en navigation privée :

| Route | Comportement attendu | Comportement observé | Statut |
|-------|----------------------|----------------------|--------|
| `/app` | Redirection vers `/auth/login?redirect=%2Fapp` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/properties` | Redirection vers `/auth/login?redirect=...` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/leases` | Redirection vers `/auth/login?redirect=...` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/messages` | Redirection vers `/auth/login?redirect=...` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/payments` | Redirection vers `/auth/login?redirect=...` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/app/profile` | Redirection vers `/auth/login?redirect=...` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin` | Redirection vers `/auth/login?redirect=%2Fadmin` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/team` | Redirection vers `/auth/login` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/users` | Redirection vers `/auth/login` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/admin/finances` | Redirection vers `/auth/login` | _______ | ✅ ❌ ⚠️ 🔲 |
| `/super-admin` | Redirection vers `/auth/login` | _______ | ✅ ❌ ⚠️ 🔲 |

**Q1 :** Aucune des routes ci-dessus ne laisse fuiter du contenu privé (pas de flash de page protégée avant redirection) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Après login, l'utilisateur est correctement redirigé vers la route initialement demandée (paramètre `redirect=`) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 8. i18n & langues

### TC-VA-26 — Changement de langue

**Étape 1 :** Sur `/`, cliquer sur le sélecteur de langue.

**Q1 :** Les options FR / EN / WO sont disponibles ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Sélectionner "EN".

**Q2 :** Les libellés de navigation, hero, sections, footer passent en anglais ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Naviguer vers `/properties` — les filtres et les libellés sont aussi en anglais ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** La langue choisie est conservée après rechargement (cookie/localStorage) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 3 :** Sélectionner "WO" (Wolof).

**Q5 :** Les chaînes traduites en wolof apparaissent (au moins partiellement) sans casser la mise en page ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 4 :** Revenir en FR pour la suite des tests.

---

## 9. Pages annexes (mentions légales)

### TC-VA-27 — Liens du footer

**Étape 1 :** Cliquer sur chacun des liens du footer (Mentions légales, CGU, Politique de confidentialité, Cookies, Contact, À propos…).

| Lien | URL attendue | Page chargée | Statut |
|------|--------------|--------------|--------|
| Mentions légales | `/mentions-legales` | _______ | ✅ ❌ ⚠️ 🔲 |
| CGU | `/cgu` | _______ | ✅ ❌ ⚠️ 🔲 |
| Politique de confidentialité | `/confidentialite` | _______ | ✅ ❌ ⚠️ 🔲 |
| Cookies | `/cookies` | _______ | ✅ ❌ ⚠️ 🔲 |
| À propos | `/a-propos` | _______ | ✅ ❌ ⚠️ 🔲 |
| Contact | `/contact` | _______ | ✅ ❌ ⚠️ 🔲 |
| Recherche | `/properties` | _______ | ✅ ❌ ⚠️ 🔲 |

**Q1 :** Tous les liens du footer mènent à des pages existantes (pas de 404) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Les pages légales contiennent du contenu (pas de placeholder vide) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 10. Performance & accessibilité (rapide)

### TC-VA-28 — Audit léger Lighthouse

**Étape 1 :** Sur `/`, ouvrir DevTools → Lighthouse → analyser en mode mobile.

**Q1 :** Score Performance ≥ 70 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** Score Accessibilité ≥ 85 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Score SEO ≥ 90 ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Pas d'erreur "Cumulative Layout Shift" majeure ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Étape 2 :** Naviguer au clavier uniquement (Tab / Shift+Tab / Entrée) sur la page d'accueil.

**Q5 :** Tous les éléments interactifs (liens, boutons, inputs) sont atteignables au clavier avec un focus visible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 11. Responsive (mobile)

### TC-VA-29 — Affichage mobile

**Étape 1 :** Ouvrir DevTools → Mode mobile (iPhone 12 / Pixel 5). Recharger `/`.

**Q1 :** La navbar s'effondre en menu hamburger ; le hero reste lisible ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q2 :** La barre de recherche reste utilisable (champs empilés verticalement) ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q3 :** Sur `/properties`, le panneau de filtres devient un drawer / accordéon ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q4 :** Sur la fiche bien, la galerie photos est swipeable au touch ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

**Q5 :** Aucun overflow horizontal (pas de scrollbar en bas) sur aucune page testée ?
> Réponse : _______________________________________________
> Statut : ✅ ❌ ⚠️ 🔲

---

## 12. Récapitulatif — Bugs trouvés

> À remplir au fil des tests. Reporter les TC en ❌ ou ⚠️.

| # | Sévérité | TC | Page | Description | Statut |
|---|----------|----|------|-------------|--------|
| 1 |   |   |   |   |  |
| 2 |   |   |   |   |  |
| 3 |   |   |   |   |  |

**Sévérité :**
- **P0 — Bloquant** : empêche un parcours métier critique
- **P1 — Majeur** : dégrade fortement l'UX, contournement difficile
- **P2 — Mineur** : gêne notable mais contournable
- **P3 — Cosmétique** : libellé, couleur, espacement

---

## 13. Notes du testeur

> _Ajouter ici toute observation transversale, problème environnemental, état des données de seed, etc._

```
_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
```
