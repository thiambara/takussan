# MVP Takussan — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter les 7 tickets du backlog MVP (MVP-001 à MVP-007) pour valider la proposition de valeur : un visiteur voit des annonces immobilières à Dakar et contacte un propriétaire via WhatsApp.

**Architecture:** Backend Laravel minimal avec routes publiques (aucune auth requise pour les visiteurs). Frontend Next.js avec composants React simples, fetch natif, mobile-first. Admin via Filament pour la saisie manuelle des annonces.

**Tech Stack:** Laravel 13 (PHP 8.3), Next.js 16.2.3 (React 19, TypeScript 5, Tailwind CSS 4), Filament (admin), Spatie MediaLibrary (photos), SQLite (dev local)

**North KPI:** 10 contacts WhatsApp/semaine après 100 annonces

---

> **Note:** Une fois ce plan approuvé, sauvegarder ce fichier dans `docs/superpowers/plans/2026-04-16-mvp-implementation.md` pour le retrouver après une pause.

---

## Fichiers créés/modifiés par ticket

```
takussan-api/
├── app/
│   ├── Http/Controllers/Public/PublicPropertyController.php  [MVP-001]
│   ├── Models/Property.php                                   [MVP-001]
│   ├── Models/Enums/PropertyType.php                         [MVP-001]
│   ├── Models/Enums/PropertyStatus.php                       [MVP-001]
│   └── Http/Resources/PropertyResource.php                   [MVP-001]
├── database/
│   ├── migrations/XXXX_create_properties_table.php           [MVP-001]
│   └── seeders/PropertySeeder.php                            [MVP-001]
├── routes/api/
│   └── public.php                                            [MVP-001]
└── tests/Feature/Public/
    ├── PropertyListTest.php                                   [MVP-001]
    ├── PropertyDetailTest.php                                 [MVP-002]
    ├── PropertyContactTest.php                                [MVP-003]
    └── PropertySearchTest.php                                 [MVP-006, MVP-007]

takussan-web/src/
├── app/
│   ├── layout.tsx                   [MVP-001 — layout global]
│   ├── page.tsx                     [MVP-001 — page liste]
│   └── properties/
│       └── [slug]/
│           └── page.tsx             [MVP-002 — page détail]
├── components/
│   ├── layout/
│   │   ├── Header.tsx               [MVP-001]
│   │   └── Footer.tsx               [MVP-001]
│   ├── properties/
│   │   ├── PropertyCard.tsx         [MVP-001]
│   │   ├── PropertyGrid.tsx         [MVP-001]
│   │   ├── PropertySkeleton.tsx     [MVP-001]
│   │   ├── PropertyDetail.tsx       [MVP-002]
│   │   └── PhotoGallery.tsx         [MVP-002]
│   ├── contact/
│   │   └── WhatsAppButton.tsx       [MVP-003]
│   └── search/
│       ├── SearchFilters.tsx        [MVP-006]
│       └── SortDropdown.tsx         [MVP-007]
└── hooks/
    ├── useProperties.ts             [MVP-001]
    ├── useProperty.ts               [MVP-002]
    └── useSearch.ts                 [MVP-006]
```

---

## Tâche 0 : Sauvegarder le plan dans le projet

**Files:**
- Create: `docs/superpowers/plans/2026-04-16-mvp-implementation.md`

- [ ] **Étape 0.1 : Copier ce plan dans le projet**

```bash
mkdir -p docs/superpowers/plans
cp /Users/aminethiam/.claude/plans/abundant-wandering-balloon.md \
   docs/superpowers/plans/2026-04-16-mvp-implementation.md
```

---

## Tâche 1 : Migration Property (MVP-001)

**Files:**
- Create: `takussan-api/database/migrations/XXXX_create_properties_table.php`
- Create: `takussan-api/app/Models/Enums/PropertyType.php`
- Create: `takussan-api/app/Models/Enums/PropertyStatus.php`

- [ ] **Étape 1.1 : Créer les enums**

```bash
cd takussan-api
php artisan make:enum App/Models/Enums/PropertyType
php artisan make:enum App/Models/Enums/PropertyStatus
```

Contenu de `app/Models/Enums/PropertyType.php` :
```php
<?php

namespace App\Models\Enums;

enum PropertyType: string
{
    case Apartment = 'apartment';
    case House     = 'house';
    case Villa     = 'villa';
    case Studio    = 'studio';
    case Land      = 'land';
    case Office    = 'office';
    case Shop      = 'shop';
    case Other     = 'other';

    public function label(): string
    {
        return match($this) {
            self::Apartment => 'Appartement',
            self::House     => 'Maison',
            self::Villa     => 'Villa',
            self::Studio    => 'Studio',
            self::Land      => 'Terrain',
            self::Office    => 'Bureau',
            self::Shop      => 'Commerce',
            self::Other     => 'Autre',
        };
    }
}
```

Contenu de `app/Models/Enums/PropertyStatus.php` :
```php
<?php

namespace App\Models\Enums;

enum PropertyStatus: string
{
    case Draft     = 'draft';
    case Published = 'published';
    case Archived  = 'archived';
}
```

- [ ] **Étape 1.2 : Générer la migration**

```bash
php artisan make:migration create_properties_table
```

Contenu de la migration :
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->string('type')->default('apartment'); // PropertyType enum
            $table->string('status')->default('draft');   // PropertyStatus enum
            $table->unsignedInteger('price');              // FCFA
            $table->string('location_quarter');            // ex: "Almadies"
            $table->string('location_city')->default('Dakar');
            $table->unsignedTinyInteger('bedrooms')->nullable();
            $table->unsignedTinyInteger('bathrooms')->nullable();
            $table->unsignedInteger('area')->nullable();   // m²
            $table->boolean('featured')->default(false);
            $table->string('owner_phone')->nullable();     // +221XXXXXXXXX
            $table->string('main_photo_url')->nullable();  // remplacé par MediaLibrary (MVP-005)
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('properties');
    }
};
```

- [ ] **Étape 1.3 : Exécuter la migration**

```bash
php artisan migrate
```

Expected: `properties` table created.

- [ ] **Étape 1.4 : Commit**

```bash
git add database/migrations/ app/Models/Enums/
git commit -m "feat(mvp-001): add properties migration and PropertyType/Status enums"
```

---

## Tâche 2 : Modèle Property + Seeder (MVP-001)

**Files:**
- Create: `takussan-api/app/Models/Property.php`
- Create: `takussan-api/database/seeders/PropertySeeder.php`
- Modify: `takussan-api/database/seeders/DatabaseSeeder.php`

- [ ] **Étape 2.1 : Créer le modèle Property**

```bash
php artisan make:model Property
```

Contenu de `app/Models/Property.php` :
```php
<?php

namespace App\Models;

use App\Models\Bases\AbstractModel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use Illuminate\Support\Str;

class Property extends AbstractModel
{
    protected $fillable = [
        'title', 'slug', 'description', 'type', 'status',
        'price', 'location_quarter', 'location_city',
        'bedrooms', 'bathrooms', 'area', 'featured',
        'owner_phone', 'main_photo_url', 'published_at',
    ];

    protected $casts = [
        'type'         => PropertyType::class,
        'status'       => PropertyStatus::class,
        'featured'     => 'boolean',
        'published_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Property $property) {
            if (empty($property->slug)) {
                $property->slug = Str::slug($property->title).'-'.Str::random(6);
            }
        });
    }

    public function scopePublished($query)
    {
        return $query->where('status', PropertyStatus::Published);
    }

    public function getLocationAttribute(): array
    {
        return [
            'quarter' => $this->location_quarter,
            'city'    => $this->location_city,
        ];
    }
}
```

- [ ] **Étape 2.2 : Créer le PropertySeeder**

```bash
php artisan make:seeder PropertySeeder
```

Contenu de `database/seeders/PropertySeeder.php` :
```php
<?php

namespace Database\Seeders;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PropertySeeder extends Seeder
{
    public function run(): void
    {
        $quarters = ['Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann', 'Ouakam', 'Yoff', 'Ngor', 'Point E', 'Liberté'];
        $types    = PropertyType::cases();

        for ($i = 1; $i <= 10; $i++) {
            $title = "Bel appartement F{$i} - ".fake()->randomElement($quarters);
            Property::create([
                'title'            => $title,
                'slug'             => Str::slug($title).'-'.Str::random(6),
                'description'      => fake()->paragraphs(3, true),
                'type'             => fake()->randomElement($types)->value,
                'status'           => PropertyStatus::Published->value,
                'price'            => fake()->numberBetween(150_000, 2_000_000),
                'location_quarter' => fake()->randomElement($quarters),
                'location_city'    => 'Dakar',
                'bedrooms'         => fake()->numberBetween(1, 5),
                'bathrooms'        => fake()->numberBetween(1, 3),
                'area'             => fake()->numberBetween(30, 300),
                'featured'         => $i <= 2,
                'owner_phone'      => '+221'.fake()->numerify('7########'),
                'main_photo_url'   => "https://picsum.photos/seed/{$i}/800/533",
                'published_at'     => now(),
            ]);
        }
    }
}
```

Ajouter dans `database/seeders/DatabaseSeeder.php` :
```php
$this->call([
    PropertySeeder::class,
]);
```

- [ ] **Étape 2.3 : Seeder**

```bash
php artisan db:seed --class=PropertySeeder
```

Expected: 10 properties in DB.

- [ ] **Étape 2.4 : Commit**

```bash
git add app/Models/Property.php database/seeders/
git commit -m "feat(mvp-001): add Property model and PropertySeeder with 10 fake listings"
```

---

## Tâche 3 : Test + API publique — liste des annonces (MVP-001)

**Files:**
- Create: `takussan-api/tests/Feature/Public/PropertyListTest.php`
- Create: `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php`
- Create: `takussan-api/app/Http/Resources/PropertyResource.php`
- Create: `takussan-api/routes/api/public.php`

- [ ] **Étape 3.1 : Écrire le test qui échoue**

```bash
php artisan make:test Public/PropertyListTest
```

Contenu de `tests/Feature/Public/PropertyListTest.php` :
```php
<?php

namespace Tests\Feature\Public;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyListTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_paginated_published_properties(): void
    {
        Property::factory()->count(25)->create([
            'status' => PropertyStatus::Published->value,
        ]);
        Property::factory()->count(3)->create([
            'status' => 'draft',
        ]);

        $response = $this->getJson('/api/public/properties');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'title', 'slug', 'price', 'type', 'location', 'bedrooms', 'area', 'featured', 'main_photo_url']],
                'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            ])
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.total', 25);
    }

    public function test_draft_properties_are_excluded(): void
    {
        Property::factory()->create(['status' => 'draft']);

        $response = $this->getJson('/api/public/properties');

        $response->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_featured_properties_appear_first(): void
    {
        Property::factory()->count(5)->create(['status' => PropertyStatus::Published->value, 'featured' => false]);
        $featured = Property::factory()->create([
            'status'   => PropertyStatus::Published->value,
            'featured' => true,
        ]);

        $response = $this->getJson('/api/public/properties');

        $response->assertOk();
        $this->assertEquals($featured->id, $response->json('data.0.id'));
    }

    public function test_no_auth_required(): void
    {
        $response = $this->getJson('/api/public/properties');
        $response->assertOk(); // not 401
    }
}
```

- [ ] **Étape 3.2 : Vérifier que le test échoue**

```bash
php artisan test --filter=PropertyListTest
```

Expected: FAIL (route not found / 404).

- [ ] **Étape 3.3 : Créer la Factory Property**

```bash
php artisan make:factory PropertyFactory --model=Property
```

Contenu de `database/factories/PropertyFactory.php` :
```php
<?php

namespace Database\Factories;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class PropertyFactory extends Factory
{
    public function definition(): array
    {
        $quarters = ['Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann', 'Ouakam', 'Yoff'];
        $title    = fake()->words(4, true);

        return [
            'title'            => ucfirst($title),
            'slug'             => Str::slug($title).'-'.Str::random(6),
            'description'      => fake()->paragraphs(2, true),
            'type'             => fake()->randomElement(PropertyType::cases())->value,
            'status'           => PropertyStatus::Draft->value,
            'price'            => fake()->numberBetween(150_000, 2_000_000),
            'location_quarter' => fake()->randomElement($quarters),
            'location_city'    => 'Dakar',
            'bedrooms'         => fake()->numberBetween(1, 5),
            'bathrooms'        => fake()->numberBetween(1, 2),
            'area'             => fake()->numberBetween(30, 250),
            'featured'         => false,
            'owner_phone'      => '+221'.fake()->numerify('7########'),
            'main_photo_url'   => 'https://picsum.photos/800/533?random='.fake()->numberBetween(1, 100),
            'published_at'     => null,
        ];
    }

    public function published(): static
    {
        return $this->state([
            'status'       => PropertyStatus::Published->value,
            'published_at' => now(),
        ]);
    }
}
```

- [ ] **Étape 3.4 : Créer le PropertyResource**

```bash
php artisan make:resource PropertyResource
```

Contenu de `app/Http/Resources/PropertyResource.php` :
```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PropertyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'title'         => $this->title,
            'slug'          => $this->slug,
            'price'         => $this->price,
            'type'          => $this->type->value,
            'type_label'    => $this->type->label(),
            'location'      => [
                'quarter' => $this->location_quarter,
                'city'    => $this->location_city,
            ],
            'bedrooms'      => $this->bedrooms,
            'bathrooms'     => $this->bathrooms,
            'area'          => $this->area,
            'featured'      => $this->featured,
            'main_photo_url'=> $this->main_photo_url,
            // champs détail (null dans liste)
            'description'   => $this->when($request->routeIs('public.properties.show'), $this->description),
            'owner_phone'   => $this->when($request->routeIs('public.properties.contact'), $this->owner_phone),
            'created_at'    => $this->created_at->toISOString(),
        ];
    }
}
```

- [ ] **Étape 3.5 : Créer le contrôleur public**

```bash
php artisan make:controller Public/PublicPropertyController
```

Contenu de `app/Http/Controllers/Public/PublicPropertyController.php` :
```php
<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Http\Resources\PropertyResource;
use App\Models\Property;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PublicPropertyController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $properties = Property::published()
            ->orderByDesc('featured')
            ->orderByDesc('published_at')
            ->paginate(20);

        return PropertyResource::collection($properties);
    }

    public function show(string $slug): PropertyResource
    {
        $property = Property::published()->where('slug', $slug)->firstOrFail();

        return new PropertyResource($property);
    }

    public function contact(string $slug): JsonResponse
    {
        $property = Property::published()->where('slug', $slug)->firstOrFail();

        $message = "Bonjour, je suis intéressé(e) par votre bien :\n"
            ."{$property->title}\n"
            .number_format($property->price, 0, ',', ' ')." FCFA - {$property->location_quarter}, {$property->location_city}\n"
            ."Vu sur Takussan.sn";

        return response()->json([
            'phone'   => $property->owner_phone,
            'message' => $message,
        ]);
    }
}
```

- [ ] **Étape 3.6 : Créer les routes publiques**

Créer `routes/api/public.php` :
```php
<?php

use App\Http\Controllers\Public\PublicPropertyController;
use Illuminate\Support\Facades\Route;

Route::prefix('public')->name('public.')->group(function () {
    Route::get('properties', [PublicPropertyController::class, 'index'])
        ->name('properties.index');

    Route::get('properties/{slug}', [PublicPropertyController::class, 'show'])
        ->name('properties.show');

    Route::get('properties/{slug}/contact', [PublicPropertyController::class, 'contact'])
        ->name('properties.contact');
});
```

- [ ] **Étape 3.7 : Vérifier que les tests passent**

```bash
php artisan test --filter=PropertyListTest
```

Expected: 4 tests PASS.

- [ ] **Étape 3.8 : Commit**

```bash
git add app/Http/ database/factories/ routes/
git commit -m "feat(mvp-001): public properties API - list endpoint with pagination"
```

---

## Tâche 4 : Frontend — Layout global (MVP-001)

**Files:**
- Modify: `takussan-web/src/app/layout.tsx`
- Create: `takussan-web/src/components/layout/Header.tsx`
- Create: `takussan-web/src/components/layout/Footer.tsx`
- Create: `takussan-web/src/lib/api.ts` (si pas déjà fait)

- [ ] **Étape 4.1 : Définir la couleur primaire**

Dans `tailwind.config.mjs`, ajouter slate comme accent primaire. Le projet utilise Tailwind CSS 4 — éditer le fichier CSS global (`src/app/globals.css`) :

```css
/* src/app/globals.css — ajouter après les imports Tailwind */
:root {
  --color-primary: theme(colors.slate.700);
  --color-primary-hover: theme(colors.slate.800);
}
```

- [ ] **Étape 4.2 : Configurer l'URL de l'API**

Dans `takussan-web/src/lib/api.ts`, vérifier/ajouter :
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002/api';

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Accept': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}
```

Ajouter dans `.env.local` (frontend) :
```
NEXT_PUBLIC_API_URL=http://localhost:8002/api
```

- [ ] **Étape 4.3 : Créer le Header**

```typescript
// src/components/layout/Header.tsx
import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-slate-800 tracking-tight">
          Takussan
        </Link>
        <nav className="text-sm text-stone-600">
          <Link href="/" className="hover:text-slate-800 transition-colors duration-150">
            Annonces
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Étape 4.4 : Créer le Footer**

```typescript
// src/components/layout/Footer.tsx
export function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-stone-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Takussan — Immobilier à Dakar
      </div>
    </footer>
  );
}
```

- [ ] **Étape 4.5 : Mettre à jour le layout principal**

Contenu de `src/app/layout.tsx` (remplacer le contenu existant) :
```typescript
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Takussan — Immobilier à Dakar',
  description: 'Trouvez votre bien immobilier à Dakar, Sénégal.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${geist.className} bg-stone-50 text-stone-900 antialiased`}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Étape 4.6 : Démarrer le serveur de dev et vérifier**

```bash
cd takussan-web && npm run dev
```

Ouvrir http://localhost:3000 — doit afficher le header Takussan et le footer sur fond stone-50.

- [ ] **Étape 4.7 : Commit**

```bash
git add src/app/layout.tsx src/components/layout/ src/lib/api.ts .env.local
git commit -m "feat(mvp-001): global layout - header, footer, design tokens"
```

---

## Tâche 5 : Frontend — Page liste des annonces (MVP-001)

**Files:**
- Create: `takussan-web/src/components/properties/PropertyCard.tsx`
- Create: `takussan-web/src/components/properties/PropertyGrid.tsx`
- Create: `takussan-web/src/components/properties/PropertySkeleton.tsx`
- Create: `takussan-web/src/hooks/useProperties.ts`
- Modify: `takussan-web/src/app/page.tsx`

- [ ] **Étape 5.1 : Créer les types**

Créer `src/types/property.ts` :
```typescript
export type PropertyType =
  | 'apartment' | 'house' | 'villa' | 'studio'
  | 'land' | 'office' | 'shop' | 'other';

export interface PropertyListItem {
  id: number;
  title: string;
  slug: string;
  price: number;
  type: PropertyType;
  type_label: string;
  location: { quarter: string; city: string };
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  featured: boolean;
  main_photo_url: string | null;
  created_at: string;
}

export interface PaginatedProperties {
  data: PropertyListItem[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}
```

- [ ] **Étape 5.2 : Créer le hook useProperties**

```typescript
// src/hooks/useProperties.ts
'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { PaginatedProperties } from '@/types/property';

export function useProperties(page = 1) {
  const [data, setData] = useState<PaginatedProperties | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<PaginatedProperties>(`/public/properties?page=${page}`)
      .then(setData)
      .catch(() => setError('Impossible de charger les annonces.'))
      .finally(() => setLoading(false));
  }, [page]);

  return { data, loading, error };
}
```

- [ ] **Étape 5.3 : Créer le PropertyCard**

```typescript
// src/components/properties/PropertyCard.tsx
import Image from 'next/image';
import Link from 'next/link';
import type { PropertyListItem } from '@/types/property';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency', currency: 'XOF', maximumFractionDigits: 0,
  }).format(price);
}

export function PropertyCard({ property }: { property: PropertyListItem }) {
  const photo = property.main_photo_url ?? 'https://placehold.co/800x533/e7e5e4/a8a29e?text=Photo+à+venir';

  return (
    <Link href={`/properties/${property.slug}`} className="group block">
      <article className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-150">
        <div className="relative aspect-[4/3] bg-stone-200">
          <Image
            src={photo}
            alt={property.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {property.featured && (
            <span className="absolute top-3 left-3 bg-slate-700 text-white text-xs font-medium px-2 py-1 rounded-full">
              À la une
            </span>
          )}
        </div>

        <div className="p-4">
          <p className="text-xs text-stone-500 mb-1">{property.type_label} · {property.location.quarter}</p>
          <h2 className="font-semibold text-stone-900 leading-snug mb-2 line-clamp-2 group-hover:text-slate-700 transition-colors duration-150">
            {property.title}
          </h2>

          <div className="flex items-center gap-3 text-sm text-stone-600 mb-3">
            {property.bedrooms && <span>{property.bedrooms} ch.</span>}
            {property.area && <span>{property.area} m²</span>}
          </div>

          <p className="text-lg font-bold text-slate-800">{formatPrice(property.price)}</p>
        </div>
      </article>
    </Link>
  );
}
```

- [ ] **Étape 5.4 : Créer le skeleton loader**

```typescript
// src/components/properties/PropertySkeleton.tsx
export function PropertySkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-stone-200" />
      <div className="p-4 space-y-3">
        <div className="h-3 bg-stone-200 rounded w-1/3" />
        <div className="h-4 bg-stone-200 rounded w-3/4" />
        <div className="h-4 bg-stone-200 rounded w-1/2" />
        <div className="h-6 bg-stone-200 rounded w-2/5" />
      </div>
    </div>
  );
}
```

- [ ] **Étape 5.5 : Créer la page principale**

```typescript
// src/app/page.tsx
'use client';
import { useState } from 'react';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertySkeleton } from '@/components/properties/PropertySkeleton';
import { useProperties } from '@/hooks/useProperties';

export default function HomePage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useProperties(page);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">Annonces immobilières à Dakar</h1>
        <p className="mt-2 text-stone-500 leading-relaxed">
          Trouvez votre appartement, maison ou villa dans les meilleurs quartiers de Dakar.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-center">
          <p className="font-medium">Impossible de charger les annonces.</p>
          <p className="text-sm mt-1">Vérifiez votre connexion et réessayez.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <PropertySkeleton key={i} />)
          : data?.data.map(p => <PropertyCard key={p.id} property={p} />)
        }
      </div>

      {!loading && data && data.meta.last_page > 1 && (
        <div className="mt-10 flex justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium disabled:opacity-40 hover:bg-stone-100 transition-colors duration-150"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-sm text-stone-600">
            Page {data.meta.current_page} / {data.meta.last_page}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.meta.last_page, p + 1))}
            disabled={page === data.meta.last_page}
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium disabled:opacity-40 hover:bg-stone-100 transition-colors duration-150"
          >
            Suivant
          </button>
        </div>
      )}

      {!loading && data?.data.length === 0 && (
        <div className="py-20 text-center text-stone-400">
          <p className="text-lg font-medium">Aucune annonce disponible pour le moment.</p>
          <p className="text-sm mt-2">Revenez bientôt, de nouveaux biens arrivent chaque semaine.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Étape 5.6 : Vérifier dans le navigateur**

Démarrer le backend :
```bash
cd takussan-api && php artisan serve --port=8002
```

Ouvrir http://localhost:3000 — vérifier :
- Grille de cards avec les 10 annonces du seeder
- Skeleton affiché pendant le chargement
- Pas d'erreur dans la console
- Rendu correct sur mobile (simuler via DevTools)

- [ ] **Étape 5.7 : Commit**

```bash
git add src/
git commit -m "feat(mvp-001): property listing page - grid, cards, skeleton, pagination"
```

---

## Tâche 6 : Test + API détail + page détail (MVP-002)

**Files:**
- Create: `takussan-api/tests/Feature/Public/PropertyDetailTest.php`
- Create: `takussan-web/src/app/properties/[slug]/page.tsx`
- Create: `takussan-web/src/components/properties/PhotoGallery.tsx`
- Create: `takussan-web/src/hooks/useProperty.ts`

- [ ] **Étape 6.1 : Écrire le test de détail**

```php
// tests/Feature/Public/PropertyDetailTest.php
<?php

namespace Tests\Feature\Public;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_full_property_detail(): void
    {
        $property = Property::factory()->create([
            'status' => PropertyStatus::Published->value,
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => ['id', 'title', 'slug', 'price', 'type', 'location', 'bedrooms', 'area', 'description'],
            ]);
    }

    public function test_returns_404_for_unknown_slug(): void
    {
        $response = $this->getJson('/api/public/properties/slug-inexistant');
        $response->assertNotFound();
    }

    public function test_draft_property_returns_404(): void
    {
        $property = Property::factory()->create(['status' => 'draft']);

        $response = $this->getJson("/api/public/properties/{$property->slug}");
        $response->assertNotFound();
    }
}
```

- [ ] **Étape 6.2 : Vérifier que les tests passent**

```bash
php artisan test --filter=PropertyDetailTest
```

Expected: 3 tests PASS (le contrôleur existe déjà depuis Tâche 3).

- [ ] **Étape 6.3 : Créer le hook useProperty**

```typescript
// src/hooks/useProperty.ts
'use client';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { PropertyListItem } from '@/types/property';

export interface PropertyDetail extends PropertyListItem {
  description: string | null;
}

export function useProperty(slug: string) {
  const [data, setData] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: PropertyDetail }>(`/public/properties/${slug}`)
      .then(res => setData(res.data))
      .catch(() => setError('Bien introuvable.'))
      .finally(() => setLoading(false));
  }, [slug]);

  return { data, loading, error };
}
```

- [ ] **Étape 6.4 : Créer le composant PhotoGallery**

```typescript
// src/components/properties/PhotoGallery.tsx
'use client';
import Image from 'next/image';
import { useState } from 'react';

interface Props {
  photos: string[];
  title: string;
}

export function PhotoGallery({ photos, title }: Props) {
  const [active, setActive] = useState(0);
  const list = photos.length > 0 ? photos : ['https://placehold.co/800x533/e7e5e4/a8a29e?text=Aucune+photo'];

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-stone-200">
        <Image
          src={list[active]}
          alt={`${title} — photo ${active + 1}`}
          fill
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
          priority
        />
      </div>

      {list.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((url, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative flex-none w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors duration-150 ${
                i === active ? 'border-slate-700' : 'border-transparent'
              }`}
            >
              <Image src={url} alt={`Miniature ${i + 1}`} fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Étape 6.5 : Créer la page détail**

```typescript
// src/app/properties/[slug]/page.tsx
'use client';
import { useParams } from 'next/navigation';
import { PhotoGallery } from '@/components/properties/PhotoGallery';
import { PropertySkeleton } from '@/components/properties/PropertySkeleton';
import { useProperty } from '@/hooks/useProperty';

function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency', currency: 'XOF', maximumFractionDigits: 0,
  }).format(price);
}

export default function PropertyDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: property, loading, error } = useProperty(slug);

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid lg:grid-cols-[2fr_1fr] gap-8">
        <PropertySkeleton />
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-stone-200 rounded w-3/4" />
          <div className="h-6 bg-stone-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );

  if (error || !property) return (
    <div className="max-w-7xl mx-auto px-4 py-20 text-center text-stone-500">
      <p className="text-lg font-medium">Ce bien est introuvable.</p>
      <a href="/" className="mt-4 inline-block text-slate-700 underline underline-offset-4">
        Retour aux annonces
      </a>
    </div>
  );

  const photos = property.main_photo_url ? [property.main_photo_url] : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <a href="/" className="text-sm text-stone-500 hover:text-slate-700 transition-colors duration-150 mb-6 inline-block">
        ← Retour aux annonces
      </a>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-10">
        {/* Galerie */}
        <PhotoGallery photos={photos} title={property.title} />

        {/* Infos */}
        <div className="space-y-6">
          <div>
            <p className="text-sm text-stone-500 mb-1">{property.type_label} · {property.location.quarter}, {property.location.city}</p>
            <h1 className="text-2xl font-bold text-stone-900 leading-snug">{property.title}</h1>
            <p className="text-3xl font-bold text-slate-800 mt-3">{formatPrice(property.price)}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 py-4 border-y border-stone-200 text-center text-sm">
            {property.bedrooms && (
              <div>
                <p className="font-semibold text-stone-900">{property.bedrooms}</p>
                <p className="text-stone-500">Chambres</p>
              </div>
            )}
            {property.bathrooms && (
              <div>
                <p className="font-semibold text-stone-900">{property.bathrooms}</p>
                <p className="text-stone-500">SDB</p>
              </div>
            )}
            {property.area && (
              <div>
                <p className="font-semibold text-stone-900">{property.area} m²</p>
                <p className="text-stone-500">Surface</p>
              </div>
            )}
          </div>

          {/* WhatsApp button — ajouté par MVP-003 */}
          <div id="contact-button-placeholder" className="h-14 bg-stone-100 rounded-lg flex items-center justify-center text-stone-400 text-sm">
            Bouton WhatsApp (MVP-003)
          </div>

          {property.description && (
            <div>
              <h2 className="font-semibold text-stone-800 mb-2">Description</h2>
              <p className="text-stone-600 leading-relaxed">{property.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Étape 6.6 : Vérifier dans le navigateur**

Cliquer sur une card depuis la liste → la page détail s'affiche avec photo, titre, prix, infos.

- [ ] **Étape 6.7 : Commit**

```bash
git add src/app/properties/ src/hooks/useProperty.ts src/components/properties/PhotoGallery.tsx
git commit -m "feat(mvp-002): property detail page with photo gallery"
```

---

## Tâche 7 : Test + Bouton WhatsApp (MVP-003)

**Files:**
- Create: `takussan-api/tests/Feature/Public/PropertyContactTest.php`
- Create: `takussan-web/src/components/contact/WhatsAppButton.tsx`
- Modify: `takussan-web/src/app/properties/[slug]/page.tsx`

- [ ] **Étape 7.1 : Écrire le test du contact**

```php
// tests/Feature/Public/PropertyContactTest.php
<?php

namespace Tests\Feature\Public;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyContactTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_phone_and_prefilled_message(): void
    {
        $property = Property::factory()->create([
            'status'       => PropertyStatus::Published->value,
            'owner_phone'  => '+221771234567',
            'title'        => 'Appartement Almadies',
            'price'        => 350000,
            'location_quarter' => 'Almadies',
            'location_city'    => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");

        $response->assertOk()
            ->assertJsonStructure(['phone', 'message'])
            ->assertJsonPath('phone', '+221771234567');

        $this->assertStringContainsString('Takussan.sn', $response->json('message'));
        $this->assertStringContainsString('Appartement Almadies', $response->json('message'));
    }

    public function test_contact_returns_404_for_draft(): void
    {
        $property = Property::factory()->create(['status' => 'draft']);
        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");
        $response->assertNotFound();
    }
}
```

- [ ] **Étape 7.2 : Vérifier que les tests passent**

```bash
php artisan test --filter=PropertyContactTest
```

Expected: 2 PASS.

- [ ] **Étape 7.3 : Créer le WhatsAppButton**

```typescript
// src/components/contact/WhatsAppButton.tsx
'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

interface ContactPayload {
  phone: string;
  message: string;
}

interface Props {
  slug: string;
  title: string;
}

export function WhatsAppButton({ slug, title }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleContact() {
    setLoading(true);
    try {
      const res = await apiFetch<ContactPayload>(`/public/properties/${slug}/contact`);
      const phone = res.phone.replace(/\D/g, '');
      const message = encodeURIComponent(res.message);
      const url = `https://wa.me/${phone}?text=${message}`;

      // Analytics tracking
      if (typeof window !== 'undefined' && 'gtag' in window) {
        (window as any).gtag('event', 'contact_attempt', {
          event_category: 'engagement',
          event_label: title,
        });
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Impossible de récupérer les infos de contact. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleContact}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20bb5a] text-white font-semibold py-4 px-6 rounded-lg transition-colors duration-150 disabled:opacity-60"
    >
      {/* WhatsApp icon */}
      <svg className="w-5 h-5 flex-none" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      {loading ? 'Connexion...' : 'Contacter via WhatsApp'}
    </button>
  );
}
```

- [ ] **Étape 7.4 : Intégrer le bouton dans la page détail**

Dans `src/app/properties/[slug]/page.tsx`, remplacer le placeholder par :
```typescript
import { WhatsAppButton } from '@/components/contact/WhatsAppButton';

// Remplacer le div#contact-button-placeholder par :
<div className="sticky bottom-4 lg:static">
  <WhatsAppButton slug={slug} title={property.title} />
</div>
```

- [ ] **Étape 7.5 : Vérifier dans le navigateur**

- Le bouton vert WhatsApp apparaît sur la page détail
- Click → ouvre WhatsApp avec message pré-rempli
- Sur mobile : bouton sticky en bas de l'écran

- [ ] **Étape 7.6 : Commit**

```bash
git add src/components/contact/ src/app/properties/
git commit -m "feat(mvp-003): WhatsApp contact button with pre-filled message and tracking"
```

---

## Tâche 8 : Admin Filament (MVP-004)

**Files:**
- Modify: `takussan-api/composer.json`
- Create: `takussan-api/app/Filament/Resources/PropertyResource.php`

- [ ] **Étape 8.1 : Installer Filament**

```bash
cd takussan-api
composer require filament/filament:"^3.0" -W
php artisan filament:install --panels
```

Quand demandé : ID du panel → `admin`, URL → `/admin`.

- [ ] **Étape 8.2 : Créer un admin user**

```bash
php artisan make:filament-user
# Renseigner : name, email, password
```

- [ ] **Étape 8.3 : Créer le PropertyResource**

```bash
php artisan make:filament-resource Property --generate
```

Éditer `app/Filament/Resources/PropertyResource.php` — remplacer le contenu auto-généré du `form()` :

```php
use Filament\Forms;
use Filament\Forms\Form;
use App\Models\Enums\PropertyType;
use App\Models\Enums\PropertyStatus;

public static function form(Form $form): Form
{
    return $form->schema([
        Forms\Components\Section::make('Informations de base')->schema([
            Forms\Components\TextInput::make('title')
                ->label('Titre')->required()->minLength(10)->maxLength(255)->columnSpanFull(),
            Forms\Components\Select::make('type')
                ->label('Type de bien')->required()
                ->options(collect(PropertyType::cases())->mapWithKeys(
                    fn($t) => [$t->value => $t->label()]
                )),
            Forms\Components\Select::make('status')
                ->label('Statut')->required()
                ->options([
                    'draft'     => 'Brouillon',
                    'published' => 'Publié',
                    'archived'  => 'Archivé',
                ])->default('draft'),
            Forms\Components\TextInput::make('price')
                ->label('Prix (FCFA)')->required()->numeric()->minValue(1),
        ])->columns(2),

        Forms\Components\Section::make('Localisation')->schema([
            Forms\Components\TextInput::make('location_quarter')->label('Quartier')->required(),
            Forms\Components\TextInput::make('location_city')->label('Ville')->required()->default('Dakar'),
        ])->columns(2),

        Forms\Components\Section::make('Caractéristiques')->schema([
            Forms\Components\TextInput::make('bedrooms')->label('Chambres')->numeric()->nullable(),
            Forms\Components\TextInput::make('bathrooms')->label('Salles de bain')->numeric()->nullable(),
            Forms\Components\TextInput::make('area')->label('Surface (m²)')->numeric()->nullable(),
            Forms\Components\Toggle::make('featured')->label('À la une')->default(false),
        ])->columns(4),

        Forms\Components\Section::make('Contact propriétaire')->schema([
            Forms\Components\TextInput::make('owner_phone')
                ->label('Téléphone propriétaire (WhatsApp)')
                ->placeholder('+221771234567')
                ->required()
                ->regex('/^\+221[0-9]{9}$/'),
        ]),

        Forms\Components\Section::make('Description')->schema([
            Forms\Components\Textarea::make('description')
                ->label('Description complète')->minLength(50)->rows(6)->columnSpanFull(),
        ]),
    ]);
}
```

- [ ] **Étape 8.4 : Vérifier l'admin**

```bash
php artisan serve --port=8002
```

Ouvrir http://localhost:8002/admin — se connecter et créer une annonce de test. Vérifier qu'elle apparaît dans l'API publique une fois le statut "Publié".

- [ ] **Étape 8.5 : Commit**

```bash
git add app/Filament/ composer.json composer.lock
git commit -m "feat(mvp-004): Filament admin panel with PropertyResource CRUD"
```

---

## Tâche 9 : Upload photos Spatie MediaLibrary (MVP-005)

**Files:**
- Modify: `takussan-api/app/Models/Property.php`
- Create: `takussan-api/database/migrations/XXXX_create_media_table.php` (auto-généré)
- Modify: `takussan-api/app/Filament/Resources/PropertyResource.php`
- Modify: `takussan-api/app/Http/Resources/PropertyResource.php`

- [ ] **Étape 9.1 : Installer Spatie MediaLibrary**

```bash
composer require spatie/laravel-medialibrary:"^11.0"
php artisan vendor:publish --provider="Spatie\MediaLibrary\MediaLibraryServiceProvider" --tag="medialibrary-migrations"
php artisan migrate
```

- [ ] **Étape 9.2 : Configurer Property pour MediaLibrary**

Dans `app/Models/Property.php`, ajouter :
```php
use Spatie\MediaLibrary\HasMedia;
use Spatie\MediaLibrary\InteractsWithMedia;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class Property extends AbstractModel implements HasMedia
{
    use InteractsWithMedia;

    public function registerMediaCollections(): void
    {
        $this->addMediaCollection('photos')
            ->acceptsMimeTypes(['image/jpeg', 'image/png', 'image/webp'])
            ->useFallbackUrl('https://placehold.co/800x533/e7e5e4/a8a29e?text=Aucune+photo');
    }

    public function registerMediaConversions(?Media $media = null): void
    {
        $this->addMediaConversion('thumbnail')
            ->width(300)->height(225)->format('webp')->nonQueued();

        $this->addMediaConversion('medium')
            ->width(800)->height(600)->format('webp')->nonQueued();

        $this->addMediaConversion('large')
            ->width(1200)->height(900)->format('webp')->nonQueued();
    }
}
```

- [ ] **Étape 9.3 : Mettre à jour le PropertyResource API**

Dans `app/Http/Resources/PropertyResource.php`, remplacer `main_photo_url` :
```php
'main_photo_url' => $this->getFirstMediaUrl('photos', 'medium') ?: $this->main_photo_url,
'photos'         => $this->when(
    $request->routeIs('public.properties.show'),
    fn() => $this->getMedia('photos')->map(fn($m) => [
        'thumbnail' => $m->getUrl('thumbnail'),
        'medium'    => $m->getUrl('medium'),
        'large'     => $m->getUrl('large'),
    ])->toArray()
),
```

- [ ] **Étape 9.4 : Ajouter l'upload dans Filament**

Dans `PropertyResource.php`, dans la section photos du form :
```php
Forms\Components\Section::make('Photos')->schema([
    Forms\Components\SpatieMediaLibraryFileUpload::make('photos')
        ->collection('photos')
        ->multiple()
        ->maxFiles(10)
        ->maxSize(5120)  // 5MB
        ->acceptedFileTypes(['image/jpeg', 'image/png', 'image/webp'])
        ->reorderable()
        ->label('Photos du bien'),
]),
```

Ajouter la dépendance Filament pour MediaLibrary :
```bash
composer require filament/spatie-laravel-media-library-plugin:"^3.0"
```

- [ ] **Étape 9.5 : Mettre à jour PhotoGallery dans le frontend**

Modifier `src/types/property.ts` pour ajouter les photos dans `PropertyDetail` :
```typescript
export interface PropertyDetail extends PropertyListItem {
  description: string | null;
  photos: Array<{ thumbnail: string; medium: string; large: string }> | null;
}
```

Dans `src/app/properties/[slug]/page.tsx`, extraire les URLs pour la galerie :
```typescript
const photos = property.photos
  ? property.photos.map(p => p.medium)
  : property.main_photo_url
    ? [property.main_photo_url]
    : [];
```

- [ ] **Étape 9.6 : Vérifier**

Via l'admin : uploader 3+ photos sur une annonce. Sur la page détail publique : les miniatures doivent apparaître dans la galerie.

- [ ] **Étape 9.7 : Commit**

```bash
git add app/Models/Property.php app/Filament/ app/Http/Resources/ src/
git commit -m "feat(mvp-005): photo upload with Spatie MediaLibrary, WebP conversions, gallery"
```

---

## Tâche 10 : Test + API de recherche filtrée (MVP-006)

**Files:**
- Create: `takussan-api/tests/Feature/Public/PropertySearchTest.php`
- Create: `takussan-api/database/migrations/XXXX_add_indexes_to_properties_table.php`
- Modify: `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php`
- Create: `takussan-web/src/components/search/SearchFilters.tsx`
- Create: `takussan-web/src/hooks/useSearch.ts`

- [ ] **Étape 10.1 : Écrire les tests de recherche**

```php
// tests/Feature/Public/PropertySearchTest.php
<?php

namespace Tests\Feature\Public;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertySearchTest extends TestCase
{
    use RefreshDatabase;

    private function published(array $attrs = []): Property
    {
        return Property::factory()->create(array_merge(
            ['status' => PropertyStatus::Published->value],
            $attrs
        ));
    }

    public function test_filter_by_location(): void
    {
        $this->published(['location_quarter' => 'Almadies']);
        $this->published(['location_quarter' => 'Plateau']);

        $response = $this->getJson('/api/public/properties/search?location=Almadies');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals('Almadies', $response->json('data.0.location.quarter'));
    }

    public function test_filter_by_price_range(): void
    {
        $this->published(['price' => 100_000]);
        $this->published(['price' => 300_000]);
        $this->published(['price' => 800_000]);

        $response = $this->getJson('/api/public/properties/search?price_min=200000&price_max=500000');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals(300_000, $response->json('data.0.price'));
    }

    public function test_filter_by_bedrooms(): void
    {
        $this->published(['bedrooms' => 1]);
        $this->published(['bedrooms' => 3]);

        $response = $this->getJson('/api/public/properties/search?bedrooms=3');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals(3, $response->json('data.0.bedrooms'));
    }

    public function test_returns_facets(): void
    {
        $this->published(['location_quarter' => 'Almadies', 'bedrooms' => 2]);
        $this->published(['location_quarter' => 'Almadies', 'bedrooms' => 3]);
        $this->published(['location_quarter' => 'Plateau',  'bedrooms' => 2]);

        $response = $this->getJson('/api/public/properties/search');

        $response->assertOk()->assertJsonStructure(['data', 'facets' => ['locations', 'bedrooms'], 'meta']);
        $this->assertEquals(2, $response->json('facets.locations.Almadies'));
    }
}
```

- [ ] **Étape 10.2 : Vérifier que les tests échouent**

```bash
php artisan test --filter=PropertySearchTest
```

Expected: FAIL (route inexistante).

- [ ] **Étape 10.3 : Ajouter la migration d'index**

```bash
php artisan make:migration add_search_indexes_to_properties_table
```

```php
public function up(): void
{
    Schema::table('properties', function (Blueprint $table) {
        $table->index(['status', 'featured', 'published_at']);
        $table->index(['status', 'price']);
        $table->index(['status', 'bedrooms']);
        $table->index(['status', 'location_quarter']);
    });
}
```

```bash
php artisan migrate
```

- [ ] **Étape 10.4 : Ajouter la méthode search dans le contrôleur**

Dans `PublicPropertyController.php`, ajouter :
```php
use Illuminate\Http\Request;

public function search(Request $request): array
{
    $validated = $request->validate([
        'location'  => 'nullable|string|max:100',
        'price_min' => 'nullable|integer|min:0',
        'price_max' => 'nullable|integer|min:0',
        'bedrooms'  => 'nullable|integer|min:1|max:10',
        'sort'      => 'nullable|in:relevance,price_asc,price_desc,created_desc',
        'page'      => 'nullable|integer|min:1',
    ]);

    $query = Property::published();

    if (!empty($validated['location'])) {
        $query->where('location_quarter', $validated['location']);
    }
    if (!empty($validated['price_min'])) {
        $query->where('price', '>=', $validated['price_min']);
    }
    if (!empty($validated['price_max'])) {
        $query->where('price', '<=', $validated['price_max']);
    }
    if (!empty($validated['bedrooms'])) {
        $query->where('bedrooms', $validated['bedrooms']);
    }

    // Facets (computed before pagination)
    $facets = [
        'locations' => (clone $query)->selectRaw('location_quarter, count(*) as cnt')
            ->groupBy('location_quarter')
            ->pluck('cnt', 'location_quarter')
            ->toArray(),
        'bedrooms'  => (clone $query)->selectRaw('bedrooms, count(*) as cnt')
            ->whereNotNull('bedrooms')
            ->groupBy('bedrooms')
            ->pluck('cnt', 'bedrooms')
            ->toArray(),
    ];

    // Sort (MVP-007 will expand this)
    $sort = $validated['sort'] ?? 'relevance';
    match($sort) {
        'price_asc'    => $query->orderBy('price'),
        'price_desc'   => $query->orderByDesc('price'),
        'created_desc' => $query->orderByDesc('created_at'),
        default        => $query->orderByDesc('featured')->orderByDesc('published_at'),
    };

    $paginated = $query->paginate(20);

    return [
        'data'   => PropertyResource::collection($paginated)->resolve(),
        'facets' => $facets,
        'meta'   => [
            'current_page' => $paginated->currentPage(),
            'last_page'    => $paginated->lastPage(),
            'per_page'     => $paginated->perPage(),
            'total'        => $paginated->total(),
        ],
    ];
}
```

- [ ] **Étape 10.5 : Ajouter la route de recherche**

Dans `routes/api/public.php`, ajouter :
```php
Route::get('properties/search', [PublicPropertyController::class, 'search'])
    ->name('properties.search');
```

⚠️ Cette route doit être **avant** `properties/{slug}` sinon "search" sera capturé comme slug.

- [ ] **Étape 10.6 : Vérifier que les tests passent**

```bash
php artisan test --filter=PropertySearchTest
```

Expected: 4 PASS.

- [ ] **Étape 10.7 : Créer le hook useSearch**

```typescript
// src/hooks/useSearch.ts
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { PaginatedProperties } from '@/types/property';

interface Facets {
  locations: Record<string, number>;
  bedrooms: Record<string, number>;
}

interface SearchResult extends PaginatedProperties {
  facets: Facets;
}

interface Filters {
  location?: string;
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  sort?: string;
}

export function useSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtersFromUrl: Filters = {
    location:  searchParams.get('location') ?? undefined,
    price_min: searchParams.get('price_min') ? Number(searchParams.get('price_min')) : undefined,
    price_max: searchParams.get('price_max') ? Number(searchParams.get('price_max')) : undefined,
    bedrooms:  searchParams.get('bedrooms')  ? Number(searchParams.get('bedrooms'))  : undefined,
    sort:      searchParams.get('sort') ?? undefined,
  };

  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(filtersFromUrl);

  const buildQuery = (f: Filters) =>
    Object.entries(f)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join('&');

  const search = useCallback((f: Filters) => {
    setFilters(f);
    const qs = buildQuery(f);
    router.push(`${pathname}${qs ? '?' + qs : ''}`);
    setLoading(true);
    apiFetch<SearchResult>(`/public/properties/search${qs ? '?' + qs : ''}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router, pathname]);

  useEffect(() => {
    search(filtersFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, filters, search };
}
```

- [ ] **Étape 10.8 : Créer le composant SearchFilters**

```typescript
// src/components/search/SearchFilters.tsx
'use client';

const QUARTERS = [
  'Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann',
  'Ouakam', 'Yoff', 'Ngor', 'Point E', 'Liberté',
  'Grand Yoff', 'Biscuiterie', 'HLM', 'Sicap', 'Diamniadio',
];

const PRICE_RANGES = [
  { label: '< 200 000 FCFA', min: 0, max: 200_000 },
  { label: '200 000 – 500 000', min: 200_000, max: 500_000 },
  { label: '500 000 – 1 M', min: 500_000, max: 1_000_000 },
  { label: '> 1 M', min: 1_000_000, max: undefined },
];

interface Filters {
  location?: string;
  price_min?: number;
  price_max?: number;
  bedrooms?: number;
  sort?: string;
}

interface Props {
  filters: Filters;
  onSearch: (f: Filters) => void;
}

export function SearchFilters({ filters, onSearch }: Props) {
  function update(patch: Partial<Filters>) {
    onSearch({ ...filters, ...patch });
  }

  function clear() {
    onSearch({});
  }

  const hasFilters = Object.values(filters).some(v => v !== undefined && v !== '');

  return (
    <aside className="bg-white rounded-xl shadow-sm p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">Filtres</h2>
        {hasFilters && (
          <button onClick={clear} className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-800">
            Tout effacer
          </button>
        )}
      </div>

      {/* Quartier */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Quartier</label>
        <select
          value={filters.location ?? ''}
          onChange={e => update({ location: e.target.value || undefined })}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">Tous les quartiers</option>
          {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </div>

      {/* Budget */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Budget</label>
        <div className="space-y-2">
          {PRICE_RANGES.map(range => (
            <label key={range.label} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="price_range"
                checked={filters.price_min === range.min && filters.price_max === range.max}
                onChange={() => update({ price_min: range.min || undefined, price_max: range.max })}
                className="accent-slate-700"
              />
              {range.label}
            </label>
          ))}
        </div>
      </div>

      {/* Chambres */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Chambres</label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => update({ bedrooms: filters.bedrooms === n ? undefined : n })}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors duration-150 ${
                filters.bedrooms === n
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {n === 5 ? '5+' : n}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Étape 10.9 : Intégrer la recherche dans la page principale**

Mettre à jour `src/app/page.tsx` pour utiliser `useSearch` et `SearchFilters` :
```typescript
'use client';
import { Suspense } from 'react';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertySkeleton } from '@/components/properties/PropertySkeleton';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SortDropdown } from '@/components/search/SortDropdown'; // MVP-007
import { useSearch } from '@/hooks/useSearch';

function HomeContent() {
  const { data, loading, filters, search } = useSearch();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900">Annonces immobilières à Dakar</h1>
        <p className="mt-2 text-stone-500 leading-relaxed">
          Trouvez votre appartement, maison ou villa dans les meilleurs quartiers de Dakar.
        </p>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-8">
        <SearchFilters filters={filters} onSearch={search} />

        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-500">
              {data ? `${data.meta.total} annonce${data.meta.total > 1 ? 's' : ''}` : ''}
            </p>
            {/* SortDropdown ajouté en MVP-007 */}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <PropertySkeleton key={i} />)
              : data?.data.map(p => <PropertyCard key={p.id} property={p} />)
            }
          </div>

          {!loading && data?.data.length === 0 && (
            <div className="py-20 text-center text-stone-400">
              <p className="text-lg font-medium">Aucune annonce ne correspond à vos critères.</p>
              <p className="text-sm mt-2">Essayez d'élargir vos filtres.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
```

- [ ] **Étape 10.10 : Vérifier dans le navigateur**

- Filtres visibles à gauche (desktop)
- Sélection d'un quartier → liste filtrée instantanément
- URL mise à jour (`/?location=Almadies`)
- Partager l'URL → filtres restaurés

- [ ] **Étape 10.11 : Commit**

```bash
git add tests/Feature/Public/PropertySearchTest.php \
        app/Http/Controllers/Public/PublicPropertyController.php \
        database/migrations/ routes/ \
        src/components/search/ src/hooks/useSearch.ts src/app/page.tsx
git commit -m "feat(mvp-006): search filters - location, price range, bedrooms, URL sync, facets"
```

---

## Tâche 11 : Tri des résultats (MVP-007)

**Files:**
- Create: `takussan-web/src/components/search/SortDropdown.tsx`
- Modify: `takussan-web/src/app/page.tsx`

- [ ] **Étape 11.1 : Créer le SortDropdown**

```typescript
// src/components/search/SortDropdown.tsx
'use client';

const SORT_OPTIONS = [
  { value: 'relevance',    label: '⭐ Pertinence' },
  { value: 'price_asc',   label: '↑ Prix croissant' },
  { value: 'price_desc',  label: '↓ Prix décroissant' },
  { value: 'created_desc',label: '🕐 Plus récents' },
] as const;

type SortValue = typeof SORT_OPTIONS[number]['value'];

interface Props {
  value?: string;
  onChange: (sort: SortValue) => void;
}

export function SortDropdown({ value, onChange }: Props) {
  return (
    <select
      value={value ?? 'relevance'}
      onChange={e => onChange(e.target.value as SortValue)}
      className="border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
    >
      {SORT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
```

- [ ] **Étape 11.2 : Intégrer le SortDropdown dans la page**

Dans `src/app/page.tsx`, dans la section `{/* SortDropdown ajouté en MVP-007 */}` :
```typescript
import { SortDropdown } from '@/components/search/SortDropdown';

// Remplacer le commentaire par :
<SortDropdown
  value={filters.sort}
  onChange={sort => search({ ...filters, sort })}
/>
```

- [ ] **Étape 11.3 : Vérifier dans le navigateur**

- Dropdown de tri visible en haut des résultats
- Changer le tri → résultats réordonnés, URL mise à jour (`?sort=price_asc`)
- Le tri combine avec les filtres (ex: quartier Almadies + prix croissant)

- [ ] **Étape 11.4 : Tests backend complémentaires**

Ajouter dans `PropertySearchTest.php` :
```php
public function test_sort_by_price_ascending(): void
{
    $this->published(['price' => 500_000]);
    $this->published(['price' => 100_000]);
    $this->published(['price' => 300_000]);

    $response = $this->getJson('/api/public/properties/search?sort=price_asc');

    $response->assertOk();
    $prices = collect($response->json('data'))->pluck('price')->toArray();
    $this->assertEquals([100_000, 300_000, 500_000], $prices);
}

public function test_sort_by_price_descending(): void
{
    $this->published(['price' => 500_000]);
    $this->published(['price' => 100_000]);
    $this->published(['price' => 300_000]);

    $response = $this->getJson('/api/public/properties/search?sort=price_desc');

    $response->assertOk();
    $prices = collect($response->json('data'))->pluck('price')->toArray();
    $this->assertEquals([500_000, 300_000, 100_000], $prices);
}
```

```bash
php artisan test --filter=PropertySearchTest
```

Expected: 6 PASS.

- [ ] **Étape 11.5 : Commit final**

```bash
git add src/components/search/SortDropdown.tsx src/app/page.tsx tests/
git commit -m "feat(mvp-007): sort dropdown - relevance, price asc/desc, most recent"
```

---

## Vérification end-to-end

- [ ] **Backend complet**
```bash
cd takussan-api
php artisan migrate:fresh --seed
php artisan test
# Expected: tous les tests PASS
```

- [ ] **Frontend complet**
```bash
cd takussan-web
npm run build
npm run lint
```

- [ ] **Parcours visiteur complet**
1. Ouvrir http://localhost:3000
2. Voir la grille d'annonces avec skeleton → puis cards
3. Filtrer par quartier "Almadies" → liste filtrée, URL mise à jour
4. Trier par "Prix croissant" → ordre correct
5. Cliquer sur une card → page détail avec galerie
6. Cliquer "Contacter via WhatsApp" → WhatsApp s'ouvre avec message pré-rempli

- [ ] **Admin**
1. Ouvrir http://localhost:8002/admin
2. Créer une annonce avec photos
3. La publier
4. Vérifier qu'elle apparaît sur le site public

---

## Suites recommandées (après MVP validé)

Une fois atteint 10 contacts/semaine pendant 2 semaines consécutives → activer POST-MVP :
- POST-MVP-001 : Auth seekers (TCK-013)
- POST-MVP-002 : Dashboard propriétaire

---

*Plan sauvegardé : 2026-04-16 | Takussan MVP*
