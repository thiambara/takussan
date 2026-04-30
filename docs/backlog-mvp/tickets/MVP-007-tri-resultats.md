---
id: MVP-007
title: "Tri résultats basique"
status: todo
slice: "Weekend 4-5"
estimate: 0.5 weekend
created: 2026-04-16
depends_on: [MVP-006]
blocks: []
tags: [front, search, mvp]
---

## Objectif utilisateur

Un visiteur peut trier les résultats de recherche par pertinence, prix ou date pour trouver plus facilement ce qu'il cherche.

## Contrat de données

- API endpoint : `GET /api/public/properties/search` (param `sort`)
- Options tri : `relevance`, `price_asc`, `price_desc`, `created_desc`
- Performance : < 300ms avec tri appliqué
- URL sync : tri persiste dans l'URL

## Contraintes strictes

- **Instantané** : tri sans recharger page
- **Intuitif** : options de tri claires et limitées
- **Persistant** : tri mémorisé pendant la session
- **Mobile** : select dropdown accessible

## Delta à produire

### Backend (Laravel)
- [ ] Améliorer `search` method avec paramètre `sort`
- [ ] Index DB composites pour tri performant
- [ ] Algorithme relevance : featured + photos + complétude
- [ ] Validation des options de tri

### Algorithme relevance
```php
// Score de pertinence (simple mais efficace)
$score = 0;
if ($property->featured) $score += 100;
if ($property->photos_count >= 5) $score += 50;
if ($property->description && strlen($property->description) > 100) $score += 25;
if ($property->price && $property->bedrooms) $score += 10;
```

### Frontend (Next.js)
- [ ] Composant `SortDropdown` (mobile/desktop)
- [ ] Hook `useSort` (sync URL + API)
- [ ] Loading state pendant tri
- [ ] Animation subtile lors du changement

### Design
- [ ] Dropdown compact avec icônes
- [ ] Options : "Pertinence ↑", "Prix ↓", "Prix ↑", "Plus récent"
- [ ] Indicateur visuel du tri actif
- [ ] Position : en haut des résultats (desktop) / filtre sheet (mobile)

## Critères d'acceptation

- [ ] Tri s'applique instantanément (< 300ms)
- [ ] Pertinence met en avant les annonces complètes
- [ ] Tri prix fonctionne correctement (ASC/DESC)
- [ ] URL contient le paramètre de tri

## KPI à tracker

- **Sort usage** : % utilisateurs qui utilisent le tri
- **Sort effectiveness** : temps avant clic après tri
- **Most popular sort** : option la plus utilisée

## Options de tri détaillées

1. **Pertinence** (défaut)
   - Featured en premier
   - +5 photos = boost
   - Description complète = boost
   - Prix et chambres renseignés = boost

2. **Prix croissant**
   - Du moins cher au plus cher
   - Ignore les annonces sans prix

3. **Prix décroissant**
   - Du plus cher au moins cher
   - Ignore les annonces sans prix

4. **Plus récent**
   - Date de création descendante
   - Les dernières annonces en premier

## Performance optimizations

- Index composite : `(price, created_at, featured)`
- Cache des relevances calculées (1h)
- Pagination préservée lors du tri

## Hors périmètre

- Tri personnalisé (distance, notes, etc.)
- Tri multi-critères
- Sauvegarde préférences tri
- Tri par disponibilité
