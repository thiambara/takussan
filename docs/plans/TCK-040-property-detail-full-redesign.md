# Takussan — Fiche bien « version finale full » (Devin-ready)

Refonte complète de `/properties/[slug]` en layout Airbnb-like (Navbar/Footer publics, galerie mosaïque, sidebar sticky contact/réservation, carte Leaflet/OSM) couvrant toutes les features P0→P2 de `docs/features.md` pour la fiche bien ; livraison front Next.js 16 **et** backend Laravel 13 (PropertyResource enrichi + 6 nouveaux endpoints publics).

---

## 0. Contexte repo pour Devin

### 0.1 Stack
- **Monorepo** : `takussan-api/` (Laravel 13, PHP 8.3, SQLite par défaut) + `takussan-web/` (Next.js 16.2.3, React 19, TypeScript 5, Tailwind 4, shadcn/ui sur `@base-ui/react`).
- **Ticket** : `docs/backlog/tickets/TCK-040-property-detail.md`.
- **Branche** : `feat/tck-040-property-detail-full`.
- **Commits** : `[TCK-040] <phase>/<step> <résumé>` — un commit par case cochée §8.

### 0.2 Setup

```bash
# takussan-api/
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate:fresh --seed
php artisan serve --port=8002        # ← port FIXE (hardcodé côté front)

# takussan-web/
npm install
cp .env.example .env.local           # vérifier NEXT_PUBLIC_API_URL=http://localhost:8002
npm run dev
```

### 0.3 Vérifications obligatoires AVANT chaque commit

| Où | Commande |
|---|---|
| `takussan-api/` | `./vendor/bin/pint` puis `php artisan test` |
| `takussan-web/` | `npm run lint` puis `npx tsc --noEmit` |
| En fin de phase front | `npm run build` |

### 0.4 Règles strictes non négociables

1. **Zéro hex hardcodé** dans le front : `bg-primary`, `text-primary`, etc. — jamais `#0050cb`. Exception : WhatsApp `#25D366` (déjà dans `WhatsAppButton`).
2. **Jamais de `<select>`, `<button>`, `<dialog>` natifs** pour une action principale — toujours `src/components/ui/*` (shadcn + `@base-ui/react`).
3. **Toujours `next/image`** avec `sizes` — jamais `<img>`.
4. **Front** : utiliser `apiFetch` (public) et `apiRequest` (auth) de `src/lib/api.ts`.
5. **Back** : pattern FormRequest + Resource + Service ; `abort()` pour permissions ; `spatie/laravel-query-builder` pour listes ; `./vendor/bin/pint` avant tout commit.
6. **Interdit** : modifier `docs/features.md` ou `docs/models-spec.md` (sources de vérité). Noter tout delta dans la PR sous `## Specs drift`.

### 0.5 Fichiers à LIRE avant d'écrire (ordre)

1. `CLAUDE.md`
2. `docs/features.md` §1.1–1.3, §1.7, §1.10, §1.11
3. `docs/design-guidelines.md`
4. `docs/backlog/tickets/TCK-040-property-detail.md`
5. `takussan-web/src/app/(public)/properties/[slug]/page.tsx` (état actuel, minimaliste)
6. `takussan-web/src/components/home/{Navbar,Hero,PropertyCard,Footer}.tsx` (patterns)
7. `takussan-web/src/app/globals.css` (tokens)
8. `takussan-web/src/components/ui/*` (Button, Input, Dialog, Select, Card, Avatar, Badge, Skeleton)
9. `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php`
10. `takussan-api/app/Http/Resources/PropertyResource.php`
11. `takussan-api/app/Models/Property.php` (relations : address, agency, owner, tags, collaborators, bookings, visits, reviews, priceHistory, documents)
12. `takussan-api/app/Http/Controllers/Api/{Favorite,Review,PropertyVisit,PropertyPriceHistory,Conversation}Controller.php` (déjà implémentés en auth — à ré-exposer en public)
13. `takussan-api/tests/Feature/Public/PropertyDetailTest.php`

### 0.6 Ce qui existe déjà en backend (**ne pas dupliquer**)

| Modèle | Controller auth existant | Statut |
|---|---|---|
| `Property`, `Address`, `Tag` | `Api\*Controller` | ✅ |
| `Favorite` | `Api\FavoriteController` (index/store/destroy) | ✅ |
| `Review` | `Api\ReviewController` (indexForProperty/storeForProperty/reply/approve/report) | ✅ |
| `PropertyVisit` | `Api\PropertyVisitController` (full CRUD + confirm/complete/cancel) | ✅ |
| `PropertyPriceHistory` | `Api\PropertyPriceHistoryController` (index) | ✅ |
| `Conversation` + `Message` | `Api\ConversationController` (full) | ✅ |
| `Booking` | `Api\BookingController` | ✅ |
| `Document` (polymorphe) | `Api\DocumentController` | ✅ |

**Stratégie** : exposer en public via `/public/properties/{slug}/…` en réutilisant la logique existante — **ne pas dupliquer**.

---

## 1. Périmètre fonctionnel (features.md)

Chaque item est **dans le périmètre** ; ceux en gras nécessitent une extension backend explicite.

**Fiche bien (§1.1, §1.2)** — galerie `thumbnail/preview/original` + lightbox ; référence `TK-YYYY-XXXXXX` ; badge statut ; **tags/amenités** ; type de titre foncier ; **compteurs `views_count` et `favorites_count`** ; `average_rating` + `reviews_count` ; plans, vidéos, visite 360° (iframe Matterport via `metadata.virtual_tour_url`).

**Découverte (§1.2)** — favoris (Sanctum ou localStorage fallback), partage (copier lien + WhatsApp + Facebook + X + email), **biens similaires** (nouveau endpoint), historique consulté (localStorage max 10), comparateur (bouton → `localStorage['takussan.compare']`).

**Visites & réservation (§1.3)** — demande de visite (date, heure, `in_person|virtual|self_guided|hybrid`, message) — public ou auth ; **demande de réservation** (dates, invités, message) — auth obligatoire, crée `Booking` status `pending`.

**Messagerie (§1.7)** — CTA "Message à l'agent" → crée `Conversation` (type `direct`, `property_id`) + `Message` initial → redirige vers `/messages/{id}` (page cible stub minimal si absente).

**Avis (§1.11)** — consultation avis approuvés, note moyenne + distribution, formulaire si auth + booking/lease complété, signalement (logique auth existante réutilisée).

**Documents publics (§1.10)** — liste des documents avec `metadata->public === true` attachés au bien (nom, type, taille, URL download).

**Historique de prix (§1.1)** — timeline verticale des changements (si ≥ 1 entrée).

**Signalement annonce** — POST public rate-limité vers nouvelle table `property_reports`.

### Hors-scope explicite

- UI messagerie complète `/messages/[id]` (on redirige seulement)
- Signature électronique docs
- Page `/compare` multi-pages
- Recherche vocale / sémantique
- Paiement réel (Wave/OM/Stripe) — CTA créent juste la demande

## 2. Layout final (Airbnb-like)

```
┌─────────────────────────── Navbar (public, existante) ──────────────────────────┐
│                                                                                  │
│  Breadcrumb · Titre H1 · Réf · Statut badge · Note · Vues   [Partager][Favori]  │
│                                                                                  │
│  ┌──────────────────────┬─────────────┬─────────────┐                           │
│  │                      │  photo 2    │  photo 3    │                           │
│  │   photo 1 (grande)   ├─────────────┼─────────────┤   [Voir les 12 photos]   │
│  │                      │  photo 4    │  photo 5    │                           │
│  └──────────────────────┴─────────────┴─────────────┘                           │
│                                                                                  │
│  ┌───────────────────────────────────┐  ┌────────────────────────┐             │
│  │ 2/3 : contenu                     │  │ 1/3 : sidebar sticky   │             │
│  │ - Infos principales + stats       │  │ ┌──────────────────┐   │             │
│  │ - Description (read more)         │  │ │ Prix XOF + /mois │   │             │
│  │ - Caractéristiques détaillées     │  │ │ [Réserver]       │   │             │
│  │ - Équipements & amenités          │  │ │ [Demander visite]│   │             │
│  │ - Localisation (carte Leaflet)    │  │ │ ─────            │   │             │
│  │ - Historique de prix              │  │ │ Agent card       │   │             │
│  │ - Documents publics               │  │ │ [Message][Appel] │   │             │
│  │ - Avis (liste + formulaire)       │  │ │ [WhatsApp]       │   │             │
│  │ - Signaler l'annonce              │  │ └──────────────────┘   │             │
│  └───────────────────────────────────┘  └────────────────────────┘             │
│                                                                                  │
│  Biens similaires (carousel 4 cards)                                             │
│  Déjà consultés (localStorage, max 6)                                            │
│                                                                                  │
│  Footer (public, existant)                                                       │
└──────────────────────────────────────────────────────────────────────────────────┘

Mobile : hero gallery swipe, infos full width, CTA en bottom bar fixe (Prix + Réserver + Message).
```

### 2.1 Mobile (< 768px)

- Gallery swipeable (Embla, 1 photo/slide, dots)
- Tout en colonne unique
- **Bottom bar fixe** (h=72px, shadow-top, safe-area-inset-bottom) : Prix (text-lg bold) · `[Message]` outline · `[Réserver]` primary
- La sidebar devient **bottom sheet** (Dialog en mode sheet) déclenché par `[Réserver]`

### 2.2 Tablette (768–1023px)

- Gallery 2 colonnes (1 grande + 2 miniatures empilées)
- 1 colonne, sidebar en bas après Amenities (pas sticky)
- Bottom bar mobile active

### 2.3 Design system — tokens à utiliser

| Token Tailwind | Usage |
|---|---|
| `bg-primary` / `text-primary` | CTA principal, liens, icônes clés |
| `bg-primary/80`, `bg-primary/10` | Hover, focus |
| `bg-surface` (`#f8f9fa`) | Fond de page |
| `bg-surface-container` (`#edeeef`) | Cartes enfoncées, skeletons, tonal layering |
| `text-on-surface` | Texte courant |
| `text-on-surface-variant` | Texte secondaire, méta |
| `text-outline` | Séparateurs, placeholders |
| `font-heading` (Manrope) | H1–H3 |
| `font-sans` (Geist) | Body |
| `rounded-lg` / `rounded-xl` / `rounded-2xl` | Boutons / cartes / modales |
| `shadow-sm`, `shadow-md` | Ombres courantes (jamais `shadow-2xl` en flux) |

**Transitions** : `transition-all duration-150` (hover/focus), `duration-300` (panneau/modale).
**Navbar fixe** : ajouter `pt-[133px]` sur le wrapper comme dans `PropertiesPage.tsx`.
**Iconographie** : uniquement `lucide-react`, 16px inline / 20px dans boutons / 24px standalone.

### 2.4 Mapping amenity → icône

Créer `src/app/(public)/properties/[slug]/components/amenity-icons.ts` :

```ts
import { Waves, Wind, Car, ShieldCheck, Wifi, Tv, Flame, Utensils, TreePine, Dumbbell, WashingMachine, ParkingCircle, Sun, Building2, ArrowUpSquare, KeyRound } from 'lucide-react';

export const AMENITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pool: Waves, piscine: Waves,
  ac: Wind, clim: Wind, climatisation: Wind,
  garage: Car, parking: ParkingCircle,
  security: ShieldCheck, securite: ShieldCheck,
  wifi: Wifi, internet: Wifi,
  tv: Tv, television: Tv,
  heating: Flame, chauffage: Flame,
  kitchen: Utensils, cuisine: Utensils,
  garden: TreePine, jardin: TreePine,
  gym: Dumbbell, salle_sport: Dumbbell,
  laundry: WashingMachine, buanderie: WashingMachine,
  terrace: Sun, terrasse: Sun,
  elevator: ArrowUpSquare, ascenseur: ArrowUpSquare,
  furnished: Building2, meuble: Building2,
  keybox: KeyRound,
};
export const FALLBACK_AMENITY_ICON = Building2;
```

## 3. Backend — contrats d'API exacts

Tous les endpoints retournent `application/json`. Dates ISO 8601. Prix floats en XOF.

### 3.1 `GET /api/public/properties/{slug}` — enrichir `PropertyResource`

**Fichiers** : `takussan-api/app/Http/Resources/PropertyResource.php` + `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php@show`.

**Eager load à ajouter** dans `show()` : `collaborators.user`, `documents`, `priceHistory`, `reviews` (avec scope `is_approved`).

**Payload enrichi** (shape exacte à produire quand `$request->routeIs('public.properties.show')`) :

```json
{
  "data": {
    "id": 42,
    "reference_number": "TK-2026-ABC123",
    "title": "Villa contemporaine",
    "slug": "villa-contemporaine-abc123",
    "price": 450000000,
    "currency": "XOF",
    "type": "villa",
    "type_label": "Villa",
    "contract_type": "sale",
    "contract_type_label": "À vendre",
    "rent_period": null,
    "rent_period_label": null,
    "status": "available",
    "status_label": "Disponible",
    "visibility": "public",
    "title_type": "titre_foncier",
    "title_type_label": "Titre foncier",
    "location": {
      "full": "Almadies, Dakar, Dakar, Sénégal",
      "quarter": "Almadies", "city": "Dakar", "region": "Dakar", "country": "Sénégal",
      "latitude": 14.7444, "longitude": -17.5167
    },
    "bedrooms": 5, "bathrooms": 3, "area": 320,
    "floor_number": null, "total_floors": 2,
    "year_built": 2022, "parking_spaces": 2,
    "furnished": true, "featured": true,
    "views_count": 1247, "favorites_count": 18,
    "average_rating": 4.8, "reviews_count": 12,
    "description": "…",
    "main_photo_url": "https://…/preview.jpg",
    "photos": [
      { "id": 1, "thumbnail": "…", "preview": "…", "original": "…", "order": 1 }
    ],
    "media_extra": {
      "videos": ["https://…/v.mp4"],
      "plans": ["https://…/plan.pdf"],
      "virtual_tour_url": "https://matterport.com/show/?m=abc"
    },
    "tags": [{ "id": 1, "name": "Piscine", "slug": "pool", "type": "amenity", "icon": "pool", "color": null }],
    "owner": {
      "id": 7, "name": "Awa Ndiaye", "avatar_url": "https://…",
      "is_agent": true, "member_since": "2024-03-15T00:00:00Z"
    },
    "agency": {
      "id": 3, "name": "Takussan Premium", "slug": "takussan-premium",
      "logo_url": "https://…", "verified": true, "rating": 4.7
    },
    "documents": [
      { "id": 10, "name": "Plan", "type": "plan", "size": 428000, "url": "https://…", "public": true }
    ],
    "price_history": [
      { "id": 1, "old_price": 500000000, "new_price": 450000000, "currency": "XOF", "reason": "price_drop", "changed_at": "2026-03-15T00:00:00Z" }
    ],
    "published_at": "2026-03-01T10:00:00Z",
    "created_at": "2026-02-28T08:00:00Z"
  }
}
```

**Règles** :

- Labels FR via `__('properties.type.'.$this->type?->value)` etc. — créer `takussan-api/lang/fr/properties.php` (voir §3.9).
- `owner` n'expose **jamais** email/phone direct. `phone` reste accessible uniquement via `/contact` existant.
- `agency.verified` ← colonne `agencies.is_verified`. **Vérifier** qu'elle existe ; sinon ajouter migration `add_is_verified_to_agencies`.
- `agency.rating` ← moyenne `reviews` de l'agence (via `reviewable_type`). Null si aucun avis.
- `documents` filtrés à `metadata->public === true`.
- `media_extra.virtual_tour_url` lu depuis `$property->metadata['virtual_tour_url'] ?? null`.
- `media_extra.videos` / `plans` via `getMedia('videos')` / `getMedia('plans')` (collections déjà déclarées dans `Property::registerMediaCollections`).
- `average_rating` ← `$property->reviews()->where('is_approved', true)->avg('rating')`. `reviews_count` ← count idem.
- `favorites_count` ← `$property->favorites()->count()`. **Vérifier** que la relation `favorites()` existe sur `Property`. Sinon l'ajouter :

```php
public function favorites(): HasMany
{
    return $this->hasMany(Favorite::class);
}
```

**Test à ajouter** dans `takussan-api/tests/Feature/Public/PropertyDetailTest.php` :

```php
public function test_show_returns_enriched_public_detail(): void
{
    $property = Property::factory()->published()->create();
    $property->tags()->attach(Tag::factory()->create(['type' => 'amenity']));
    $property->reviews()->create([
        'author_id' => User::factory()->create()->id,
        'rating' => 5, 'is_approved' => true,
    ]);

    $response = $this->getJson("/api/public/properties/{$property->slug}");

    $response->assertOk()->assertJsonStructure([
        'data' => [
            'id', 'reference_number', 'type_label', 'contract_type_label', 'status_label',
            'title_type_label', 'location' => ['full', 'latitude', 'longitude'],
            'views_count', 'favorites_count', 'average_rating', 'reviews_count',
            'owner' => ['id', 'name', 'is_agent'],
            'tags', 'photos', 'media_extra' => ['videos', 'plans', 'virtual_tour_url'],
            'documents', 'price_history',
        ],
    ]);
    $this->assertEquals(5.0, $response->json('data.average_rating'));
    $this->assertEquals(1, $response->json('data.reviews_count'));
}
```

### 3.2 `GET /api/public/properties/{slug}/similar`

**Ajouter** méthode `PublicPropertyController@similar` :

```php
public function similar(string $slug): AnonymousResourceCollection
{
    $property = Property::where('slug', $slug)->public()->firstOrFail();

    $query = Property::query()
        ->with('address', 'media')
        ->public()
        ->where('id', '!=', $property->id)
        ->where('type', $property->type)
        ->whereBetween('price', [$property->price * 0.7, $property->price * 1.3])
        ->when($property->address?->city, fn ($q, $city) =>
            $q->whereHas('address', fn ($a) => $a->where('city', $city)))
        ->orderByDesc('featured')
        ->orderByDesc('published_at')
        ->limit(6);

    $results = $query->get();

    // Fallback : relâcher critère ville si < 3 résultats
    if ($results->count() < 3) {
        $results = Property::query()
            ->with('address', 'media')
            ->public()
            ->where('id', '!=', $property->id)
            ->where('type', $property->type)
            ->whereBetween('price', [$property->price * 0.7, $property->price * 1.3])
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->limit(6)
            ->get();
    }

    return PropertyResource::collection($results);
}
```

**Response** : `{ "data": [PropertyResource × N] }` — shape liste (pas l'enrichie de `show`).

**Test** : `tests/Feature/Public/PropertySimilarTest.php` — créer 10 biens variés, assert count ≤ 6, self exclus, type matché.

### 3.3 `GET /api/public/properties/{slug}/reviews`

**Ajouter** méthode `PublicPropertyController@reviews` qui délègue à `ReviewController::indexForProperty` (déjà public-safe dans sa logique car filtre `is_approved = true`) :

```php
public function reviews(Request $request, string $slug): JsonResponse
{
    $property = Property::where('slug', $slug)->public()->firstOrFail();

    $paginated = $property->reviews()
        ->where('is_approved', true)
        ->with('author:id,first_name,last_name,avatar_url')
        ->latest()
        ->paginate((int) $request->input('per_page', 10));

    $avg = round($property->reviews()->where('is_approved', true)->avg('rating') ?? 0, 2);
    $distribution = $property->reviews()
        ->where('is_approved', true)
        ->selectRaw('rating, count(*) as cnt')
        ->groupBy('rating')
        ->pluck('cnt', 'rating')
        ->toArray();
    $distribution = array_map(fn ($r) => $distribution[$r] ?? 0, [5, 4, 3, 2, 1]);

    return $this->json([
        'data' => ReviewResource::collection($paginated)->toArray($request),
        'meta' => [
            'total' => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'average' => $avg,
            'distribution' => ['5' => $distribution[0], '4' => $distribution[1], '3' => $distribution[2], '2' => $distribution[3], '1' => $distribution[4]],
        ],
    ]);
}
```

**Enrichir** `ReviewResource` pour inclure :

```php
'author' => [
    'id' => $this->author?->id,
    'name' => trim(($this->author?->first_name ?? '').' '.($this->author?->last_name ?? '')) ?: 'Anonyme',
    'avatar_url' => $this->author?->avatar_url ?? null,
],
```

### 3.4 `POST /api/public/properties/{slug}/report`

**Migration** `takussan-api/database/migrations/YYYY_MM_DD_HHMMSS_create_property_reports_table.php` :

```php
Schema::create('property_reports', function (Blueprint $t) {
    $t->id();
    $t->foreignId('property_id')->constrained()->cascadeOnDelete();
    $t->foreignId('reporter_user_id')->nullable()->constrained('users')->nullOnDelete();
    $t->string('reporter_ip', 45)->nullable();
    $t->string('reason'); // spam|misleading|fraud|inappropriate_content|other
    $t->text('details')->nullable();
    $t->timestamp('resolved_at')->nullable();
    $t->timestamps();
    $t->index(['property_id', 'created_at']);
});
```

**Model** `App\Models\PropertyReport` (HasFactory + fillable).

**Controller** `PublicPropertyController@report` :

```php
public function report(Request $request, string $slug): JsonResponse
{
    $property = Property::where('slug', $slug)->public()->firstOrFail();
    $data = $request->validate([
        'reason' => ['required', Rule::in(['spam', 'misleading', 'fraud', 'inappropriate_content', 'other'])],
        'details' => ['nullable', 'string', 'max:1000'],
    ]);

    PropertyReport::create([
        'property_id' => $property->id,
        'reporter_user_id' => $request->user()?->id,
        'reporter_ip' => $request->ip(),
        'reason' => $data['reason'],
        'details' => $data['details'] ?? null,
    ]);

    return $this->json(null, 204);
}
```

**Route** : `throttle:5,60` (5 req/h/IP).

**Test** : submit OK 204 + DB row créée + 429 au 6e appel dans l'heure.

### 3.5 `POST /api/public/properties/{slug}/visit-request`

**Route** : `routes/api/public.php` avec `throttle:10,60`. Accepter auth optionnelle.

**Controller** `PublicPropertyController@visitRequest` :

```php
public function visitRequest(Request $request, string $slug): JsonResponse
{
    $property = Property::where('slug', $slug)->public()->firstOrFail();
    $user = $request->user();

    $rules = [
        'scheduled_at' => ['required', 'date', 'after:now'],
        'type' => ['nullable', Rule::enum(VisitType::class)],
        'duration_minutes' => ['nullable', 'integer', 'min:15', 'max:240'],
        'notes' => ['nullable', 'string', 'max:1000'],
    ];
    if (! $user) {
        $rules['visitor_name'] = ['required', 'string', 'max:120'];
        $rules['visitor_email'] = ['required', 'email'];
        $rules['visitor_phone'] = ['required', 'string', 'max:30'];
    }
    $data = $request->validate($rules);

    $visit = PropertyVisit::create([
        'property_id' => $property->id,
        'visitor_id' => $user?->id,
        'scheduled_at' => $data['scheduled_at'],
        'type' => $data['type'] ?? VisitType::InPerson->value,
        'duration_minutes' => $data['duration_minutes'] ?? 30,
        'status' => VisitStatus::Scheduled->value,
        'visitor_name' => $data['visitor_name'] ?? $user?->full_name,
        'visitor_email' => $data['visitor_email'] ?? $user?->email,
        'visitor_phone' => $data['visitor_phone'] ?? $user?->phone,
        'notes' => $data['notes'] ?? null,
    ]);

    return $this->json(['data' => PropertyVisitResource::make($visit)->toArray($request)], 201);
}
```

**Vérifier** que la table `property_visits` contient `visitor_name`, `visitor_email`, `visitor_phone` (colonnes existantes d'après controller auth). Sinon migration d'ajout.

**Test** : visiteur anonyme avec triplet nom/email/phone → 201 ; auth → 201 ; `scheduled_at` passé → 422.

### 3.6 `POST /api/public/properties/{slug}/booking-request`

**Auth Sanctum obligatoire**.

**Controller** `PublicPropertyController@bookingRequest` :

```php
public function bookingRequest(Request $request, string $slug): JsonResponse
{
    $property = Property::where('slug', $slug)->public()->firstOrFail();
    $data = $request->validate([
        'start_date' => ['required', 'date', 'after_or_equal:today'],
        'end_date' => ['required', 'date', 'after:start_date'],
        'guests' => ['required', 'integer', 'min:1', 'max:50'],
        'message' => ['nullable', 'string', 'max:1000'],
    ]);
    $user = $request->user();

    // Créer ou récupérer le Customer associé à l'utilisateur
    $customer = app(CustomerService::class)->findOrCreateFromUser($user);

    $nights = max(1, Carbon::parse($data['end_date'])->diffInDays(Carbon::parse($data['start_date'])));
    $totalAmount = $property->rent_period === RentPeriod::Daily
        ? $property->price * $nights
        : (float) $property->price;

    $booking = Booking::create([
        'property_id' => $property->id,
        'customer_id' => $customer->id,
        'start_date' => $data['start_date'],
        'end_date' => $data['end_date'],
        'guests' => $data['guests'],
        'total_amount' => $totalAmount,
        'currency' => $property->currency,
        'status' => BookingStatus::Pending->value,
        'notes' => $data['message'] ?? null,
    ]);

    return $this->json(['data' => BookingResource::make($booking)->toArray($request)], 201);
}
```

Si `CustomerService::findOrCreateFromUser` n'existe pas, l'ajouter (vérifier d'abord — le service `App\Services\Model\CustomerService` existe déjà).

### 3.7 `POST /api/public/properties/{slug}/contact-message`

**Auth Sanctum obligatoire**.

**Controller** `PublicPropertyController@contactMessage` :

```php
public function contactMessage(Request $request, string $slug): JsonResponse
{
    $property = Property::where('slug', $slug)->with('owner', 'collaborators.user')->public()->firstOrFail();
    $data = $request->validate(['message' => ['required', 'string', 'max:2000']]);
    $user = $request->user();

    $primaryAgent = $property->collaborators
        ->firstWhere('role', CollaboratorRole::PrimaryAgent->value)?->user
        ?? $property->owner;

    abort_if($primaryAgent?->id === $user->id, 422, 'You cannot message yourself.');

    // Chercher une conversation existante
    $conversation = Conversation::whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
        ->whereHas('participants', fn ($q) => $q->where('user_id', $primaryAgent->id))
        ->where('property_id', $property->id)
        ->first();

    $conversation ??= DB::transaction(function () use ($user, $primaryAgent, $property) {
        $conv = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $user->id,
            'property_id' => $property->id,
        ]);
        $conv->participants()->attach([$user->id, $primaryAgent->id], ['joined_at' => now()]);
        return $conv;
    });

    $message = $conversation->messages()->create([
        'sender_id' => $user->id,
        'content' => $data['message'],
        'type' => MessageType::Text->value,
    ]);
    $conversation->update([
        'last_message_id' => $message->id,
        'last_message_preview' => mb_substr($data['message'], 0, 255),
        'last_message_at' => now(),
    ]);

    app(NotificationService::class)->notify($primaryAgent, NotificationType::Message,
        'Nouveau message', $user->full_name.": ".mb_strimwidth($data['message'], 0, 80, '…'),
        ['conversation_id' => $conversation->id, 'message_id' => $message->id]);

    return $this->json([
        'data' => ['conversation_id' => $conversation->id, 'redirect_to' => "/messages/{$conversation->id}"],
    ], 201);
}
```

### 3.8 Routes à ajouter

**Fichier** : `takussan-api/routes/api/public.php` — ajouter après les routes existantes :

```php
Route::prefix('public')->name('public.')->group(function () {
    // … routes existantes (index, search, show, contact) …

    Route::get('properties/{slug}/similar', [PublicPropertyController::class, 'similar'])
        ->name('properties.similar');
    Route::get('properties/{slug}/reviews', [PublicPropertyController::class, 'reviews'])
        ->name('properties.reviews');
    Route::post('properties/{slug}/report', [PublicPropertyController::class, 'report'])
        ->middleware('throttle:5,60')->name('properties.report');
    Route::post('properties/{slug}/visit-request', [PublicPropertyController::class, 'visitRequest'])
        ->middleware('throttle:10,60')->name('properties.visit-request');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('properties/{slug}/booking-request', [PublicPropertyController::class, 'bookingRequest'])
            ->name('properties.booking-request');
        Route::post('properties/{slug}/contact-message', [PublicPropertyController::class, 'contactMessage'])
            ->name('properties.contact-message');
    });
});
```

### 3.9 Traductions

**Créer** `takussan-api/lang/fr/properties.php` :

```php
<?php
return [
    'type' => [
        'land' => 'Terrain', 'house' => 'Maison', 'apartment' => 'Appartement',
        'villa' => 'Villa', 'studio' => 'Studio', 'room' => 'Chambre',
        'office' => 'Bureau', 'shop' => 'Commerce', 'warehouse' => 'Entrepôt',
        'factory' => 'Usine', 'farm' => 'Ferme', 'hotel' => 'Hôtel',
        'resort' => 'Complexe', 'garage' => 'Garage', 'parking' => 'Parking',
        'other' => 'Autre',
    ],
    'contract_type' => ['sale' => 'À vendre', 'rent' => 'À louer'],
    'rent_period' => ['daily' => 'par jour', 'weekly' => 'par semaine', 'monthly' => 'par mois', 'yearly' => 'par an'],
    'status' => [
        'available' => 'Disponible', 'sold' => 'Vendu', 'rented' => 'Loué',
        'under_maintenance' => 'En maintenance', 'unavailable' => 'Indisponible',
        'pending' => 'Réservé', 'draft' => 'Brouillon',
        'published' => 'Publié', 'archived' => 'Archivé',
    ],
    'title_type' => [
        'bail' => 'Bail', 'titre_foncier' => 'Titre foncier',
        'deliberation' => 'Délibération', 'other' => 'Autre',
    ],
];
```

## 4. Frontend — architecture complète

### 4.1 Arborescence cible

```
takussan-web/src/
├── app/(public)/properties/[slug]/
│   ├── page.tsx                         ← REFONTE complète
│   ├── layout.tsx                       ← CRÉER (Navbar + Footer wrapper)
│   ├── not-found.tsx                    ← CRÉER (404 custom, CTA retour /)
│   ├── loading.tsx                      ← CRÉER (skeleton page complet)
│   └── components/                      ← CRÉER (tous locaux à cette page)
│       ├── amenity-icons.ts
│       ├── PropertyBreadcrumb.tsx
│       ├── PropertyHeader.tsx
│       ├── PropertyGalleryMosaic.tsx
│       ├── PropertyLightbox.tsx
│       ├── PropertyMobileGallery.tsx     (Embla, mobile uniquement)
│       ├── PropertySpecsStrip.tsx
│       ├── PropertyDescription.tsx
│       ├── PropertyCharacteristics.tsx
│       ├── PropertyAmenities.tsx
│       ├── PropertyLocationMap.tsx       (dynamic import, ssr:false)
│       ├── PropertyPriceHistory.tsx
│       ├── PropertyDocuments.tsx
│       ├── PropertyReviews.tsx
│       ├── PropertyReviewForm.tsx
│       ├── PropertyReportButton.tsx
│       ├── PropertyBookingCard.tsx       (sidebar sticky desktop)
│       ├── PropertyAgentCard.tsx
│       ├── PropertyVisitDialog.tsx
│       ├── PropertyReservationDialog.tsx
│       ├── PropertyShareDialog.tsx
│       ├── PropertyContactMessageDialog.tsx
│       ├── PropertySimilar.tsx
│       ├── PropertyRecentlyViewed.tsx
│       └── PropertyMobileBottomBar.tsx
├── components/ui/
│   ├── textarea.tsx                     ← CRÉER via `npx shadcn@latest add textarea`
│   ├── dialog.tsx                       ← vérifier existence, ajouter si manquant
│   └── tabs.tsx                         ← ajouter si manquant (pour AgentCard variants)
├── hooks/
│   ├── useSimilarProperties.ts          ← CRÉER
│   ├── useFavorite.ts                   ← CRÉER
│   ├── useRecentlyViewed.ts             ← CRÉER
│   ├── usePropertyReviews.ts            ← CRÉER
│   ├── useVisitRequest.ts               ← CRÉER
│   ├── useBookingRequest.ts             ← CRÉER
│   ├── useContactMessage.ts             ← CRÉER
│   └── useReportProperty.ts             ← CRÉER
├── types/
│   ├── property.ts                      ← MODIFIER (étendre PropertyDetail)
│   ├── review.ts                        ← CRÉER
│   └── visit.ts                         ← CRÉER
└── lib/
    ├── share.ts                         ← CRÉER (helpers partage social)
    └── recently-viewed.ts               ← CRÉER (localStorage helpers)
```

### 4.2 Types TypeScript

**Étendre** `takussan-web/src/types/property.ts` :

```ts
export type PropertyTitleType = 'bail' | 'titre_foncier' | 'deliberation' | 'other';

export interface PropertyOwnerLite {
  id: number;
  name: string;
  avatar_url: string | null;
  is_agent: boolean;
  member_since: string | null;
}

export interface PropertyAgencyLite {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  verified: boolean;
  rating: number | null;
}

export interface PropertyTag {
  id: number;
  name: string;
  slug: string;
  type: 'amenity' | 'feature' | 'category' | string;
  icon: string | null;
  color: string | null;
}

export interface PropertyPhoto {
  id: number;
  thumbnail: string;
  preview: string;
  original: string;
  order: number;
}

export interface PropertyMediaExtra {
  videos: string[];
  plans: string[];
  virtual_tour_url: string | null;
}

export interface PropertyDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
  public: boolean;
}

export interface PropertyPriceHistoryItem {
  id: number;
  old_price: number;
  new_price: number;
  currency: string;
  reason: string | null;
  changed_at: string;
}

export interface PropertyDetail extends PropertyListItem {
  type_label: string;
  contract_type_label: string | null;
  rent_period_label: string | null;
  status_label: string;
  title_type: PropertyTitleType | null;
  title_type_label: string | null;
  floor_number: number | null;
  total_floors: number | null;
  year_built: number | null;
  parking_spaces: number | null;
  views_count: number;
  favorites_count: number;
  average_rating: number | null;
  reviews_count: number;
  description: string | null;
  photos: PropertyPhoto[];
  media_extra: PropertyMediaExtra;
  tags: PropertyTag[];
  owner: PropertyOwnerLite;
  agency: PropertyAgencyLite | null;
  documents: PropertyDocument[];
  price_history: PropertyPriceHistoryItem[];
  location: {
    full: string;
    quarter: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}
```

**Créer** `takussan-web/src/types/review.ts` :

```ts
export interface PropertyReview {
  id: number;
  rating: number;
  title: string | null;
  content: string | null;
  author: { id: number; name: string; avatar_url: string | null };
  reply_content: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface PropertyReviewsResponse {
  data: PropertyReview[];
  meta: {
    total: number;
    current_page: number;
    average: number | null;
    distribution: Record<'5' | '4' | '3' | '2' | '1', number>;
  };
}
```

**Créer** `takussan-web/src/types/visit.ts` :

```ts
export type VisitType = 'in_person' | 'virtual' | 'self_guided' | 'hybrid';

export interface VisitRequestPayload {
  scheduled_at: string;
  type: VisitType;
  duration_minutes?: number;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  notes?: string;
}

export interface BookingRequestPayload {
  start_date: string;
  end_date: string;
  guests: number;
  message?: string;
}

export interface ReportPayload {
  reason: 'spam' | 'misleading' | 'fraud' | 'inappropriate_content' | 'other';
  details?: string;
}
```

### 4.3 Dépendances à installer

```bash
cd takussan-web
npm install leaflet@^1.9.4 react-leaflet@^4.2.1
npm install --save-dev @types/leaflet@^1.9.8
npm install embla-carousel-react@^8.3.0
npx shadcn@latest add textarea dialog tabs
```

Importer Leaflet CSS dans `takussan-web/src/app/globals.css` (en haut) :

```css
@import 'leaflet/dist/leaflet.css';
```

### 4.4 Signatures hooks

```ts
// src/hooks/useFavorite.ts
export function useFavorite(propertyId: number): {
  isFavorite: boolean;
  toggle: () => Promise<void>;
  loading: boolean;
};
// Comportement : si session auth (token en localStorage['takussan.token']),
// POST /api/favorites { property_id } / DELETE /api/favorites/{id}
// Sinon, toggle localStorage['takussan.favorites'] (array d'ids).

// src/hooks/useSimilarProperties.ts
export function useSimilarProperties(slug: string): {
  data: PropertyListItem[]; loading: boolean; error: string | null;
};

// src/hooks/useRecentlyViewed.ts
export function useRecentlyViewed(current?: PropertyListItem): {
  items: PropertyListItem[]; // max 10, exclu le courant
  clear: () => void;
};

// src/hooks/usePropertyReviews.ts
export function usePropertyReviews(slug: string, propertyId: number): {
  data: PropertyReviewsResponse | null;
  loading: boolean; error: string | null;
  submit: (p: { rating: number; title?: string; content?: string }) => Promise<void>;
  report: (reviewId: number, reason: string) => Promise<void>;
  refetch: () => Promise<void>;
};
// submit utilise POST /api/properties/{id}/reviews (controller auth existant).

// src/hooks/useVisitRequest.ts
export function useVisitRequest(slug: string): {
  submit: (payload: VisitRequestPayload) => Promise<void>;
  submitting: boolean; error: string | null;
};

// src/hooks/useBookingRequest.ts
export function useBookingRequest(slug: string): {
  submit: (payload: BookingRequestPayload) => Promise<void>;
  submitting: boolean; error: string | null;
};

// src/hooks/useContactMessage.ts
export function useContactMessage(slug: string): {
  submit: (message: string) => Promise<{ conversation_id: number; redirect_to: string }>;
  submitting: boolean; error: string | null;
};

// src/hooks/useReportProperty.ts
export function useReportProperty(slug: string): {
  submit: (payload: ReportPayload) => Promise<void>;
  submitting: boolean; error: string | null;
};
```

### 4.5 Props composants

```ts
// PropertyHeader.tsx
interface PropertyHeaderProps {
  property: PropertyDetail;
  onToggleFavorite: () => void;
  onShare: () => void;
  isFavorite: boolean;
}

// PropertyGalleryMosaic.tsx
interface PropertyGalleryMosaicProps {
  photos: PropertyPhoto[];
  title: string;
  onOpenLightbox: (startIndex: number) => void;
}
// Layout grid : 1 grande photo à gauche (col-span-2 row-span-2) + 4 miniatures (col-span-1 row-span-1).
// Si < 5 photos, adapter : 1 photo → cover ; 2-4 photos → grid proportionnel.
// Bouton flottant "Voir toutes les photos (N)" en bas à droite de la dernière miniature.

// PropertyLightbox.tsx
interface PropertyLightboxProps {
  photos: PropertyPhoto[];
  open: boolean;
  startIndex: number;
  onClose: () => void;
}
// Dialog fullscreen, navigation ← / →, ESC pour fermer, swipe mobile.

// PropertyBookingCard.tsx
interface PropertyBookingCardProps {
  property: PropertyDetail;
  onRequestVisit: () => void;
  onRequestBooking: () => void;
  onMessage: () => void;
}

// PropertyAgentCard.tsx
interface PropertyAgentCardProps {
  owner: PropertyOwnerLite;
  agency: PropertyAgencyLite | null;
  propertySlug: string;
  propertyTitle: string;
  onMessage: () => void;
}
// Boutons : [Message] (onMessage), [Appeler] (tel: via /contact endpoint), [WhatsApp] (réutiliser WhatsAppButton existant).

// PropertyLocationMap.tsx (dynamic, ssr:false)
interface PropertyLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  quarter: string | null;
}
// Si lat/lng absent mais ville/quartier présent : afficher un message "Position approximative" avec center sur Dakar (14.7167, -17.4677).
// Zoom 14, hauteur 400px, rounded-xl, marker custom couleur primary.

// PropertyReviews.tsx
interface PropertyReviewsProps {
  slug: string;
  propertyId: number;
  averageRating: number | null;
  reviewsCount: number;
}

// PropertyShareDialog.tsx
interface PropertyShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
}
// Actions : Copier le lien, WhatsApp (wa.me/?text=...), Facebook (facebook.com/sharer), X (twitter.com/intent/tweet), Email (mailto:).

// PropertyMobileBottomBar.tsx
interface PropertyMobileBottomBarProps {
  price: number;
  currency: string;
  rentPeriod: string | null;
  onReserve: () => void;
  onMessage: () => void;
}
// Fixed bottom, bg-white, shadow-top, pb-safe (env(safe-area-inset-bottom)). Uniquement < md.
```

### 4.6 Leaflet + Next.js 16 (SSR)

Leaflet ne peut pas être rendu côté serveur. Dans `page.tsx` :

```tsx
import dynamic from 'next/dynamic';
const PropertyLocationMap = dynamic(
  () => import('./components/PropertyLocationMap').then(m => m.PropertyLocationMap),
  {
    ssr: false,
    loading: () => <div className="h-[400px] bg-surface-container rounded-xl animate-pulse" />,
  }
);
```

Dans `PropertyLocationMap.tsx` :

```tsx
'use client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// Fix icônes par défaut (sinon Leaflet cherche /marker-icon.png)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
```

Ou créer une icône custom couleur primary (SVG).

### 4.7 Helpers

**`src/lib/share.ts`** :

```ts
export function buildShareUrls(title: string, url: string) {
  const t = encodeURIComponent(title);
  const u = encodeURIComponent(url);
  return {
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    twitter: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    email: `mailto:?subject=${t}&body=${u}`,
  };
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}
```

**`src/lib/recently-viewed.ts`** :

```ts
const KEY = 'takussan.recent_properties';
const MAX = 10;

export type RecentItem = { id: number; slug: string; title: string; price: number; currency: string; main_photo_url: string | null; viewed_at: string };

export function pushRecent(item: Omit<RecentItem, 'viewed_at'>): void {
  if (typeof window === 'undefined') return;
  const items: RecentItem[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  const filtered = items.filter(i => i.id !== item.id);
  filtered.unshift({ ...item, viewed_at: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
}

export function readRecent(excludeId?: number): RecentItem[] {
  if (typeof window === 'undefined') return [];
  const items: RecentItem[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  return excludeId ? items.filter(i => i.id !== excludeId) : items;
}

export function clearRecent(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
```

## 5. Plan d'exécution — checklist atomique (TDD)

Chaque case cochée = un commit. Ordre impératif (dépendances). Pour chaque étape : écrire le(s) test(s) d'abord, voir rouge, implémenter, voir vert, puis linter + commit.

### Phase A — Backend (Laravel)

**A.1 Enrichir `PropertyResource`**

- [ ] **A.1.1** Écrire test `test_show_returns_enriched_public_detail` dans `tests/Feature/Public/PropertyDetailTest.php` (§3.1) — vérifier qu'il échoue (`php artisan test --filter=test_show_returns_enriched_public_detail`)
- [ ] **A.1.2** Ajouter la relation `favorites()` sur `Property.php` si absente
- [ ] **A.1.3** Créer `takussan-api/lang/fr/properties.php` (§3.9)
- [ ] **A.1.4** Enrichir `PropertyResource.php` (labels, owner, agency, tags, media_extra, documents, price_history, compteurs)
- [ ] **A.1.5** Eager loads dans `PublicPropertyController@show` : `collaborators.user, documents, priceHistory, reviews`
- [ ] **A.1.6** `./vendor/bin/pint` + `php artisan test` → vert
- [ ] **A.1.7** Commit `[TCK-040] A/1 enrich PropertyResource for public show`

**A.2 Endpoint `/similar`**

- [ ] **A.2.1** Écrire test `tests/Feature/Public/PropertySimilarTest.php`
- [ ] **A.2.2** Ajouter méthode `PublicPropertyController@similar` (§3.2)
- [ ] **A.2.3** Route dans `routes/api/public.php`
- [ ] **A.2.4** Tests verts + pint + commit

**A.3 Endpoint `/reviews` (GET public)**

- [ ] **A.3.1** Test `tests/Feature/Public/PropertyReviewsTest.php` (liste approuvés + avg + distribution)
- [ ] **A.3.2** Méthode `PublicPropertyController@reviews` (§3.3)
- [ ] **A.3.3** Enrichir `ReviewResource` avec `author` lite
- [ ] **A.3.4** Route + tests verts + pint + commit

**A.4 Endpoint `/report`**

- [ ] **A.4.1** Migration `create_property_reports_table` + model `PropertyReport`
- [ ] **A.4.2** Test `tests/Feature/Public/PropertyReportTest.php` (submit OK, 429 rate limit)
- [ ] **A.4.3** Méthode `@report` + route avec `throttle:5,60`
- [ ] **A.4.4** `php artisan migrate` + tests verts + pint + commit

**A.5 Endpoint `/visit-request`**

- [ ] **A.5.1** Vérifier que `property_visits` a colonnes `visitor_name/email/phone` (sinon migration d'ajout)
- [ ] **A.5.2** Test `tests/Feature/Public/PropertyVisitRequestTest.php` (anonyme OK, auth OK, date passée 422)
- [ ] **A.5.3** Méthode `@visitRequest` + route avec `throttle:10,60`
- [ ] **A.5.4** Tests verts + pint + commit

**A.6 Endpoint `/booking-request`**

- [ ] **A.6.1** Vérifier `CustomerService::findOrCreateFromUser` (ajouter si absent)
- [ ] **A.6.2** Test `tests/Feature/Public/PropertyBookingRequestTest.php`
- [ ] **A.6.3** Méthode `@bookingRequest` (auth Sanctum)
- [ ] **A.6.4** Tests verts + pint + commit

**A.7 Endpoint `/contact-message`**

- [ ] **A.7.1** Test `tests/Feature/Public/PropertyContactMessageTest.php` (crée conversation, réutilise si existe)
- [ ] **A.7.2** Méthode `@contactMessage` (auth Sanctum, création Conversation + Message + notification)
- [ ] **A.7.3** Tests verts + pint + commit

**Fin Phase A** — vérifier :

```bash
cd takussan-api
./vendor/bin/pint --test   # 0 diff
php artisan test           # 100% vert
```

### Phase B — Frontend fondations

**B.1 Types**

- [ ] **B.1.1** Étendre `src/types/property.ts` (§4.2)
- [ ] **B.1.2** Créer `src/types/review.ts`, `src/types/visit.ts`
- [ ] **B.1.3** `npx tsc --noEmit` → vert
- [ ] **B.1.4** Commit `[TCK-040] B/1 extend types for property detail`

**B.2 Dépendances**

- [ ] **B.2.1** `npm install leaflet@^1.9.4 react-leaflet@^4.2.1 embla-carousel-react@^8.3.0`
- [ ] **B.2.2** `npm install --save-dev @types/leaflet@^1.9.8`
- [ ] **B.2.3** `npx shadcn@latest add textarea dialog tabs` (vérifier `ui/dialog.tsx`, `ui/tabs.tsx` créés)
- [ ] **B.2.4** Importer `leaflet/dist/leaflet.css` dans `src/app/globals.css`
- [ ] **B.2.5** Commit

**B.3 Helpers**

- [ ] **B.3.1** Créer `src/lib/share.ts` (§4.7)
- [ ] **B.3.2** Créer `src/lib/recently-viewed.ts` (§4.7)
- [ ] **B.3.3** Commit

**B.4 Hooks**

- [ ] **B.4.1** `useSimilarProperties` — via `apiFetch` sur `/public/properties/{slug}/similar`
- [ ] **B.4.2** `useFavorite` — Sanctum si token, localStorage sinon (clé `takussan.favorites`)
- [ ] **B.4.3** `useRecentlyViewed` — utilise `recently-viewed.ts`
- [ ] **B.4.4** `usePropertyReviews` — GET public + POST auth (via `apiRequest`)
- [ ] **B.4.5** `useVisitRequest`, `useBookingRequest`, `useContactMessage`, `useReportProperty`
- [ ] **B.4.6** `npm run lint` + `tsc --noEmit` → vert
- [ ] **B.4.7** Commit

**B.5 Layout page**

- [ ] **B.5.1** Créer `src/app/(public)/properties/[slug]/layout.tsx` (wrap avec Navbar + spacer `pt-[133px]` + children + Footer)
- [ ] **B.5.2** Créer `loading.tsx` (skeleton)
- [ ] **B.5.3** Créer `not-found.tsx` (404 FR avec CTA retour accueil)
- [ ] **B.5.4** Commit

### Phase C — Hero & infos primaires

- [ ] **C.1** `amenity-icons.ts` (§2.4)
- [ ] **C.2** `PropertyBreadcrumb.tsx` (Acheter/Louer › Ville › Quartier)
- [ ] **C.3** `PropertyHeader.tsx` (titre, réf, statut, note, vues, actions favori/partager)
- [ ] **C.4** `PropertyGalleryMosaic.tsx` (desktop)
- [ ] **C.5** `PropertyMobileGallery.tsx` (Embla carousel)
- [ ] **C.6** `PropertyLightbox.tsx` (Dialog fullscreen)
- [ ] **C.7** `PropertySpecsStrip.tsx` (icônes Lucide)
- [ ] **C.8** `PropertyDescription.tsx` (Read more > 400 chars)
- [ ] **C.9** `PropertyCharacteristics.tsx` (tableau 2 cols : type, contract, étage/étages, année, parking, meublé, titre foncier)
- [ ] **C.10** `PropertyAmenities.tsx` (grid 2/3/4 cols avec icônes)
- [ ] Commit après chaque composant ou par groupe de 2-3 cohérents

### Phase D — Sidebar & CTA

- [ ] **D.1** `PropertyBookingCard.tsx` (prix + period + Réserver + Demander visite, sticky top-40 desktop)
- [ ] **D.2** `PropertyAgentCard.tsx` (avatar, nom, agence + verified badge, boutons Message/Appel/WhatsApp)
- [ ] **D.3** `PropertyVisitDialog.tsx` (date picker, heure, type select `in_person|virtual|…`, champs invité si non-auth)
- [ ] **D.4** `PropertyReservationDialog.tsx` (dates, invités, message, affichage total calculé)
- [ ] **D.5** `PropertyShareDialog.tsx` (copier + WhatsApp + Facebook + X + Email, toast "Lien copié")
- [ ] **D.6** `PropertyContactMessageDialog.tsx` (textarea + submit → redirige `/messages/{id}`)
- [ ] **D.7** `PropertyMobileBottomBar.tsx` (fixed bottom, uniquement `< md`)

### Phase E — Sections secondaires

- [ ] **E.1** `PropertyLocationMap.tsx` + dynamic import dans page (§4.6)
- [ ] **E.2** `PropertyPriceHistory.tsx` (timeline verticale, affichée uniquement si ≥ 1 entrée)
- [ ] **E.3** `PropertyDocuments.tsx` (liste avec icône par type, bouton Télécharger)
- [ ] **E.4** `PropertyReviews.tsx` + `PropertyReviewForm.tsx` (note moyenne, barre de distribution, liste + formulaire conditionnel auth)
- [ ] **E.5** `PropertyReportButton.tsx` (link discret en bas → Dialog de signalement)

### Phase F — Bas de page

- [ ] **F.1** `PropertySimilar.tsx` (fetch `useSimilarProperties`, carousel Embla 4 cards desktop / swipe mobile, réutiliser `home/PropertyCard`)
- [ ] **F.2** `PropertyRecentlyViewed.tsx` (lit `recently-viewed.ts`, exclude current id, grid 4 cards)
- [ ] **F.3** Dans `page.tsx` : appel `pushRecent()` dans un `useEffect` au mount

### Phase G — Recomposition page.tsx + polish

- [ ] **G.1** Refonte complète de `src/app/(public)/properties/[slug]/page.tsx` qui orchestre tous les composants
- [ ] **G.2** État 404 : si `apiFetch` throw 404 → `notFound()` de `next/navigation`
- [ ] **G.3** Skeleton complet dans `loading.tsx`
- [ ] **G.4** Animations d'entrée (réutiliser classe `animate-fade-in-up` si présente, sinon créer via Tailwind keyframes dans `globals.css`)
- [ ] **G.5** Responsive final (sidebar desktop / bottom sheet mobile)
- [ ] **G.6** Corriger les usages pré-existants de `property.type_label` (maintenant typé proprement)
- [ ] **G.7** Mise à jour du ticket `docs/backlog/tickets/TCK-040-property-detail.md` : cocher les AC

### Phase H — Vérification finale

- [ ] **H.1** `cd takussan-api && ./vendor/bin/pint --test && php artisan test` → tout vert
- [ ] **H.2** `cd takussan-web && npm run lint && npx tsc --noEmit && npm run build` → tout vert
- [ ] **H.3** Lancer les deux serveurs, naviguer `/properties/{slug}` sur : desktop 1440, tablet 768, mobile 375 — capturer 3 screenshots
- [ ] **H.4** Vérifier tous les CTA manuellement (cf §6 AC)
- [ ] **H.5** Ouvrir la PR `feat/tck-040-property-detail-full` → `main` avec :
  - Titre : `[TCK-040] Fiche bien — version finale full`
  - Description : récap des AC cochés, screenshots, liste des endpoints ajoutés, notes Specs drift s'il y en a

---

## 6. Critères d'acceptation (à cocher sur TCK-040)

### Fonctionnels

- [ ] Page `/properties/{slug}` affiche toutes les sections (hero mosaïque, header, specs, description, caractéristiques, amenities, localisation, historique prix, documents, avis, biens similaires, déjà consultés)
- [ ] Sidebar sticky desktop, bottom sheet + bottom bar mobile fonctionnels
- [ ] Favoris : toggle persistant (auth DB ou localStorage)
- [ ] Partage : copier lien + 4 plateformes fonctionnels
- [ ] Demande de visite : formulaire opérationnel (anonyme + auth), réponse 201, toast succès
- [ ] Demande de réservation : auth required, formulaire opérationnel, redirection vers confirmation
- [ ] Messagerie : création conversation + redirection `/messages/{id}`
- [ ] Avis : liste + note moyenne + distribution affichées ; formulaire visible seulement si auth + éligible
- [ ] Signalement annonce : formulaire + confirmation
- [ ] Carte Leaflet affiche position si lat/lng, sinon message "Position approximative"
- [ ] Biens similaires (≥ 3 si dispo, sinon masqué) et déjà consultés fonctionnent
- [ ] Bien introuvable ou non publié → `not-found.tsx`
- [ ] Compteur `views_count` affiché (déjà incrémenté côté back)

### Design

- [ ] Respect design system : Manrope headlines, Geist body, tokens `bg-primary`, `bg-surface`, arrondis xl/2xl, shadows sm/md
- [ ] Aucun hex hardcodé (sauf `#25D366` WhatsApp existant)
- [ ] `rounded-xl` sur cartes, `rounded-full` sur avatars/badges
- [ ] Transitions `duration-150` hover, `duration-300` modale
- [ ] Responsive testé 375 / 768 / 1440

### Qualité

- [ ] `./vendor/bin/pint` sans diff
- [ ] `php artisan test` 100% vert (dont nouveaux tests §3)
- [ ] `npm run lint` vert
- [ ] `npx tsc --noEmit` 0 error
- [ ] `npm run build` success
- [ ] Aucun `<img>`, `<select>`, `<button>` natif ajouté
- [ ] Tous les textes en FR, prix via `formatPrice()` de `src/lib/utils.ts`

---

## 7. Risques & mitigations

- **Schéma `property_visits`** : vérifier les colonnes `visitor_name/email/phone` avant de coder §3.5 — migration d'ajout si manquantes.
- **Schéma `agencies.is_verified`** : vérifier avant d'exposer dans `agency.verified` — migration d'ajout si manquante.
- **Migration idempotente** : les factories de test exigent des relations (ex. `Address`) — s'assurer que `Property::factory()->published()` crée les relations nécessaires.
- **Leaflet + SSR** : import dynamique `ssr:false` obligatoire (§4.6). Icônes par défaut cassées → CDN unpkg ou icône custom.
- **Lightbox perf** : `next/image` avec `sizes="(max-width: 768px) 100vw, 50vw"` ; `priority` uniquement sur la 1ère photo.
- **Favoris anonymes** : la route `/api/favorites` étant Sanctum, utiliser localStorage tant que non auth. Migrer automatiquement vers l'API au login (hors scope, à noter dans PR).
- **Redirection `/messages/{id}`** : si la page messagerie n'existe pas, créer un stub minimal `src/app/(protected)/messages/[id]/page.tsx` avec "Conversation — UI à venir" pour éviter un 404.
- **Tests flaky** : éviter `RefreshDatabase` + Scout — configurer `scout.driver = 'null'` dans `.env.testing` si besoin.
- **Taille du diff** : phases indépendantes commitables ; la PR finale contient tout mais chaque phase est reviewable isolément.

---

## 8. Hors scope (rappel)

- UI messagerie complète `/messages/[id]` (stub uniquement)
- Signature électronique de documents
- Page `/compare` multi-pages (seul le bouton "Ajouter au comparateur" est ajouté → localStorage)
- Paiement réel (Wave/OM/Stripe)
- Recherches sauvegardées (§2.4)
- Migration auto favoris localStorage → DB au login

---

## 9. Livrables finaux

1. **Branche** : `feat/tck-040-property-detail-full` avec ~25-30 commits atomiques
2. **PR** : vers `main`, titre `[TCK-040] Fiche bien — version finale full`
3. **Ticket TCK-040** : mis à jour, status `done`, AC cochés
4. **Tests** : 7+ nouveaux tests feature backend verts
5. **Screenshots** : 3 captures (mobile 375, tablet 768, desktop 1440)
6. **Pas de changement** de `docs/features.md` ni `docs/models-spec.md`
