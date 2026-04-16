---
id: MVP-001
title: "Page liste des annonces (publique)"
status: todo
slice: "Weekend 1-2"
estimate: 1 weekend
created: 2026-04-16
depends_on: []
blocks: [MVP-002]
tags: [front, public, mvp]
---

## Objectif utilisateur

Un visiteur arrive sur Takussan et voit immédiatement les annonces disponibles sans aucune inscription.

## Contrat de données

- API endpoint : `GET /api/public/properties` (public, pas d'auth)
- Modèle simplifié : id, title, price, type, location, photo principale, featured
- Pagination : 20 annonces par page
- Tri : par défaut (featured + récentes)

## Contraintes strictes

- **Zéro authentification** requis
- **Performance** : < 1s load time
- **Mobile-first** : 90% traffic mobile à Dakar
- **Photos optimisées** : WebP, max 300px width

## Delta à produire

### Backend (Laravel)
- [ ] Migration `properties` (champs MVP seulement)
- [ ] Model `Property` (fillable, casts)
- [ ] Controller `PublicPropertyController` avec méthode `index`
- [ ] Route `Route::get('/api/public/properties', [PublicPropertyController::class, 'index'])`
- [ ] Seeder de 10-20 annonces test

### Frontend (Next.js)
- [ ] Page `/` (homepage avec liste)
- [ ] Composant `PropertyCard` (responsive)
- [ ] Composant `PropertyGrid` (grid responsive)
- [ ] Hook `useProperties` (fetch + pagination)
- [ ] Loading states et skeleton

### Design
- [ ] Layout minimaliste (header logo, footer simple)
- [ ] Carte annonce : photo + titre + prix + quartier + superficie
- [ ] Filtres rapides : Location / Budget / Type (visible mais non fonctionnel)

## Critères d'acceptation

- [ ] Page charge en < 1 seconde avec 20 annonces
- [ ] Navigation mobile fluide (scroll infini ou pagination)
- [ ] Photos s'affichent correctement sur tous les écrans
- [ ] Clic sur une annonce redirige vers la page détail (MVP-002)

## KPI à tracker

- **Pages vues/session** : objectif > 3
- **Temps sur page** : objectif > 30s
- **Taux de clic vers détail** : objectif > 20%

## Hors périmètre

- Authentification
- Recherche avancée
- Carte interactive
- Favoris
- Dashboard propriétaire
