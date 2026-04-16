---
id: MVP-006
title: "Filtres quartier/budget/pièces"
status: todo
slice: "Weekend 4-5"
estimate: 1 weekend
created: 2026-04-16
depends_on: [MVP-005]
blocks: [MVP-007]
tags: [front, search, mvp]
---

## Objectif utilisateur

Un visiteur peut rapidement filtrer les annonces par quartier, budget et nombre de pièces pour trouver ce qui correspond à ses critères.

## Contrat de données

- API endpoint : `GET /api/public/properties/search` (public)
- Paramètres : `location`, `price_min`, `price_max`, `bedrooms`
- Response : annonces filtrées + facettes (count par critère)
- Performance : < 500ms réponse

## Contraintes strictes

- **Instantané** : filtres appliqués sans recharger la page
- **Mobile-friendly** : filtres accessibles sur mobile
- **URL partageable** : filtres dans l'URL
- **Zero auth** : accessible à tous

## Delta à produire

### Backend (Laravel)
- [ ] Controller `PublicPropertyController` méthode `search`
- [ ] Query builder avec filtres optimisés
- [ ] Index DB sur `price`, `bedrooms`, `location`
- [ ] Validation des paramètres de recherche
- [ ] Facettes : count par quartier, par type, par bedrooms

### API Response
```json
{
  "data": [...],
  "facets": {
    "locations": {"Almadies": 15, "Plateau": 8},
    "bedrooms": {"1": 12, "2": 18, "3": 8},
    "price_ranges": {"0-200k": 10, "200k-500k": 20}
  },
  "total": 38,
  "page": 1
}
```

### Frontend (Next.js)
- [ ] Composant `SearchFilters` (collapsible sur mobile)
- [ ] Hook `useSearch` (filters + pagination)
- [ ] URL sync : `/?location=almadies&price_max=500000`
- [ ] Loading states pendant recherche

### Design
- [ ] Filtres latéral (desktop) / bottom sheet (mobile)
- [ ] Range slider pour budget
- [ ] Chips pour sélection rapide
- [ ] "Effacer tous" prominent

## Critères d'acceptation

- [ ] Filtres s'appliquent instantanément (< 500ms)
- [ ] URL avec filtres est partageable
- [ ] Facettes affichent les counts corrects
- [ ] Mobile : filtres accessibles sans cacher le contenu

## KPI à tracker

- **Utilisation filtres** : objectif > 60% des visiteurs
- **Search success rate** : % recherches avec résultats > 0
- **Filter to contact rate** : conversion filtres → contact

## Données de référence

### Quartiers Dakar (top 20)
- Almadies, Mermoz, Sacré-Cœur, Plateau, Fann
- Ouakam, Yoff, Ngor, Point E, Liberté
- Grand Yoff, Biscuiterie, HLM, Grand Médine, Sicap
- Diamniadio, Pikine, Guédiawaye, Rufisque

### Budget ranges
- < 200.000 FCFA
- 200.000 - 500.000 FCFA
- 500.000 - 1.000.000 FCFA
- > 1.000.000 FCFA

### Bedrooms
- Studio (T1)
- 2 pièces (T2)
- 3 pièces (T3)
- 4+ pièces (T4+)

## Hors périmètre

- Carte interactive
- Recherche par mots-clés
- Filtres avancés (parking, ascenseur, etc.)
- Sauvegarde recherche
- Alertes email
