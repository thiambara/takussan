# API Query Builder — spatie/laravel-query-builder

Le backend utilise [spatie/laravel-query-builder](https://spatie.be/docs/laravel-query-builder) pour exposer des filtres, un tri, des inclusions et la sélection de champs depuis le frontend.

---

## Query params disponibles

### Filtres

```
GET /api/properties?filter[status]=available
GET /api/properties?filter[status]=available&filter[type]=apartment
GET /api/customers?filter[pipeline_stage]=lead
```

**Filtre textuel (recherche multi-champs) :**
```
GET /api/properties?filter[search]=villa mermoz
GET /api/customers?filter[search]=Amadou
GET /api/users?filter[search]=Fatou
```

**Filtres de range (min/max) :**
```
GET /api/properties?filter[price_min]=50000&filter[price_max]=200000
GET /api/properties?filter[area_min]=80
GET /api/leases?filter[monthly_rent_min]=100000
```

### Tri

```
GET /api/properties?sort=-price        # décroissant
GET /api/properties?sort=price         # croissant
GET /api/leases?sort=-monthly_rent
GET /api/customers?sort=last_name
```

### Inclusions (eager loading)

```
GET /api/properties?include=address,owner
GET /api/leases?include=property,tenant
GET /api/customers?include=addresses,tags
```

**Compter les relations :**
```
GET /api/properties?include=bookingsCount,leasesCount,reviewsCount
```

### Sparse fieldsets (sélection de champs)

Réduit les données retournées aux seules colonnes nécessaires. Le nom de la ressource correspond au nom de la table (pluriel snake_case).

```
GET /api/properties?fields[properties]=id,title,price,status
GET /api/customers?fields[customers]=id,first_name,last_name,email,status
GET /api/leases?fields[leases]=id,property_id,monthly_rent,status,start_date,end_date
```

### Pagination

```
GET /api/properties?per_page=50
GET /api/properties?per_page=10&page=2
```

---

## Filtres disponibles par ressource

### Property
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `draft`, `available`, `rented`, `sold`, ... |
| `filter[type]` | exact | `apartment`, `house`, `villa`, ... |
| `filter[contract_type]` | exact | `sale`, `rental`, ... |
| `filter[user_id]` | exact | ID du propriétaire |
| `filter[agency_id]` | exact | ID de l'agence |
| `filter[bedrooms]` | exact | Nombre de chambres |
| `filter[bathrooms]` | exact | Nombre de salles de bain |
| `filter[featured]` | exact | `1` ou `0` |
| `filter[currency]` | exact | `XOF`, `EUR`, `USD`, ... |
| `filter[price_min]` | range | Prix minimum |
| `filter[price_max]` | range | Prix maximum |
| `filter[area_min]` | range | Surface minimum (m²) |
| `filter[area_max]` | range | Surface maximum (m²) |
| `filter[search]` | search | Recherche dans title, reference_number, description |
| `sort` | `-price`, `price`, `-created_at`, `area`, `bedrooms`, `featured` | |

### Customer
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `inactive`, ... |
| `filter[pipeline_stage]` | exact | `lead`, `prospect`, `client`, ... |
| `filter[agency_id]` | exact | ID de l'agence |
| `filter[search]` | search | Recherche dans first_name, last_name, email, phone |
| `sort` | `-created_at`, `first_name`, `last_name`, `status` | |

### Lease
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `expired`, `terminated`, ... |
| `filter[type]` | exact | `rental`, `sale` |
| `filter[property_id]` | exact | |
| `filter[tenant_id]` | exact | |
| `filter[currency]` | exact | |
| `filter[monthly_rent_min]` | range | |
| `filter[monthly_rent_max]` | range | |
| `sort` | `-created_at`, `start_date`, `end_date`, `monthly_rent` | |

### Booking
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `pending`, `confirmed`, `cancelled`, ... |
| `filter[property_id]` | exact | |
| `filter[customer_id]` | exact | |
| `filter[total_amount_min]` | range | |
| `filter[total_amount_max]` | range | |
| `sort` | `-created_at`, `start_date`, `end_date` | |

### Agency
| Param | Type | Description |
|---|---|---|
| `filter[status]` | exact | `active`, `inactive` |
| `filter[is_verified]` | exact | `1` ou `0` |
| `filter[search]` | search | Recherche dans name, email, license_number |
| `sort` | `-created_at`, `name`, `founded_at` | |

### Invoice / Payout / MaintenanceRequest / Task / Document / Tag
Même pattern : `filter[status]`, `filter[search]` (selon le model), `sort`.

---

## Architecture interne

Tous les models héritent du trait `HasQueryBuilder` via `AbstractModel`. Chaque model déclare :

```php
protected static array $requestFilterable = [/* filtres exacts */];
protected static array $requestFilterablePartial = [/* filtres LIKE */];
protected static array $requestRangeFilters = [/* champs avec _min/_max */];
protected static array $requestSearchFields = [/* champs pour filter[search] */];
protected static array $requestSortable = [/* champs triables */];
protected static array $requestLoadable = [/* relations via include= */];
protected static array $requestCountable = [/* relations via include=XCount */];
protected static array $queryFields = [/* colonnes via fields[table]= */];
```

Dans les controllers, le pattern est :

```php
// 1. Base query avec contrôle d'accès (business logic)
$base = Property::query();
if (!$user->hasRole(['admin', 'super_admin'])) {
    $base->where('user_id', $user->id);
}

// 2. Spatie prend la main pour les filtres/tri/champs frontend
$paginator = Property::buildQuery($base, $request)
    ->defaultSort('-created_at')
    ->paginate();
```
