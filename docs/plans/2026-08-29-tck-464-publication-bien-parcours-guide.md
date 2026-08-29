# TCK-464 — Parcours guidé de publication d'un bien · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le formulaire de publication d'un bien par un parcours guidé en six étapes dont
les champs sont conditionnés au type de bien, et corriger le circuit d'écriture qui perd l'adresse
et refuse quatre champs pourtant spécifiés.

**Architecture:** Une table de vérité déclarative (`field-matrix.ts`) répond à « ce champ
existe-t-il pour ce bien ? » et est lue par les trois consommateurs — le parcours de création,
la page d'édition, et la sérialisation du payload. Le parcours est une coquille CSS pure (aucune
bibliothèque d'animation) qui monte une étape à la fois ; la validation est déclenchée champ par
champ via `form.trigger()`. L'adresse part imbriquée dans le `POST /api/properties`, que le backend
accepte déjà.

**Tech Stack:** Next.js 16.3.1 · React 19 (React Compiler, ADR-0015) · TypeScript 5 · Tailwind CSS 4
· react-hook-form + Zod (via `useApiForm`) · next-intl (`fr`/`en`/`wo`) · vitest + Testing Library
· Laravel 13 / PHP 8.4 · PostgreSQL 17 · PHPUnit.

## Global Constraints

- **Ticket :** `docs/backlog/tickets/TCK-464-publication-bien-parcours-guide.md`. Les AC1→AC10 y
  sont la définition du fini. Ne pas les recopier ici — les relire avant chaque tâche.
- **Pint avant chaque commit backend** : `./vendor/bin/pint` (pas `--test`) depuis `takussan-api/`.
  Une seule violation a bloqué la CI six semaines.
- **PostgreSQL est un prérequis dur des tests backend** : `docker compose up -d postgres` avant
  toute exécution. `phpunit.xml` force `pgsql` sans repli (ADR-0020).
- **Ne jamais lancer la suite entière depuis un agent délégué.** Un agent lance les classes qu'il
  touche, ou `php bin/impacted-tests.php --run`. La suite entière est lancée **une fois, à la fin**,
  par la session déléguante.
- **Parité i18n exacte `fr` / `en` / `wo`** : toute clé ajoutée l'est dans les trois dictionnaires,
  sinon `scripts/check-i18n.mjs` rougit. Le repli silencieux vers `fr` masque l'oubli à l'écran.
- **Aucun `useCallback` / `useMemo` manuel** dans les composants touchés : le React Compiler s'en
  charge (ADR-0015), et `react-hooks/preserve-manual-memoization` fait **abandonner** la compilation
  du composant entier quand il en trouve un.
- **Design** : palette Lin, `font-display` (Bricolage Grotesque) pour les titres, `font-sans`
  (DM Sans) ailleurs, primitives `base-nova` sur `@base-ui/react`. **Aucune dépendance Radix.**
  Référence : `docs/design-guidelines.md`.
- **Aucune bibliothèque d'animation.** Le dépôt n'a ni framer-motion ni équivalent ; les animations
  vivent en `@keyframes` dans `src/app/globals.css` (voir `fadeInUp`, `cardEnter`, `sectionEnter`).
- **Cibles de vérification finale :** `./vendor/bin/pint --test` · `php artisan test` ·
  `npm run lint` · `npx tsc --noEmit` · `npm run test` · `for g in scripts/check-*.mjs; do node "$g"; done`

---

## File Structure

**`takussan-api/`**

| Fichier | Responsabilité | Action |
|---|---|---|
| `app/Http/Requests/Api/StorePropertyRequest.php` | règles de création | modifier (2 règles) |
| `app/Http/Requests/UpdatePropertyRequest.php` | règles de mise à jour | modifier (4 règles) |
| `app/Http/Resources/PropertyResource.php` | forme JSON du bien | modifier (1 clé) |
| `tests/Feature/Api/Property/PropertyWritableFieldsTest.php` | preuve des 4 champs | créer |

**`takussan-web/`**

| Fichier | Responsabilité | Action |
|---|---|---|
| `src/components/property-form/field-matrix.ts` | **la** règle de pertinence (type, contrat) → champs | créer |
| `src/components/property-form/__tests__/field-matrix.test.ts` | preuve de la règle | créer |
| `src/components/property-form/payload.ts` | valeurs de formulaire → payload API (adresse imbriquée, purge) | créer |
| `src/components/property-form/__tests__/payload.test.ts` | preuve AC1 + AC4 | créer |
| `src/lib/schemas/property.ts` | schéma Zod | modifier (4 champs) |
| `src/components/property-form/options.ts` | vocabulaires d'enum | modifier (`titleType`) |
| `src/hooks/useGeoSuggestion.ts` | suggestion géo dérivée d'`UserLocationProvider` | créer |
| `src/hooks/__tests__/useGeoSuggestion.test.ts` | preuve AC6 | créer |
| `src/components/property-form/wizard/WizardShell.tsx` | coquille : progression, transitions, navigation | créer |
| `src/components/property-form/wizard/steps/StepBien.tsx` | étape 1 — type + contrat | créer |
| `src/components/property-form/wizard/steps/StepLieu.tsx` | étape 2 — adresse + carte | créer |
| `src/components/property-form/wizard/steps/StepCaracteristiques.tsx` | étape 3 — pilotée par la matrice | créer |
| `src/components/property-form/wizard/steps/StepPrix.tsx` | étape 4 — prix + location | créer |
| `src/components/property-form/wizard/steps/StepPhotos.tsx` | étape 5 — médias | créer |
| `src/components/property-form/wizard/steps/StepFinition.tsx` | étape 6 — titre composé + récap | créer |
| `src/components/property-form/wizard/suggest-title.ts` | composition du titre | créer |
| `src/components/property-form/PropertyWizard.tsx` | assemblage : formulaire, étapes, soumission | créer |
| `src/components/property-form/PropertyForm.tsx` | **édition** — page dense alignée sur la matrice | modifier |
| `src/components/property-form/index.ts` | exports | modifier |
| `src/app/(dashboard)/app/properties/new/page.tsx` | route de création | modifier |
| `src/app/globals.css` | keyframes du parcours + garde `prefers-reduced-motion` **portée** | modifier |
| `src/types/property.ts` | `available_from`, `PropertyTitleType` | modifier |
| `src/messages/{fr,en,wo}.json` | libellés | modifier |
| `src/types/__tests__/property-labels.parity.test.ts` | garde de parité des libellés | modifier (`GROUPES`) |

**Découpage :** le fichier `PropertyForm.tsx` actuel fait 617 lignes et mêle rendu, sérialisation et
orchestration de quatre appels réseau. Les trois responsabilités sortent en modules testables sans
DOM (`field-matrix`, `payload`, `suggest-title`) ; c'est ce qui rend les tâches 2, 3 et 8 vérifiables
en TDD pur, sans rendu.

---

## Task 1 : Backend — les quatre champs injoignables

**Files:**
- Modify: `takussan-api/app/Http/Requests/Api/StorePropertyRequest.php:38-68`
- Modify: `takussan-api/app/Http/Requests/UpdatePropertyRequest.php:35-66`
- Modify: `takussan-api/app/Http/Resources/PropertyResource.php:72-80`
- Test: `takussan-api/tests/Feature/Api/Property/PropertyWritableFieldsTest.php`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `POST /api/properties` et `PUT /api/properties/{id}` acceptent `title_type`
  (`bail|titre_foncier|deliberation|autre`), `floor_number`, `total_floors` et
  `address.postal_code`. `GET` émet `available_from` (format ISO date, ou `null`).

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-api/tests/Feature/Api/Property/PropertyWritableFieldsTest.php` :

```php
<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\TitleType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-464 — quatre champs SPÉCIFIÉS (docs/models-spec.md#3-property) que le circuit d'écriture
 * refusait ou ne relisait pas. Ils sont dans `$fillable`, castés, et pour trois d'entre eux déjà
 * exposés en LECTURE : le trou était dans les FormRequest seuls.
 *
 * ⚠ Chaque cas vérifie la valeur RELUE, jamais le seul code 200 : une règle de validation absente
 * ne produit pas d'erreur, elle produit un `validated()` amputé — donc un 200 parfaitement vert
 * sur une écriture qui n'a rien écrit. C'est exactement ce que ce fichier existe pour attraper.
 */
class PropertyWritableFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function acteur(): User
    {
        $agency = Agency::factory()->create();

        return User::factory()->create(['agency_id' => $agency->id]);
    }

    /** @return array<string, mixed> */
    private function payloadMinimal(): array
    {
        return [
            'title' => 'Terrain de test',
            'type' => 'land',
            'contract_type' => 'sale',
            'price' => 25_000_000,
        ];
    }

    public function test_title_type_est_persiste_a_la_creation(): void
    {
        $reponse = $this->actingAs($this->acteur())
            ->postJson('/api/properties', $this->payloadMinimal() + [
                'title_type' => TitleType::TitreFoncier->value,
            ]);

        $reponse->assertCreated();
        $this->assertSame(
            TitleType::TitreFoncier,
            Property::query()->findOrFail($reponse->json('data.id'))->title_type,
        );
    }

    public function test_title_type_est_modifiable(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'title_type' => TitleType::Bail,
        ]);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['title_type' => TitleType::Deliberation->value])
            ->assertOk();

        $this->assertSame(TitleType::Deliberation, $bien->refresh()->title_type);
    }

    public function test_les_etages_sont_modifiables(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'floor_number' => 2,
            'total_floors' => 5,
        ]);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['floor_number' => 7, 'total_floors' => 9])
            ->assertOk();

        $bien->refresh();
        $this->assertSame(7, $bien->floor_number);
        $this->assertSame(9, $bien->total_floors);
    }

    public function test_le_code_postal_est_persiste_des_deux_cotes(): void
    {
        $user = $this->acteur();

        $creation = $this->actingAs($user)->postJson('/api/properties', $this->payloadMinimal() + [
            'address' => ['city' => 'Dakar', 'postal_code' => '10700'],
        ]);
        $creation->assertCreated();

        $bien = Property::query()->with('address')->findOrFail($creation->json('data.id'));
        $this->assertSame('10700', $bien->address->postal_code);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['address' => ['postal_code' => '11000']])
            ->assertOk();

        $this->assertSame('11000', $bien->refresh()->address->postal_code);
    }

    public function test_available_from_est_relu_dans_la_reponse(): void
    {
        $user = $this->acteur();

        $creation = $this->actingAs($user)->postJson('/api/properties', $this->payloadMinimal() + [
            'contract_type' => 'rent',
            'available_from' => '2026-10-01',
        ]);

        $creation->assertCreated();
        $this->assertNotNull(
            $creation->json('data.available_from'),
            'available_from est accepté en écriture mais absent de PropertyResource : '
            .'le champ ne peut jamais être relu, donc jamais pré-rempli à l’édition.',
        );
    }
}
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd takussan-api && docker compose -f ../docker-compose.yml up -d postgres
php artisan test --filter=PropertyWritableFieldsTest
```

Attendu : **5 échecs**. `title_type` reste `null` (aucune règle ne le déclare), `floor_number`
reste à `2` après un PUT à `7`, `postal_code` reste `null`, `available_from` est absent du JSON.

- [ ] **Step 3 : Ajouter les règles de création**

Dans `StorePropertyRequest::rules()`, après la ligne `'rent_period' => …` :

```php
'title_type' => ['nullable', Rule::enum(TitleType::class)],
```

et après `'address.country' => …` :

```php
'address.postal_code' => ['nullable', 'string', 'max:20'],
```

Ajouter l'import `use App\Models\Enums\TitleType;` en tête de fichier.

- [ ] **Step 4 : Ajouter les règles de mise à jour**

Dans `UpdatePropertyRequest::rules()`, après `'rent_period' => …` :

```php
'title_type' => ['sometimes', 'nullable', Rule::enum(TitleType::class)],
'floor_number' => ['sometimes', 'nullable', 'integer', 'min:-5', 'max:200'],
'total_floors' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:200'],
```

> `min:-5` sur `floor_number` n'est pas une coquetterie : un sous-sol est un étage négatif, et
> `StorePropertyRequest` accepte déjà l'entier sans plancher. Poser `min:0` ici rendrait le champ
> créable et non modifiable pour un parking en sous-sol — soit exactement le défaut qu'on corrige,
> déplacé d'un cran.

et après `'address.country' => …` :

```php
'address.postal_code' => ['sometimes', 'nullable', 'string', 'max:20'],
```

Ajouter l'import `use App\Models\Enums\TitleType;`.

- [ ] **Step 5 : Exposer `available_from` en lecture**

Dans `PropertyResource::toArray()`, juste après la ligne `'parking_spaces' => $this->whenHas('parking_spaces'),` :

```php
'available_from' => $this->whenHas('available_from', fn ($valeur) => $valeur?->toDateString()),
```

> `whenHas` et non un accès nu : ces endpoints passent par `fields[properties]=…`, et un accès nu
> sur une colonne non sélectionnée rend `null` — soit une VALEUR MESURÉE là où il n'y a pas eu de
> mesure (TCK-336). `available_from` est casté en `date`, d'où le `?->toDateString()`.

- [ ] **Step 6 : Relancer le test**

```bash
php artisan test --filter=PropertyWritableFieldsTest
```

Attendu : **PASS** — 5 tests, 0 échec.

- [ ] **Step 7 : Pint puis commit**

```bash
cd takussan-api && ./vendor/bin/pint
git add app/Http/Requests/Api/StorePropertyRequest.php \
        app/Http/Requests/UpdatePropertyRequest.php \
        app/Http/Resources/PropertyResource.php \
        tests/Feature/Api/Property/PropertyWritableFieldsTest.php
git commit -m "fix(api): title_type, les étages et le code postal n'avaient aucun chemin d'écriture (TCK-464)"
```

---

## Task 2 : La table de vérité de la pertinence des champs

**Files:**
- Create: `takussan-web/src/components/property-form/field-matrix.ts`
- Test: `takussan-web/src/components/property-form/__tests__/field-matrix.test.ts`

**Interfaces:**
- Consumes: `propertyTypeValues`, `contractTypeValues` de `@/lib/schemas/property`.
- Produces:
  - `type ConditionalFieldKey` — union des 12 clés conditionnelles
  - `isFieldRelevant(key: ConditionalFieldKey, ctx: RelevanceContext): boolean`
  - `type RelevanceContext = { type: PropertyTypeValue; contract: ContractTypeValue }`
  - `areaLabelKey(type: PropertyTypeValue): 'fields.areaLand' | 'fields.areaLiving'`
  - `sanitizeByType<T extends Record<string, unknown>>(values: T, ctx: RelevanceContext): T`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-web/src/components/property-form/__tests__/field-matrix.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { propertyTypeValues } from '@/lib/schemas/property';
import {
  areaLabelKey,
  isFieldRelevant,
  sanitizeByType,
  type ConditionalFieldKey,
} from '../field-matrix';

const vente = { contract: 'sale' } as const;
const location = { contract: 'rent' } as const;

describe('isFieldRelevant', () => {
  it('un terrain ne demande ni chambres, ni meublé, ni année de construction', () => {
    const ctx = { type: 'land', ...vente } as const;
    for (const cle of ['bedrooms', 'bathrooms', 'furnished', 'year_built', 'parking_spaces'] as const) {
      expect(isFieldRelevant(cle, ctx), `${cle} ne concerne pas un terrain`).toBe(false);
    }
  });

  it('un terrain demande sa surface et son statut foncier', () => {
    const ctx = { type: 'land', ...vente } as const;
    expect(isFieldRelevant('area', ctx)).toBe(true);
    expect(isFieldRelevant('title_type', ctx)).toBe(true);
  });

  it('un appartement demande son ÉTAGE, pas son nombre de niveaux', () => {
    const ctx = { type: 'apartment', ...location } as const;
    expect(isFieldRelevant('floor_number', ctx)).toBe(true);
    expect(isFieldRelevant('total_floors', ctx)).toBe(false);
  });

  it('une villa demande son nombre de NIVEAUX, pas son étage', () => {
    const ctx = { type: 'villa', ...vente } as const;
    expect(isFieldRelevant('total_floors', ctx)).toBe(true);
    expect(isFieldRelevant('floor_number', ctx)).toBe(false);
  });

  it('un studio et une chambre n’ont pas de compte de chambres à demander', () => {
    expect(isFieldRelevant('bedrooms', { type: 'studio', ...location })).toBe(false);
    expect(isFieldRelevant('bedrooms', { type: 'room', ...location })).toBe(false);
    expect(isFieldRelevant('bathrooms', { type: 'studio', ...location })).toBe(true);
  });

  it('un parking ne demande pas combien il a de places de parking', () => {
    expect(isFieldRelevant('parking_spaces', { type: 'parking', ...vente })).toBe(false);
    expect(isFieldRelevant('parking_spaces', { type: 'garage', ...vente })).toBe(false);
    expect(isFieldRelevant('parking_spaces', { type: 'villa', ...vente })).toBe(true);
  });

  it('la fréquence et la disponibilité ne concernent QUE la location', () => {
    for (const cle of ['rent_period', 'available_from'] as const) {
      expect(isFieldRelevant(cle, { type: 'villa', ...location })).toBe(true);
      expect(isFieldRelevant(cle, { type: 'villa', ...vente })).toBe(false);
    }
  });

  it('les équipements domestiques ne concernent pas un terrain, un garage ni un parking', () => {
    for (const type of ['land', 'garage', 'parking'] as const) {
      expect(isFieldRelevant('tag_ids', { type, ...vente })).toBe(false);
    }
    expect(isFieldRelevant('tag_ids', { type: 'apartment', ...location })).toBe(true);
  });

  // ── Les deux invariants qui rendent la table sûre plutôt que seulement juste ──

  it('INVARIANT — aucun type ne demande à la fois son étage ET son nombre de niveaux', () => {
    for (const type of propertyTypeValues) {
      const ctx = { type, ...vente } as const;
      expect(
        isFieldRelevant('floor_number', ctx) && isFieldRelevant('total_floors', ctx),
        `${type} demande les deux — c’est l’un OU l’autre, jamais les deux`,
      ).toBe(false);
    }
  });

  it('INVARIANT — la surface est demandée pour TOUS les types, sans exception', () => {
    for (const type of propertyTypeValues) {
      expect(isFieldRelevant('area', { type, ...vente }), `${type} sans surface`).toBe(true);
    }
  });
});

describe('areaLabelKey', () => {
  it('nomme la surface d’un terrain autrement que celle d’un logement', () => {
    expect(areaLabelKey('land')).toBe('fields.areaLand');
    expect(areaLabelKey('farm')).toBe('fields.areaLand');
    expect(areaLabelKey('apartment')).toBe('fields.areaLiving');
  });
});

describe('sanitizeByType', () => {
  it('efface ce que le type ne concerne pas, et ne touche à rien d’autre', () => {
    const purge = sanitizeByType(
      { title: 'Mon terrain', area: 300, bedrooms: 3, furnished: true, title_type: 'bail' },
      { type: 'land', contract: 'sale' },
    );
    expect(purge).toEqual({ title: 'Mon terrain', area: 300, title_type: 'bail' });
  });

  it('efface la fréquence de loyer quand on bascule vers une vente (AC4)', () => {
    const purge = sanitizeByType(
      { price: 5_000_000, rent_period: 'monthly', available_from: '2026-10-01' },
      { type: 'villa', contract: 'sale' },
    );
    expect(purge).toEqual({ price: 5_000_000 });
  });

  it('n’invente aucune clé absente de l’entrée', () => {
    const purge = sanitizeByType({ title: 'x' }, { type: 'villa', contract: 'rent' });
    expect(Object.keys(purge)).toEqual(['title']);
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
cd takussan-web && npm run test -- src/components/property-form/__tests__/field-matrix.test.ts
```

Attendu : **FAIL** — `Failed to resolve import "../field-matrix"`.

- [ ] **Step 3 : Écrire le module**

Créer `takussan-web/src/components/property-form/field-matrix.ts` :

```ts
import type { PropertyFormValues } from '@/lib/schemas/property';

/**
 * TCK-464 — LA règle de pertinence des champs d'un bien, et le seul endroit où elle s'écrit.
 *
 * Trois consommateurs la lisent : le parcours de création, la page d'édition, et la sérialisation
 * du payload. Écrite trois fois en conditions inline, elle diverge en trois versions — et la
 * troisième est celle qui envoie au serveur un `rent_period` sur une vente.
 *
 * ⚠ Ce module ne rend rien et n'appelle aucun hook : il doit rester testable sans DOM.
 */
export type PropertyTypeValue = PropertyFormValues['type'];
export type ContractTypeValue = PropertyFormValues['contract_type'];

export type RelevanceContext = {
  readonly type: PropertyTypeValue;
  readonly contract: ContractTypeValue;
};

export type ConditionalFieldKey =
  | 'area'
  | 'bedrooms'
  | 'bathrooms'
  | 'furnished'
  | 'year_built'
  | 'parking_spaces'
  | 'floor_number'
  | 'total_floors'
  | 'title_type'
  | 'rent_period'
  | 'available_from'
  | 'tag_ids';

/** Un bien où l'on dort. Sert de base à plusieurs règles, jamais employée seule. */
const HABITABLE = ['house', 'apartment', 'villa', 'studio', 'room', 'hotel', 'resort'] as const;

/** Le bien EST le sol : rien n'y est bâti, donc rien de bâti ne se demande. */
const NU = ['land'] as const;

/** Le bien est un emplacement de véhicule : demander ses places de parking serait circulaire. */
const EMPLACEMENT = ['garage', 'parking'] as const;

/** Le bien occupe un niveau DANS un bâtiment qu'il ne possède pas en entier. */
const DANS_UN_BATIMENT = ['apartment', 'studio', 'room', 'office', 'shop'] as const;

/** Le statut foncier porte sur le SOL — donc sur ce qui en possède un en propre. */
const AVEC_FONCIER = ['land', 'house', 'villa', 'farm'] as const;

function dans(liste: readonly string[], type: PropertyTypeValue): boolean {
  return liste.includes(type);
}

export function isFieldRelevant(cle: ConditionalFieldKey, ctx: RelevanceContext): boolean {
  const { type, contract } = ctx;

  switch (cle) {
    // La surface se demande toujours ; seul son LIBELLÉ change (cf. areaLabelKey).
    case 'area':
      return true;

    // Un studio est une pièce unique, une chambre en est une : le compte est impliqué par le
    // type, et le demander invite à saisir une valeur qui contredira le type.
    case 'bedrooms':
      return dans(HABITABLE, type) && type !== 'studio' && type !== 'room';

    case 'bathrooms':
      return !dans(NU, type) && !dans(EMPLACEMENT, type);

    case 'furnished':
      return dans(HABITABLE, type) || type === 'office' || type === 'shop';

    case 'year_built':
      return !dans(NU, type);

    case 'parking_spaces':
      return !dans(NU, type) && !dans(EMPLACEMENT, type);

    case 'floor_number':
      return dans(DANS_UN_BATIMENT, type);

    // Strictement complémentaire de `floor_number` sur les types bâtis : l'invariant du test
    // le vérifie sur les 16 types, pas sur un échantillon.
    case 'total_floors':
      return !dans(NU, type) && !dans(DANS_UN_BATIMENT, type);

    case 'title_type':
      return dans(AVEC_FONCIER, type);

    case 'rent_period':
    case 'available_from':
      return contract === 'rent';

    // Les tags `amenity` seedés sont domestiques (WiFi, TV, machine à laver…) : les proposer sur
    // un terrain ou un parking n'offre aucun choix pertinent.
    case 'tag_ids':
      return !dans(NU, type) && !dans(EMPLACEMENT, type);
  }
}

/**
 * La clé i18n du libellé de surface. Un terrain et une ferme se mesurent en surface de PARCELLE,
 * un logement en surface HABITABLE — ce n'est pas la même grandeur, et les confondre fausse la
 * comparaison entre deux annonces.
 */
export function areaLabelKey(type: PropertyTypeValue): 'fields.areaLand' | 'fields.areaLiving' {
  return type === 'land' || type === 'farm' ? 'fields.areaLand' : 'fields.areaLiving';
}

/**
 * Retire de `values` toute clé conditionnelle que le contexte déclare non pertinente.
 *
 * ⚠ Une clé absente de l'entrée reste absente de la sortie : la fonction n'ajoute jamais
 * `undefined`, sans quoi un `PATCH` partiel effacerait en base des champs que personne n'a
 * touchés.
 */
export function sanitizeByType<T extends Record<string, unknown>>(
  values: T,
  ctx: RelevanceContext,
): T {
  const sortie: Record<string, unknown> = { ...values };
  for (const cle of Object.keys(sortie)) {
    if (!estConditionnelle(cle)) continue;
    if (!isFieldRelevant(cle, ctx)) delete sortie[cle];
  }
  return sortie as T;
}

const CLES_CONDITIONNELLES = new Set<string>([
  'area', 'bedrooms', 'bathrooms', 'furnished', 'year_built', 'parking_spaces',
  'floor_number', 'total_floors', 'title_type', 'rent_period', 'available_from', 'tag_ids',
]);

function estConditionnelle(cle: string): cle is ConditionalFieldKey {
  return CLES_CONDITIONNELLES.has(cle);
}
```

- [ ] **Step 4 : Relancer le test**

```bash
npm run test -- src/components/property-form/__tests__/field-matrix.test.ts
```

Attendu : **PASS** — 13 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/components/property-form/field-matrix.ts \
        src/components/property-form/__tests__/field-matrix.test.ts
git commit -m "feat(web): table de vérité de la pertinence des champs d'un bien (TCK-464)"
```

---

## Task 3 : Le schéma Zod et la sérialisation du payload

**Files:**
- Modify: `takussan-web/src/lib/schemas/property.ts`
- Modify: `takussan-web/src/types/property.ts:10` et l'interface `PropertyDetail`
- Create: `takussan-web/src/components/property-form/payload.ts`
- Test: `takussan-web/src/components/property-form/__tests__/payload.test.ts`

**Interfaces:**
- Consumes: `sanitizeByType`, `RelevanceContext` (Task 2).
- Produces:
  - `titleTypeValues` = `['bail','titre_foncier','deliberation','autre'] as const`
  - Le schéma accepte désormais `title_type?`, `available_from?`, `floor_number?`, `total_floors?`
  - `toCreatePayload(values: PropertyFormPayload, intent: 'draft' | 'submit'): PropertyCreatePayload`
  - `toUpdatePayload(values: PropertyFormPayload): PropertyUpdatePayload`
  - `type PropertyAddressBlock = { street?; neighborhood?; city?; region?; country?; postal_code?; latitude?; longitude? }`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-web/src/components/property-form/__tests__/payload.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { toCreatePayload, toUpdatePayload } from '../payload';
import type { PropertyFormPayload } from '@/lib/schemas/property';

function valeurs(patch: Partial<PropertyFormPayload> = {}): PropertyFormPayload {
  return {
    title: 'Villa aux Almadies',
    type: 'villa',
    contract_type: 'rent',
    price: 350_000,
    currency: 'XOF',
    rent_period: 'monthly',
    city: 'Dakar',
    furnished: false,
    tag_ids: [],
    ...patch,
  } as PropertyFormPayload;
}

describe('toCreatePayload', () => {
  /**
   * AC1 — LE test de non-régression du ticket.
   *
   * Sur le code d'avant TCK-464, ce chemin ne produisait AUCUNE ligne `addresses` : la condition
   * `hasAddress` ne testait ni `city`, ni `quarter`, ni `region`, et les trois partaient au
   * premier niveau du POST où `StorePropertyRequest` ne les déclare pas — donc `validated()` les
   * jetait. La ville, seul champ d'adresse OBLIGATOIRE du formulaire, n'était écrite nulle part.
   */
  it('AC1 — la ville seule suffit à produire un bloc adresse', () => {
    const payload = toCreatePayload(valeurs({ city: 'Dakar' }), 'submit');
    expect(payload.address).toEqual({ city: 'Dakar' });
  });

  it('mappe le quartier sur `neighborhood`, le nom de colonne de la table', () => {
    const payload = toCreatePayload(valeurs({ quarter: 'Almadies' }), 'submit');
    expect(payload.address).toEqual({ city: 'Dakar', neighborhood: 'Almadies' });
  });

  it('n’émet aucun bloc adresse quand aucun champ de localisation n’est renseigné', () => {
    const { city: _ignore, ...sansVille } = valeurs();
    const payload = toCreatePayload(sansVille as PropertyFormPayload, 'submit');
    expect(payload.address).toBeUndefined();
  });

  it('ne laisse AUCUN champ d’adresse au premier niveau du payload', () => {
    const payload = toCreatePayload(
      valeurs({ city: 'Dakar', quarter: 'Almadies', street: 'Rue 12', country: 'SN' }),
      'submit',
    );
    for (const cle of ['city', 'quarter', 'region', 'street', 'postal_code', 'country', 'latitude', 'longitude']) {
      expect(payload, `${cle} ne doit pas rester au premier niveau`).not.toHaveProperty(cle);
    }
  });

  it('AC4 — une bascule vers la vente purge la fréquence et la disponibilité', () => {
    const payload = toCreatePayload(
      valeurs({ contract_type: 'sale', rent_period: 'monthly', available_from: '2026-10-01' }),
      'submit',
    );
    expect(payload).not.toHaveProperty('rent_period');
    expect(payload).not.toHaveProperty('available_from');
  });

  it('purge les champs qu’un terrain ne porte pas', () => {
    const payload = toCreatePayload(
      valeurs({ type: 'land', contract_type: 'sale', bedrooms: 3, year_built: 2010, furnished: true }),
      'submit',
    );
    expect(payload).not.toHaveProperty('bedrooms');
    expect(payload).not.toHaveProperty('year_built');
    expect(payload).not.toHaveProperty('furnished');
  });

  it('sort les tags du payload — ils passent par leur propre endpoint', () => {
    const payload = toCreatePayload(valeurs({ tag_ids: [1, 2] }), 'submit');
    expect(payload).not.toHaveProperty('tag_ids');
  });

  it('traduit l’intention en statut, et publie toujours en privé', () => {
    expect(toCreatePayload(valeurs(), 'draft').status).toBe('draft');
    expect(toCreatePayload(valeurs(), 'submit').status).toBe('pending_review');
    expect(toCreatePayload(valeurs(), 'submit').visibility).toBe('private');
  });
});

describe('toUpdatePayload', () => {
  it('emporte le bloc adresse et ne fixe aucun statut', () => {
    const payload = toUpdatePayload(valeurs({ city: 'Thiès', street: 'Rue 4' }));
    expect(payload.address).toEqual({ city: 'Thiès', street: 'Rue 4' });
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('visibility');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
npm run test -- src/components/property-form/__tests__/payload.test.ts
```

Attendu : **FAIL** — `Failed to resolve import "../payload"`.

- [ ] **Step 3 : Étendre le schéma Zod**

Dans `src/lib/schemas/property.ts`, après `export const rentPeriodValues = …`, ajouter :

```ts
/**
 * TCK-464 — `TitleType` côté backend. ⚠ La quatrième valeur est `'autre'` et non `'other'` :
 * `src/types/property.ts` écrivait `'other'`, une valeur que l'API n'a jamais pu émettre. Le
 * défaut était invisible tant qu'aucun écran n'écrivait ni ne discriminait `title_type`.
 */
export const titleTypeValues = ['bail', 'titre_foncier', 'deliberation', 'autre'] as const;
```

Dans `propertyFormSchema`, après `rent_period: …` :

```ts
  title_type: z.enum(titleTypeValues).optional(),
  available_from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, msgValidation('property.dateInvalid'))
    .optional()
    .or(z.literal(''))
    .transform((v) => (v && v.length > 0 ? v : undefined)),
```

et, après `parking_spaces: …` :

```ts
  floor_number: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(-5, msgValidation('property.valueInvalid'))
    .max(200, msgValidation('property.valueUnrealistic'))
    .optional(),
  total_floors: z.coerce
    .number()
    .int(msgValidation('property.integerExpected'))
    .min(1, msgValidation('property.valueInvalid'))
    .max(200, msgValidation('property.valueUnrealistic'))
    .optional(),
```

- [ ] **Step 4 : Corriger le typage de `PropertyTitleType` et ajouter `available_from`**

Dans `src/types/property.ts` ligne 10 :

```ts
export type PropertyTitleType = 'bail' | 'titre_foncier' | 'deliberation' | 'autre';
```

et dans l'interface `PropertyDetail`, à côté de `title_type` :

```ts
  available_from: string | null;
```

- [ ] **Step 5 : Écrire le module de sérialisation**

Créer `takussan-web/src/components/property-form/payload.ts` :

```ts
import type { PropertyFormPayload } from '@/lib/schemas/property';

import { sanitizeByType, type RelevanceContext } from './field-matrix';

/**
 * TCK-464 — la traduction « valeurs du formulaire → corps de requête », et le seul endroit où
 * l'adresse est composée.
 *
 * ⚠ L'adresse part IMBRIQUÉE (`address: {…}`). `StorePropertyRequest` la déclare ainsi et
 * `PropertyController::store()` la crée dans la même transaction que le bien. La version
 * précédente envoyait `city`/`quarter`/`region` au PREMIER niveau — où aucune règle ne les
 * déclare, donc `validated()` les jetait — puis tentait un `PUT …/address` de rattrapage, sous
 * une condition qui ne testait pas la ville. Une création qui ne renseignait que la ville, le
 * chemin nominal, ne produisait donc aucune adresse du tout.
 *
 * ⚠ `quarter` (formulaire) → `neighborhood` (colonne). Le nom diverge des deux côtés depuis
 * l'origine ; c'est ici, et nulle part ailleurs, qu'il se traduit.
 */
export type PropertyAddressBlock = {
  street?: string;
  neighborhood?: string;
  city?: string;
  region?: string;
  country?: string;
  postal_code?: string;
  latitude?: number | null;
  longitude?: number | null;
};

const CLES_ADRESSE = [
  'street', 'quarter', 'city', 'region', 'country', 'postal_code', 'latitude', 'longitude',
] as const;

export type PropertyCreatePayload = Record<string, unknown> & {
  status: 'draft' | 'pending_review';
  visibility: 'private';
  address?: PropertyAddressBlock;
};

export type PropertyUpdatePayload = Record<string, unknown> & {
  address?: PropertyAddressBlock;
};

function contexte(values: PropertyFormPayload): RelevanceContext {
  return { type: values.type, contract: values.contract_type };
}

/** Compose le bloc adresse. Rend `undefined` — et non un objet vide — si rien n'est renseigné. */
function blocAdresse(values: PropertyFormPayload): PropertyAddressBlock | undefined {
  const bloc: PropertyAddressBlock = {};
  const source = values as unknown as Record<string, unknown>;

  for (const cle of CLES_ADRESSE) {
    const valeur = source[cle];
    if (valeur === undefined || valeur === null || valeur === '') continue;
    if (cle === 'quarter') bloc.neighborhood = valeur as string;
    else (bloc as Record<string, unknown>)[cle] = valeur;
  }

  return Object.keys(bloc).length > 0 ? bloc : undefined;
}

/** Retire du corps les clés d'adresse et les tags — les deux ont leur propre chemin. */
function corpsDuBien(values: PropertyFormPayload): Record<string, unknown> {
  const corps = sanitizeByType(
    { ...(values as unknown as Record<string, unknown>) },
    contexte(values),
  );
  for (const cle of CLES_ADRESSE) delete corps[cle];
  delete corps.tag_ids;
  return corps;
}

export function toCreatePayload(
  values: PropertyFormPayload,
  intent: 'draft' | 'submit',
): PropertyCreatePayload {
  const adresse = blocAdresse(values);

  return {
    ...corpsDuBien(values),
    // Reconduit tel quel le comportement d'avant TCK-464 : la modération est hors périmètre.
    status: intent === 'draft' ? 'draft' : 'pending_review',
    visibility: 'private',
    ...(adresse ? { address: adresse } : {}),
  } as PropertyCreatePayload;
}

export function toUpdatePayload(values: PropertyFormPayload): PropertyUpdatePayload {
  const adresse = blocAdresse(values);

  return {
    ...corpsDuBien(values),
    ...(adresse ? { address: adresse } : {}),
  } as PropertyUpdatePayload;
}
```

- [ ] **Step 6 : Relancer les tests et le typage**

```bash
npm run test -- src/components/property-form/__tests__/payload.test.ts
npx tsc --noEmit
```

Attendu : **PASS** (9 tests) et `tsc` sans erreur. Si `tsc` signale un consommateur de
`PropertyTitleType` qui comparait à `'other'`, corriger le comparant — c'était un test toujours
faux.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/schemas/property.ts src/types/property.ts \
        src/components/property-form/payload.ts \
        src/components/property-form/__tests__/payload.test.ts
git commit -m "fix(web): l'adresse part imbriquée dans la création, la ville seule n'était jamais enregistrée (TCK-464)"
```

---

## Task 4 : La suggestion géographique

**Files:**
- Create: `takussan-web/src/hooks/useGeoSuggestion.ts`
- Test: `takussan-web/src/hooks/__tests__/useGeoSuggestion.test.ts`

**Interfaces:**
- Consumes: `useUserLocation()` de `@/components/providers/UserLocationProvider`.
- Produces:
  - `type GeoSuggestion = { city: string; region: string } | null`
  - `type GeoDefaults = { country?: string; currency?: 'XOF'|'XAF'|'EUR'|'USD'; lat?: number; lng?: number }`
  - `useGeoSuggestion(): { suggestion: GeoSuggestion; defaults: GeoDefaults; loading: boolean }`

**Le partage de la frontière, et pourquoi il est là :** la géo-IP dit où est *l'utilisateur*, pas
où est *le bien*. `defaults` porte ce qui est quasi toujours juste (pays, devise, centre de carte)
et se pose d'office ; `suggestion` porte ce qui peut être faux (ville, région) et **doit être
accepté d'un geste**. Une valeur pré-remplie ne se relit pas, elle se valide — c'est le contenu
de l'AC6.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-web/src/hooks/__tests__/useGeoSuggestion.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockLocation = vi.hoisted(() => ({ value: null as unknown, loading: false }));

vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({
    location: mockLocation.value,
    loading: mockLocation.loading,
    city: 'Dakar',
  }),
}));

import { useGeoSuggestion } from '../useGeoSuggestion';

describe('useGeoSuggestion', () => {
  it('propose la ville et la région sans jamais les poser d’office', () => {
    mockLocation.value = { city: 'Saly', region: 'Thiès', country_code: 'SN', currency: 'XOF' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.suggestion).toEqual({ city: 'Saly', region: 'Thiès' });
  });

  it('pose d’office le pays, la devise et le centre de carte', () => {
    mockLocation.value = {
      city: 'Dakar', region: 'Dakar', country_code: 'SN', currency: 'XOF',
      latitude: 14.6928, longitude: -17.4467,
    };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.defaults).toEqual({
      country: 'SN', currency: 'XOF', lat: 14.6928, lng: -17.4467,
    });
  });

  it('ignore une devise que le backend n’accepte pas, plutôt que de la propager', () => {
    mockLocation.value = { city: 'Paris', country_code: 'FR', currency: 'GBP' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.defaults.currency).toBeUndefined();
    expect(result.current.defaults.country).toBe('FR');
  });

  it('ne suggère rien quand la géo-IP n’a pas répondu', () => {
    mockLocation.value = null;
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.suggestion).toBeNull();
    expect(result.current.defaults).toEqual({});
  });

  it('ne suggère rien quand la ville est vide ou blanche', () => {
    mockLocation.value = { city: '   ', region: 'Dakar', country_code: 'SN' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.suggestion).toBeNull();
  });

  it('normalise le code pays en majuscules sur deux caractères', () => {
    mockLocation.value = { city: 'Dakar', country_code: 'sn' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.defaults.country).toBe('SN');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
npm run test -- src/hooks/__tests__/useGeoSuggestion.test.ts
```

Attendu : **FAIL** — module introuvable.

- [ ] **Step 3 : Écrire le hook**

Créer `takussan-web/src/hooks/useGeoSuggestion.ts` :

```ts
'use client';

import { useUserLocation } from '@/components/providers/UserLocationProvider';
import { currencyValues } from '@/lib/schemas/property';

/**
 * TCK-464 — dérive de la géo-IP deux choses de FORCE DIFFÉRENTE, et refuse de les confondre.
 *
 * `defaults` : ce qui est quasi toujours juste — pays, devise, centre de carte. Posé d'office.
 * `suggestion` : ce qui peut être faux — ville et région. Un agent à Dakar publie une villa à
 * Saly ; la géo-IP dit alors « Dakar », et une valeur pré-remplie ne se relit pas, elle se
 * valide. La suggestion doit donc être ACCEPTÉE, jamais posée.
 *
 * Aucun appel réseau : `UserLocationProvider` est monté site-wide et met la réponse ipapi en
 * cache 24 h dans localStorage.
 */
export type GeoSuggestion = { readonly city: string; readonly region: string } | null;

export type GeoDefaults = {
  country?: string;
  currency?: (typeof currencyValues)[number];
  lat?: number;
  lng?: number;
};

function deviseSupportee(brut: string | undefined): GeoDefaults['currency'] {
  if (!brut) return undefined;
  const majuscule = brut.trim().toUpperCase();
  return (currencyValues as readonly string[]).includes(majuscule)
    ? (majuscule as GeoDefaults['currency'])
    : undefined;
}

export function useGeoSuggestion(): {
  suggestion: GeoSuggestion;
  defaults: GeoDefaults;
  loading: boolean;
} {
  const { location, loading } = useUserLocation();

  if (!location) return { suggestion: null, defaults: {}, loading };

  const ville = location.city?.trim() ?? '';
  const region = location.region?.trim() ?? '';
  const pays = location.country_code?.trim().toUpperCase();

  const defaults: GeoDefaults = {};
  if (pays && pays.length === 2) defaults.country = pays;
  const devise = deviseSupportee(location.currency);
  if (devise) defaults.currency = devise;
  if (typeof location.latitude === 'number') defaults.lat = location.latitude;
  if (typeof location.longitude === 'number') defaults.lng = location.longitude;

  return {
    // Sans ville, il n'y a rien à suggérer : une région seule ne remplit aucun champ obligatoire.
    suggestion: ville ? { city: ville, region } : null,
    defaults,
    loading,
  };
}
```

- [ ] **Step 4 : Relancer le test**

```bash
npm run test -- src/hooks/__tests__/useGeoSuggestion.test.ts
```

Attendu : **PASS** — 6 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/hooks/useGeoSuggestion.ts src/hooks/__tests__/useGeoSuggestion.test.ts
git commit -m "feat(web): suggestion géographique — le certain posé, l'incertain proposé (TCK-464)"
```

---

## Task 5 : Le titre pré-composé

**Files:**
- Create: `takussan-web/src/components/property-form/wizard/suggest-title.ts`
- Test: `takussan-web/src/components/property-form/__tests__/suggest-title.test.ts`

**Interfaces:**
- Consumes: `PropertyTypeValue` (Task 2), un traducteur `(cle: string) => string` borné à
  `property.types`.
- Produces: `suggestTitle(input: SuggestTitleInput, tType: Traducteur): string`
  avec `SuggestTitleInput = { type; area?; bedrooms?; quarter?; city? }`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-web/src/components/property-form/__tests__/suggest-title.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { suggestTitle } from '../wizard/suggest-title';

const tType = (cle: string) =>
  ({ land: 'Terrain', villa: 'Villa', apartment: 'Appartement', studio: 'Studio' })[cle] ?? cle;

describe('suggestTitle', () => {
  it('un terrain se décrit par sa surface et son quartier', () => {
    expect(suggestTitle({ type: 'land', area: 300, quarter: 'Almadies' }, tType))
      .toBe('Terrain de 300 m² à Almadies');
  });

  it('un logement se décrit par ses chambres et son quartier', () => {
    expect(suggestTitle({ type: 'villa', bedrooms: 4, quarter: 'Ngor', area: 220 }, tType))
      .toBe('Villa 4 chambres à Ngor');
  });

  it('replie sur la ville quand le quartier manque', () => {
    expect(suggestTitle({ type: 'apartment', bedrooms: 2, city: 'Thiès' }, tType))
      .toBe('Appartement 2 chambres à Thiès');
  });

  it('accorde le pluriel de « chambre »', () => {
    expect(suggestTitle({ type: 'apartment', bedrooms: 1, city: 'Dakar' }, tType))
      .toBe('Appartement 1 chambre à Dakar');
  });

  it('n’écrit que ce qu’il sait — jamais de segment vide ni de double espace', () => {
    expect(suggestTitle({ type: 'studio' }, tType)).toBe('Studio');
    expect(suggestTitle({ type: 'studio', city: 'Dakar' }, tType)).toBe('Studio à Dakar');
    expect(suggestTitle({ type: 'land', area: 500 }, tType)).toBe('Terrain de 500 m²');
  });

  it('ne mentionne pas les chambres d’un terrain, même si la valeur traîne', () => {
    expect(suggestTitle({ type: 'land', bedrooms: 3, area: 400, city: 'Mbour' }, tType))
      .toBe('Terrain de 400 m² à Mbour');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
npm run test -- src/components/property-form/__tests__/suggest-title.test.ts
```

Attendu : **FAIL** — module introuvable.

- [ ] **Step 3 : Écrire le module**

Créer `takussan-web/src/components/property-form/wizard/suggest-title.ts` :

```ts
import { isFieldRelevant, type PropertyTypeValue } from '../field-matrix';

/**
 * TCK-464 — compose un titre d'annonce à partir de ce que le parcours sait déjà.
 *
 * Écrire un titre à froid est la chose la plus dure du formulaire, et c'était son PREMIER champ.
 * À la sixième étape, le type, la surface, les chambres et le quartier sont connus : on propose,
 * l'utilisateur corrige. Il n'invente plus, il arbitre.
 *
 * Pur, synchrone, sans réseau. Le vocabulaire des types vient du dictionnaire, passé en argument
 * (même contrat que `./options.ts` : un module hors composant ne porte pas de libellé).
 */
export type Traducteur = (cle: string) => string;

export type SuggestTitleInput = {
  readonly type: PropertyTypeValue;
  readonly area?: number;
  readonly bedrooms?: number;
  readonly quarter?: string;
  readonly city?: string;
};

export function suggestTitle(input: SuggestTitleInput, tType: Traducteur): string {
  const { type, area, bedrooms, quarter, city } = input;
  const contexte = { type, contract: 'sale' } as const;

  const segments: string[] = [tType(type)];

  // Un logement se décrit par ses chambres, un terrain par sa surface. La matrice arbitre —
  // c'est elle qui sait qu'un terrain n'a pas de chambres, même si la valeur traîne dans l'état
  // du formulaire après un changement de type.
  if (isFieldRelevant('bedrooms', contexte) && typeof bedrooms === 'number' && bedrooms > 0) {
    segments.push(`${bedrooms} ${bedrooms > 1 ? 'chambres' : 'chambre'}`);
  } else if (typeof area === 'number' && area > 0) {
    segments.push(`de ${area} m²`);
  }

  const lieu = (quarter?.trim() || city?.trim()) ?? '';
  if (lieu) segments.push(`à ${lieu}`);

  return segments.join(' ');
}
```

> ⚠ Les mots « chambre(s) » et « à » sont ici en français dans le code. C'est une **entorse
> assumée** au principe n°5, et elle est bornée : le titre composé est une **valeur par défaut
> modifiable**, pas un libellé d'interface. La rendre traduisible demanderait de passer trois
> clés ICU au module ; c'est un travail qui a du sens le jour où `wo` et `en` sont réellement
> servis à des utilisateurs qui publient — pas avant. Noté au ticket sous « Hors périmètre »
> si l'arbitrage penche autrement.

- [ ] **Step 4 : Relancer le test**

```bash
npm run test -- src/components/property-form/__tests__/suggest-title.test.ts
```

Attendu : **PASS** — 6 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/components/property-form/wizard/suggest-title.ts \
        src/components/property-form/__tests__/suggest-title.test.ts
git commit -m "feat(web): titre d'annonce pré-composé à partir des réponses du parcours (TCK-464)"
```

---

## Task 6 : Les animations du parcours (CSS)

**Files:**
- Modify: `takussan-web/src/app/globals.css` (bloc « Animations utilitaires », après `sectionEnter`)

**Interfaces:**
- Produces: les classes `.wizard-step-in-forward`, `.wizard-step-in-back`,
  `.wizard-step-out-forward`, `.wizard-step-out-back`, `.wizard-field-rise`, `.wizard-flash`.

- [ ] **Step 1 : Ajouter les keyframes**

Dans `src/app/globals.css`, à la suite de `.animate-section-enter { … }` :

```css
/* ─── Parcours de publication d'un bien (TCK-464) ───────────────────── */

/*
 * La DIRECTION porte le sens : on avance, l'étape entre par la droite ; on revient, par la
 * gauche. C'est ce qui fait ressentir un lieu qu'on parcourt plutôt qu'un écran qu'on remplace.
 * Sortie plus rapide que l'entrée (220 ms contre 300) : les deux se chevauchent, et c'est
 * l'entrante qu'on doit lire.
 */
@keyframes wizardInForward  { from { opacity: 0; transform: translateX(26px);  } to { opacity: 1; transform: none; } }
@keyframes wizardInBack     { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: none; } }
@keyframes wizardOutForward { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(-18px); } }
@keyframes wizardOutBack    { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateX(18px);  } }

.wizard-step-in-forward  { animation: wizardInForward  300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.wizard-step-in-back     { animation: wizardInBack     300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.wizard-step-out-forward { animation: wizardOutForward 220ms ease-in both; }
.wizard-step-out-back    { animation: wizardOutBack    220ms ease-in both; }

/* Les champs d'une étape entrent en cascade : l'œil suit une ligne au lieu de recevoir un mur. */
@keyframes wizardFieldRise { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
.wizard-field-rise { animation: wizardFieldRise 340ms cubic-bezier(0.22, 1, 0.36, 1) both; }

/*
 * Ce qu'une suggestion a rempli doit se VOIR, sinon elle a écrit à la place de l'utilisateur
 * sans qu'il puisse le savoir (AC6). Le flash emprunte `--accent` (sage), jamais `--primary` :
 * ce n'est pas une erreur ni une action, c'est une valeur posée.
 */
@keyframes wizardFlash {
  0%   { background-color: color-mix(in oklch, var(--accent) 22%, transparent); }
  100% { background-color: var(--card); }
}
.wizard-flash { animation: wizardFlash 750ms ease-out; }

/*
 * ⚠ Garde PORTÉE À CE PARCOURS, et pas au dépôt.
 *
 * `globals.css` n'a aujourd'hui AUCUN bloc `prefers-reduced-motion` : `fadeInUp`, `cardEnter` et
 * `sectionEnter` s'exécutent quelle que soit la préférence système. C'est un manquement réel, et
 * il déborde ce ticket — poser une règle universelle ici changerait le comportement de tout le
 * site depuis un ticket qui ne parle que de publication. On neutralise donc ce qu'on introduit,
 * et le manquement plus large reste à instruire pour lui-même.
 *
 * Un glissement horizontal répété six fois est un déclencheur vestibulaire connu : le fondu
 * subsiste, la translation disparaît.
 */
@media (prefers-reduced-motion: reduce) {
  .wizard-step-in-forward,
  .wizard-step-in-back,
  .wizard-step-out-forward,
  .wizard-step-out-back,
  .wizard-field-rise {
    animation: none;
    opacity: 1;
    transform: none;
    transition: opacity 120ms linear;
  }
  .wizard-flash { animation: none; }
}
```

- [ ] **Step 2 : Vérifier que la feuille compile**

```bash
npm run build 2>&1 | tail -20
```

Attendu : build réussi, aucune erreur PostCSS/Tailwind.

- [ ] **Step 3 : Commit**

```bash
git add src/app/globals.css
git commit -m "feat(web): keyframes du parcours de publication, neutralisées sous reduced-motion (TCK-464)"
```

---

## Task 7 : La coquille du parcours

**Files:**
- Create: `takussan-web/src/components/property-form/wizard/WizardShell.tsx`
- Test: `takussan-web/src/components/property-form/__tests__/WizardShell.test.tsx`

**Interfaces:**
- Consumes: les classes CSS de la Task 6 ; `Button` de `@/components/ui/button` ; `cn` de
  `@/lib/utils`.
- Produces:

```ts
export type WizardStepDef = {
  readonly id: string;
  readonly title: string;      // déjà traduit par l'appelant
  readonly subtitle: string;   // déjà traduit
  readonly body: React.ReactNode;
  readonly canAdvance?: boolean;   // défaut true
  readonly skippable?: boolean;    // affiche « Plus tard »
};

export type WizardShellProps = {
  readonly steps: readonly WizardStepDef[];
  readonly index: number;
  readonly direction: 1 | -1;
  readonly onNavigate: (next: number, direction: 1 | -1) => void;
  readonly onFinish: () => void;
  readonly finishLabel: string;
  readonly busy?: boolean;
  readonly footerExtra?: React.ReactNode;   // ex. « Enregistrer en brouillon »
};
```

**Ce que la coquille garantit, et qui est un AC :** le pied est **hors de la zone défilante**
(`overflow-y-auto` sur le corps, pied en dehors du flux scrollable). AC9 est formulé sur la
position du bouton précisément parce qu'une étape peut légitimement défiler — ce qui ne doit
jamais arriver, c'est que le moyen d'avancer sorte de l'écran.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-web/src/components/property-form/__tests__/WizardShell.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { WizardShell, type WizardStepDef } from '../wizard/WizardShell';

function etapes(): WizardStepDef[] {
  return [
    { id: 'a', title: 'Le bien', subtitle: 'Deux réponses', body: <p>corps A</p> },
    { id: 'b', title: 'Où', subtitle: 'La première chose qu’on regarde', body: <p>corps B</p> },
    { id: 'c', title: 'Fin', subtitle: 'Presque fini', body: <p>corps C</p> },
  ];
}

function monter(patch: Partial<React.ComponentProps<typeof WizardShell>> = {}) {
  const onNavigate = vi.fn();
  const onFinish = vi.fn();
  render(
    <WizardShell
      steps={etapes()}
      index={0}
      direction={1}
      onNavigate={onNavigate}
      onFinish={onFinish}
      finishLabel="Publier mon annonce"
      {...patch}
    />,
  );
  return { onNavigate, onFinish };
}

describe('WizardShell', () => {
  it('ne monte QUE l’étape courante', () => {
    monter();
    expect(screen.getByText('corps A')).toBeInTheDocument();
    expect(screen.queryByText('corps B')).not.toBeInTheDocument();
  });

  it('annonce la position dans le parcours', () => {
    monter({ index: 1 });
    expect(screen.getByText(/2.*3/)).toBeInTheDocument();
  });

  it('avance et recule en signalant le SENS — c’est lui qui choisit la transition', async () => {
    const user = userEvent.setup();
    const { onNavigate } = monter({ index: 1 });

    await user.click(screen.getByRole('button', { name: /continuer/i }));
    expect(onNavigate).toHaveBeenCalledWith(2, 1);

    await user.click(screen.getByRole('button', { name: /précédent|retour/i }));
    expect(onNavigate).toHaveBeenCalledWith(0, -1);
  });

  it('désactive le retour sur la première étape', () => {
    monter({ index: 0 });
    expect(screen.getByRole('button', { name: /précédent|retour/i })).toBeDisabled();
  });

  it('appelle onFinish, et non onNavigate, sur la dernière étape', async () => {
    const user = userEvent.setup();
    const { onFinish, onNavigate } = monter({ index: 2 });

    await user.click(screen.getByRole('button', { name: /publier mon annonce/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('bloque l’avance quand l’étape le demande', () => {
    const steps = etapes();
    steps[0] = { ...steps[0], canAdvance: false };
    monter({ steps, index: 0 });
    expect(screen.getByRole('button', { name: /continuer/i })).toBeDisabled();
  });

  it('AC9 — le pied est hors de la zone défilante', () => {
    monter();
    const defilante = document.querySelector('[data-wizard-scroll]');
    const pied = document.querySelector('[data-wizard-footer]');
    expect(defilante).not.toBeNull();
    expect(pied).not.toBeNull();
    expect(defilante!.contains(pied!)).toBe(false);
  });

  it('applique la classe de transition qui correspond au sens', () => {
    const { rerender } = render(
      <WizardShell steps={etapes()} index={1} direction={1} onNavigate={vi.fn()}
        onFinish={vi.fn()} finishLabel="Publier" />,
    );
    expect(document.querySelector('.wizard-step-in-forward')).not.toBeNull();

    rerender(
      <WizardShell steps={etapes()} index={0} direction={-1} onNavigate={vi.fn()}
        onFinish={vi.fn()} finishLabel="Publier" />,
    );
    expect(document.querySelector('.wizard-step-in-back')).not.toBeNull();
  });

  it('expose la progression aux technologies d’assistance', () => {
    monter({ index: 1 });
    const barre = screen.getByRole('progressbar');
    expect(barre).toHaveAttribute('aria-valuenow', '2');
    expect(barre).toHaveAttribute('aria-valuemax', '3');
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
npm run test -- src/components/property-form/__tests__/WizardShell.test.tsx
```

Attendu : **FAIL** — module introuvable.

- [ ] **Step 3 : Écrire la coquille**

Créer `takussan-web/src/components/property-form/wizard/WizardShell.tsx` :

```tsx
'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * TCK-464 — la coquille du parcours de publication : progression, transition, navigation.
 *
 * Elle ne connaît RIEN du domaine : ni bien, ni adresse, ni prix. Elle reçoit des étapes déjà
 * traduites et déjà validées par l'appelant, et ne décide que du mouvement. C'est ce qui la rend
 * testable sans formulaire.
 *
 * ⚠ Elle ne réutilise PAS `WizardReprenable` (TCK-250) : le chrome de ce composant — barre,
 * pastilles, boutons Précédent/Suivant — est exactement ce que ce ticket remplace. La partie
 * réutilisable de TCK-250, `useWizardDraft`, l'est en revanche (cf. Task 12).
 *
 * ⚠ Aucun `useCallback` / `useMemo` : le React Compiler s'en charge (ADR-0015), et une
 * mémoïsation manuelle fait ABANDONNER la compilation de tout le composant.
 */
export type WizardStepDef = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly body: React.ReactNode;
  readonly canAdvance?: boolean;
  readonly skippable?: boolean;
};

export type WizardShellProps = {
  readonly steps: readonly WizardStepDef[];
  readonly index: number;
  readonly direction: 1 | -1;
  readonly onNavigate: (next: number, direction: 1 | -1) => void;
  readonly onFinish: () => void;
  readonly finishLabel: string;
  readonly busy?: boolean;
  readonly footerExtra?: React.ReactNode;
};

export function WizardShell({
  steps, index, direction, onNavigate, onFinish, finishLabel, busy = false, footerExtra,
}: WizardShellProps) {
  const t = useTranslations('property.wizard');
  const etape = steps[index];
  const derniere = index === steps.length - 1;
  const peutAvancer = etape.canAdvance !== false;

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col lg:flex-row lg:gap-10">
      {/* ── Rail d'étapes : desktop seulement. Sous lg, la barre de progression le remplace. ── */}
      <nav aria-label={t('railLabel')} className="hidden w-56 shrink-0 lg:block">
        <ol className="sticky top-24 space-y-1">
          {steps.map((s, i) => {
            const franchie = i < index;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!franchie}
                  onClick={() => onNavigate(i, -1)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    i === index && 'bg-muted font-semibold text-foreground',
                    franchie && 'text-muted-foreground hover:bg-muted',
                    !franchie && i !== index && 'cursor-default text-muted-foreground/50',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border text-xs',
                      i === index && 'border-primary bg-primary text-primary-foreground',
                      franchie && 'border-accent bg-accent/15 text-accent',
                      !franchie && i !== index && 'border-border',
                    )}
                  >
                    {franchie ? '✓' : i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Progression ── */}
        <div className="shrink-0 pb-4">
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={index === 0 || busy}
              onClick={() => onNavigate(index - 1, -1)}
              aria-label={t('back')}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <span className="text-xs font-semibold text-muted-foreground">
              {t('position', { current: index + 1, total: steps.length })}
            </span>
            {footerExtra}
          </div>
          <div
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label={t('progressLabel')}
            className="h-1 overflow-hidden rounded-full bg-muted"
          >
            {/*
              420 ms : PLUS LENT que la transition d'étape (300 ms), délibérément. La barre finit
              après, donc on la voit avancer — si elle finissait avant, l'œil serait déjà parti.
            */}
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* ── Corps : LA SEULE zone défilante (AC9) ── */}
        <div data-wizard-scroll className="min-h-0 flex-1 overflow-y-auto">
          <div
            key={etape.id}
            className={cn(
              'mx-auto max-w-xl pb-6',
              direction > 0 ? 'wizard-step-in-forward' : 'wizard-step-in-back',
            )}
          >
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {etape.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{etape.subtitle}</p>
            <div className="mt-6 space-y-5">{etape.body}</div>
          </div>
        </div>

        {/* ── Pied : HORS de la zone défilante. Le moyen d'avancer ne sort jamais de l'écran. ── */}
        <div
          data-wizard-footer
          className="shrink-0 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <div className="mx-auto flex max-w-xl items-center gap-3">
            {etape.skippable && !derniere ? (
              <Button type="button" variant="ghost" size="lg" disabled={busy}
                onClick={() => onNavigate(index + 1, 1)}>
                {t('skip')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={busy || !peutAvancer}
              onClick={() => (derniere ? onFinish() : onNavigate(index + 1, 1))}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>{t('saving')}</span>
                </>
              ) : (
                <span>{derniere ? finishLabel : t('continue')}</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

> Le `key={etape.id}` sur le conteneur du corps est ce qui déclenche la transition : React
> démonte et remonte le nœud, donc l'animation `both` rejoue. Sans lui, la classe changerait sans
> que l'animation reparte.

- [ ] **Step 4 : Ajouter les clés i18n minimales pour que le test passe**

Dans `src/messages/fr.json`, sous `property`, ajouter le sous-arbre `wizard` :

```json
"wizard": {
  "railLabel": "Étapes de la publication",
  "progressLabel": "Progression",
  "position": "Étape {current} sur {total}",
  "back": "Précédent",
  "continue": "Continuer",
  "skip": "Plus tard",
  "saving": "Enregistrement…"
}
```

Répliquer dans `en.json` (« Step {current} of {total} », « Back », « Continue », « Later »,
« Saving… », « Publishing steps », « Progress ») et dans `wo.json` (mêmes clés — traduire ou
reprendre le français, mais **jamais omettre une clé** : `check-i18n.mjs` compare les feuilles des
trois dictionnaires, et le repli silencieux vers `fr` masque l'oubli à l'écran).

- [ ] **Step 5 : Relancer le test**

```bash
npm run test -- src/components/property-form/__tests__/WizardShell.test.tsx
node scripts/check-i18n.mjs
```

Attendu : **PASS** (9 tests) et garde i18n verte.

- [ ] **Step 6 : Commit**

```bash
git add src/components/property-form/wizard/WizardShell.tsx \
        src/components/property-form/__tests__/WizardShell.test.tsx \
        src/messages/fr.json src/messages/en.json src/messages/wo.json
git commit -m "feat(web): coquille du parcours — progression, transitions directionnelles, pied hors défilement (TCK-464)"
```

---

## Task 8 : Les six étapes

**Files:**
- Create: `takussan-web/src/components/property-form/wizard/steps/StepBien.tsx`
- Create: `takussan-web/src/components/property-form/wizard/steps/StepLieu.tsx`
- Create: `takussan-web/src/components/property-form/wizard/steps/StepCaracteristiques.tsx`
- Create: `takussan-web/src/components/property-form/wizard/steps/StepPrix.tsx`
- Create: `takussan-web/src/components/property-form/wizard/steps/StepPhotos.tsx`
- Create: `takussan-web/src/components/property-form/wizard/steps/StepFinition.tsx`
- Create: `takussan-web/src/components/property-form/wizard/ChoiceChips.tsx`
- Create: `takussan-web/src/components/property-form/wizard/GeoSuggestionChip.tsx`

**Interfaces:**
- Consumes: `Control<PropertyFormValues>` de react-hook-form ; `isFieldRelevant`, `areaLabelKey`
  (Task 2) ; `useGeoSuggestion` (Task 4) ; `suggestTitle` (Task 5) ; `FormInput`, `FormSelect`,
  `FormCheckbox`, `FormDatePicker` de `@/components/forms` ; `MediaDropzone` de
  `@/components/media` ; `LocationPickerMapLoader` de `@/components/map/LocationPickerMapLoader`.
- Produces: six composants d'étape, chacun exportant un composant nommé prenant
  `{ control, watch, setValue }` (l'API `UseFormReturn` restreinte) et ses props propres.

**Signatures exactes des primitives de formulaire** — ne pas en inventer d'autres :

```ts
<FormInput control={control} name="area" label={…} type="number" inputMode="numeric" min={0} />
<FormSelect control={control} name="rent_period" label={…} options={…} placeholder={…} />
<FormCheckbox control={control} name="furnished" label={…} />
<FormDatePicker control={control} name="available_from" label={…} min="2020-01-01" />
<MediaDropzone onChange={(files: File[]) => void} files={File[]} onRemove={(i: number) => void} maxFiles={10} />
<LocationPickerMapLoader lat={number | null | undefined} lng={…} onChange={(lat: number, lng: number) => void} />
```

- [ ] **Step 1 : Écrire les deux primitives partagées**

`ChoiceChips.tsx` — la sélection tactile qui remplace un `<select>` là où le choix gouverne la
suite (type de bien, contrat, statut foncier, fréquence) :

```tsx
'use client';

import { cn } from '@/lib/utils';

/**
 * TCK-464 — un choix qui GOUVERNE la suite du parcours se montre, il ne se déroule pas.
 *
 * Un `<select>` cache ses options derrière un geste ; sur le type de bien, qui décide de quelles
 * étapes existent, ce coût est mal placé. Sur mobile, la pastille est aussi la seule cible
 * confortable au pouce.
 *
 * `aria-pressed` et non `role="radio"` : le composant sert aussi à des choix facultatifs qu'on
 * peut désélectionner (statut foncier), et un groupe de radios ne se désélectionne pas.
 */
export type ChoiceOption = { readonly value: string; readonly label: string; readonly icon?: string };

export function ChoiceChips({
  options, value, onChange, label, id,
}: {
  readonly options: readonly ChoiceOption[];
  readonly value: string | undefined;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly id: string;
}) {
  return (
    <div>
      <p id={id} className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground">
        {label}
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const actif = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={actif}
              onClick={() => onChange(o.value)}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm',
                'transition-[background-color,border-color,color,transform] duration-150',
                'active:scale-[0.95] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                actif
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {o.icon ? <span aria-hidden="true">{o.icon}</span> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

> `min-h-11` = 44 px. C'est la cible tactile minimale ; en dessous, le doigt rate.

`GeoSuggestionChip.tsx` :

```tsx
'use client';

import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * TCK-464 — la suggestion géographique, et pourquoi elle est un BOUTON.
 *
 * La géo-IP dit où est l'utilisateur, pas où est le bien : un agent à Dakar publie une villa à
 * Saly. Poser « Dakar » dans le champ ville serait écrire à sa place — et une valeur pré-remplie
 * ne se relit pas, elle se valide. La suggestion s'accepte donc d'un geste, et ce qu'elle a
 * rempli reçoit un flash (`wizard-flash`) pour être VU, donc corrigible (AC6).
 */
export function GeoSuggestionChip({
  city, region, onAccept, hidden,
}: {
  readonly city: string;
  readonly region: string;
  readonly onAccept: () => void;
  readonly hidden: boolean;
}) {
  const t = useTranslations('property.wizard');
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onAccept}
      className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-accent bg-accent/10 px-3 py-2.5 text-left text-sm text-accent transition-colors hover:bg-accent/15 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <MapPin className="shrink-0" aria-hidden="true" />
      <span>{region ? t('geoSuggestFull', { city, region }) : t('geoSuggestCity', { city })}</span>
    </button>
  );
}
```

- [ ] **Step 2 : Écrire les six étapes**

Chaque fichier suit le même contrat : un composant nommé, aucun hook de formulaire créé sur place,
`control` reçu en prop.

`StepBien.tsx` — type + contrat, tous deux en pastilles :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import type { PropertyFormValues } from '@/lib/schemas/property';
import { contractTypeValues, propertyTypeValues } from '@/lib/schemas/property';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { ChoiceChips } from '../ChoiceChips';

/** Les emojis servent de repère de forme, pas de décor : ils accélèrent le balayage d'une grille de 16. */
const ICONES: Partial<Record<(typeof propertyTypeValues)[number], string>> = {
  land: '🌍', house: '🏠', apartment: '🏢', villa: '🏡', studio: '🛏', room: '🚪',
  office: '💼', shop: '🏪', warehouse: '📦', factory: '🏭', farm: '🌾', hotel: '🏨',
  resort: '🌴', garage: '🔧', parking: '🅿️', other: '📍',
};

export function StepBien({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContrat = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const { watch, setValue } = form;

  return (
    <>
      <ChoiceChips
        id="wizard-type"
        label={t('fields.type')}
        value={watch('type')}
        onChange={(v) => setValue('type', v as PropertyFormValues['type'], { shouldDirty: true })}
        options={propertyTypeValues.map((v) => ({ value: v, label: tType(v), icon: ICONES[v] }))}
      />
      <ChoiceChips
        id="wizard-contract"
        label={t('fields.contract')}
        value={watch('contract_type')}
        onChange={(v) =>
          setValue('contract_type', v as PropertyFormValues['contract_type'], { shouldDirty: true })
        }
        options={contractTypeValues.map((v) => ({ value: v, label: tContrat(v) }))}
      />
      <p className="rounded-xl bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {t('geoDefaultsNote')}
      </p>
    </>
  );
}
```

`StepLieu.tsx` — suggestion, ville, quartier, région, adresse repliée, carte et position :

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crosshair } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormInput } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { GeoSuggestionChip } from '../GeoSuggestionChip';

export function StepLieu({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const { control, watch, setValue } = form;
  const { suggestion } = useGeoSuggestion();
  const [suggestionUtilisee, setSuggestionUtilisee] = useState(false);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [flash, setFlash] = useState(false);

  const lat = watch('latitude') as number | null | undefined;
  const lng = watch('longitude') as number | null | undefined;

  const accepterSuggestion = () => {
    if (!suggestion) return;
    setValue('city', suggestion.city, { shouldDirty: true, shouldValidate: true });
    if (suggestion.region) setValue('region', suggestion.region, { shouldDirty: true });
    setSuggestionUtilisee(true);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 800);
  };

  // La position de l'APPAREIL, bien plus précise que l'IP — et c'est le geste naturel quand on
  // se trouve dans le bien. Silencieux en cas de refus : l'utilisateur a déjà répondu « non ».
  const utiliserMaPosition = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setValue('latitude', pos.coords.latitude, { shouldDirty: true });
      setValue('longitude', pos.coords.longitude, { shouldDirty: true });
    });
  };

  return (
    <>
      {suggestion ? (
        <GeoSuggestionChip
          city={suggestion.city}
          region={suggestion.region}
          onAccept={accepterSuggestion}
          hidden={suggestionUtilisee}
        />
      ) : null}

      <FormInput
        control={control}
        name="city"
        label={t('fields.city')}
        required
        placeholder={t('placeholders.city')}
        containerClassName={flash ? 'wizard-flash rounded-lg' : undefined}
      />
      <FormInput control={control} name="quarter" label={t('fields.quarter')}
        placeholder={t('placeholders.quarter')} />
      <FormInput control={control} name="region" label={t('fields.region')}
        placeholder={t('placeholders.region')} />

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDetailsOuverts((o) => !o)}
          aria-expanded={detailsOuverts}>
          {detailsOuverts ? t('addressDetailsHide') : t('addressDetailsShow')}
        </Button>
        {/*
          `grid-template-rows: 0fr → 1fr` : le bloc se DÉPLIE en hauteur. Un `display:none` le
          ferait surgir sous le doigt — et c'est précisément ce qui fait rater une cible.
        */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ gridTemplateRows: detailsOuverts ? '1fr' : '0fr', opacity: detailsOuverts ? 1 : 0 }}
        >
          <div className="overflow-hidden">
            <div className="space-y-5 pt-3">
              <FormInput control={control} name="street" label={t('fields.street')}
                placeholder={t('placeholders.street')} />
              <FormInput control={control} name="postal_code" label={t('fields.postalCode')}
                placeholder="10700" />
              <FormInput control={control} name="country" label={t('fields.country')}
                placeholder="SN" maxLength={2} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Button type="button" variant="outline" size="lg" className="w-full"
          onClick={utiliserMaPosition}>
          <Crosshair aria-hidden="true" />
          {t('useMyPosition')}
        </Button>
        <LocationPickerMapLoader
          lat={lat}
          lng={lng}
          onChange={(nLat, nLng) => {
            setValue('latitude', nLat, { shouldDirty: true });
            setValue('longitude', nLng, { shouldDirty: true });
          }}
        />
        <p className="text-xs text-muted-foreground">{t('mapHint')}</p>
      </div>
    </>
  );
}
```

`StepCaracteristiques.tsx` — **entièrement pilotée par la matrice** :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import { FormCheckbox, FormInput } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { titleTypeValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';
import { areaLabelKey, isFieldRelevant } from '../../field-matrix';
import { ChoiceChips } from '../ChoiceChips';

export function StepCaracteristiques({
  form, tags,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly tags: readonly Tag[];
}) {
  const t = useTranslations('property.wizard');
  const tTitre = useTranslations('property.titleTypes');
  const { control, watch, setValue } = form;
  const ctx = { type: watch('type'), contract: watch('contract_type') } as const;
  const pertinent = (cle: Parameters<typeof isFieldRelevant>[0]) => isFieldRelevant(cle, ctx);
  const tagIds = (watch('tag_ids') ?? []) as number[];

  return (
    <>
      <FormInput control={control} name="area" label={t(areaLabelKey(ctx.type))}
        type="number" inputMode="numeric" min={0} placeholder="120" />

      {pertinent('bedrooms') || pertinent('bathrooms') ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {pertinent('bedrooms') ? (
            <FormInput control={control} name="bedrooms" label={t('fields.bedrooms')}
              type="number" inputMode="numeric" min={0} />
          ) : null}
          {pertinent('bathrooms') ? (
            <FormInput control={control} name="bathrooms" label={t('fields.bathrooms')}
              type="number" inputMode="numeric" min={0} />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {pertinent('floor_number') ? (
          <FormInput control={control} name="floor_number" label={t('fields.floorNumber')}
            type="number" inputMode="numeric" min={-5} max={200} />
        ) : null}
        {pertinent('total_floors') ? (
          <FormInput control={control} name="total_floors" label={t('fields.totalFloors')}
            type="number" inputMode="numeric" min={1} max={200} />
        ) : null}
        {pertinent('year_built') ? (
          <FormInput control={control} name="year_built" label={t('fields.yearBuilt')}
            type="number" inputMode="numeric" min={1800} max={2100} placeholder="2010" />
        ) : null}
        {pertinent('parking_spaces') ? (
          <FormInput control={control} name="parking_spaces" label={t('fields.parking')}
            type="number" inputMode="numeric" min={0} placeholder="2" />
        ) : null}
      </div>

      {pertinent('furnished') ? (
        <FormCheckbox control={control} name="furnished" label={t('fields.furnished')} />
      ) : null}

      {pertinent('title_type') ? (
        <div className="space-y-2">
          <ChoiceChips
            id="wizard-title-type"
            label={t('fields.titleType')}
            value={watch('title_type')}
            onChange={(v) =>
              setValue('title_type', v as PropertyFormValues['title_type'], { shouldDirty: true })
            }
            options={titleTypeValues.map((v) => ({ value: v, label: tTitre(v) }))}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t('titleTypeHint')}</p>
        </div>
      ) : null}

      {pertinent('tag_ids') && tags.length > 0 ? (
        <ChoiceChips
          id="wizard-tags"
          label={t('fields.amenities')}
          value={undefined}
          onChange={(v) => {
            const id = Number(v);
            setValue('tag_ids', tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id],
              { shouldDirty: true });
          }}
          options={tags.map((tag) => ({
            value: String(tag.id),
            label: tag.name,
            icon: tag.icon ?? undefined,
          }))}
        />
      ) : null}
    </>
  );
}
```

> ⚠ `ChoiceChips` est mono-sélection ; pour les tags, `value={undefined}` neutralise son état
> actif et la sélection multiple est portée par `tag_ids`. **Si l'état actif des tags doit se
> voir** — et il le doit — étendre `ChoiceChips` d'une prop `selected?: readonly string[]` qui
> prend le pas sur `value`, et l'ajouter au test de la Task 7. À faire dans cette même tâche :
> une pastille sélectionnée qui ne se distingue pas est un bogue, pas une finition.

`StepPrix.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import { FormDatePicker, FormInput, FormSelect } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import {
  PROPERTY_ENUM_NAMESPACES,
  currencyOptions as fabriqueCurrencyOptions,
  rentPeriodOptions as fabriqueRentPeriodOptions,
} from '../../options';
import { isFieldRelevant } from '../../field-matrix';

export function StepPrix({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tDevise = useTranslations(PROPERTY_ENUM_NAMESPACES.currency);
  const tPeriode = useTranslations(PROPERTY_ENUM_NAMESPACES.rentPeriod);
  const { control, watch } = form;
  const ctx = { type: watch('type'), contract: watch('contract_type') } as const;
  const location = isFieldRelevant('rent_period', ctx);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <FormInput control={control} name="price" label={t('fields.price')} required
          type="number" inputMode="numeric" min={0}
          placeholder={location ? '350000' : '25000000'} />
        <FormSelect control={control} name="currency" label={t('fields.currency')}
          options={fabriqueCurrencyOptions(tDevise)} />
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gridTemplateRows: location ? '1fr' : '0fr', opacity: location ? 1 : 0 }}
        aria-hidden={!location}
      >
        <div className="overflow-hidden">
          <div className="space-y-5 pt-1">
            <FormSelect control={control} name="rent_period" label={t('fields.period')}
              options={fabriqueRentPeriodOptions(tPeriode)} placeholder={t('placeholders.period')} />
            <FormDatePicker control={control} name="available_from" label={t('fields.availableFrom')} />
          </div>
        </div>
      </div>
    </>
  );
}
```

> `aria-hidden={!location}` : le bloc replié reste dans le DOM pour que la transition de hauteur
> existe, mais il sort de l'arbre d'accessibilité — sans quoi un lecteur d'écran annoncerait deux
> champs invisibles.

`StepPhotos.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { MediaDropzone } from '@/components/media';

const MAX_PHOTOS = 10;

export function StepPhotos({
  files, onChange, onRemove, error,
}: {
  readonly files: File[];
  readonly onChange: (files: File[]) => void;
  readonly onRemove: (index: number) => void;
  readonly error: string | null;
}) {
  const t = useTranslations('property.wizard');

  return (
    <>
      <MediaDropzone onChange={onChange} files={files} onRemove={onRemove} maxFiles={MAX_PHOTOS} />
      <p className="text-xs text-muted-foreground">
        {t('photosCounter', { count: files.length, max: MAX_PHOTOS })}
      </p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </>
  );
}
```

`StepFinition.tsx` :

```tsx
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormInput, FormTextarea } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { suggestTitle } from '../suggest-title';

export function StepFinition({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const { control, watch, setValue, getValues } = form;
  const description = watch('description') ?? '';

  // Le titre n'est proposé QUE s'il est encore vide : une fois l'utilisateur passé dessus, sa
  // saisie l'emporte, y compris s'il revient en arrière changer la surface. Écraser un titre
  // saisi serait le pire des deux mondes — on lui aurait pris le champ ET le contrôle.
  useEffect(() => {
    if ((getValues('title') ?? '').trim().length > 0) return;
    const propose = suggestTitle(
      {
        type: getValues('type'),
        area: getValues('area'),
        bedrooms: getValues('bedrooms'),
        quarter: getValues('quarter'),
        city: getValues('city'),
      },
      tType,
    );
    if (propose) setValue('title', propose, { shouldDirty: true, shouldValidate: true });
  }, [getValues, setValue, tType]);

  return (
    <>
      <FormInput control={control} name="title" label={t('fields.title')} required maxLength={200} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {t('titleComposedHint')}
      </p>
      <FormTextarea control={control} name="description" label={t('fields.description')} rows={4}
        placeholder={t('placeholders.description')} />
      <p className="text-right text-xs text-muted-foreground">
        {t('descriptionCounter', { count: description.length })}
      </p>
    </>
  );
}
```

- [ ] **Step 3 : Vérifier le typage et le lint**

```bash
npx tsc --noEmit && npm run lint
```

Attendu : aucune erreur. ⚠ Si ESLint signale `react-hooks/preserve-manual-memoization`, retirer la
mémoïsation manuelle — ne pas l'ajuster : sa présence fait abandonner la compilation du composant
entier (ADR-0015).

- [ ] **Step 4 : Commit**

```bash
git add src/components/property-form/wizard/
git commit -m "feat(web): les six étapes du parcours, pilotées par la matrice de pertinence (TCK-464)"
```

---

## Task 9 : L'assemblage — validation par étape, brouillon, soumission

**Files:**
- Create: `takussan-web/src/components/property-form/PropertyWizard.tsx`
- Modify: `takussan-web/src/components/property-form/index.ts`
- Modify: `takussan-web/src/app/(dashboard)/app/properties/new/page.tsx`
- Test: `takussan-web/src/components/property-form/__tests__/PropertyWizard.test.tsx`

**Interfaces:**
- Consumes: tout ce qui précède ; `useApiForm` de `@/hooks/useApiForm` ; `useWizardDraft` de
  `@/hooks/useWizardDraft` ; les actions de `@/app/actions/dashboard-properties`.
- Produces: `<PropertyWizard tags={Tag[]} />`, exporté depuis `@/components/property-form`.

**Les clés à valider par étape** (c'est le contrat de `form.trigger`) :

| Étape | Clés déclenchées |
|---|---|
| 1 · le bien | `['type', 'contract_type']` |
| 2 · où | `['city', 'quarter', 'region', 'street', 'postal_code', 'country']` |
| 3 · caractéristiques | les clés conditionnelles pertinentes pour le couple courant |
| 4 · prix | `['price', 'currency', 'rent_period', 'available_from']` |
| 5 · photos | `[]` |
| 6 · finition | `['title', 'description']` |

> On ne valide **jamais** un champ que l'utilisateur n'a pas atteint : c'est ce qui rend un
> parcours guidé supportable. `form.trigger([])` rend `true` — l'étape photos n'a rien à valider.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `takussan-web/src/components/property-form/__tests__/PropertyWizard.test.tsx` :

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { PropertyWizard } from '../PropertyWizard';

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => routerMocks }));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({
    location: { city: 'Dakar', region: 'Dakar', country_code: 'SN', currency: 'XOF' },
    loading: false,
    city: 'Dakar',
  }),
}));
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    isLoading: false, isSaving: false, error: null, draft: null,
    save: vi.fn(), flush: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));

import {
  createPropertyAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';

function monter() {
  return render(<PropertyWizard tags={[]} />, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="fr" messages={messages}>{children}</NextIntlClientProvider>
    ),
  });
}

const suivant = () => screen.getByRole('button', { name: /continuer/i });

async function allerAEtape(user: ReturnType<typeof userEvent.setup>, type: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(type, 'i') }));
  await user.click(screen.getByRole('button', { name: /vendre/i }));
  await user.click(suivant());                                  // → étape 2 (où)
  await user.type(screen.getByLabelText(/ville/i), 'Dakar');
  await user.click(suivant());                                  // → étape 3 (caractéristiques)
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
});

describe('PropertyWizard', () => {
  it('AC2 — un terrain ne demande ni chambres, ni meublé, ni année de construction', async () => {
    const user = userEvent.setup();
    monter();
    await allerAEtape(user, 'terrain');

    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/meublé/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/année de construction/i)).not.toBeInTheDocument();
    expect(screen.getByText(/statut foncier/i)).toBeInTheDocument();
  });

  it('AC3 — un appartement demande son étage, pas son nombre de niveaux', async () => {
    const user = userEvent.setup();
    monter();
    await allerAEtape(user, 'appartement');

    expect(screen.getByLabelText(/chambres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/étage/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre de niveaux/i)).not.toBeInTheDocument();
  });

  it('AC6 — la ville reste vide tant que la suggestion n’est pas acceptée', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: /villa/i }));
    await user.click(screen.getByRole('button', { name: /louer/i }));
    await user.click(suivant());

    const ville = screen.getByLabelText(/ville/i) as HTMLInputElement;
    expect(ville.value).toBe('');

    await user.click(screen.getByRole('button', { name: /dakar/i }));
    expect(ville.value).toBe('Dakar');
  });

  it('bloque l’avance tant que le type et le contrat ne sont pas choisis', async () => {
    monter();
    expect(suivant()).toBeDisabled();
  });

  it('ne valide pas les champs des étapes non atteintes', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: /villa/i }));
    await user.click(screen.getByRole('button', { name: /vendre/i }));
    await user.click(suivant());

    // Le prix est requis, et l'étape 2 s'ouvre quand même : on ne réclame pas ce qui n'a pas été
    // demandé. C'est ce qui rend un parcours guidé supportable.
    expect(screen.getByLabelText(/ville/i)).toBeInTheDocument();
    expect(screen.queryByText(/prix.*requis/i)).not.toBeInTheDocument();
  });

  it('AC7 — un échec des photos dit que le bien EST créé et n’en crée pas un second', async () => {
    vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({
      ok: false, message: 'Envoi impossible',
    } as never);

    const user = userEvent.setup();
    monter();
    await allerAEtape(user, 'villa');
    for (let i = 0; i < 3; i += 1) await user.click(suivant());
    await user.type(screen.getByLabelText(/^prix/i), '25000000');
    await user.click(screen.getByRole('button', { name: /publier|soumettre/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/bien.*créé|créé.*photos/i);
    });
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
npm run test -- src/components/property-form/__tests__/PropertyWizard.test.tsx
```

Attendu : **FAIL** — module `../PropertyWizard` introuvable.

- [ ] **Step 3 : Écrire l'assemblage**

Créer `takussan-web/src/components/property-form/PropertyWizard.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FormGlobalError } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { useWizardDraft } from '@/hooks/useWizardDraft';
import { ApiError } from '@/lib/api';
import {
  propertyFormSchema,
  type PropertyFormPayload,
  type PropertyFormValues,
} from '@/lib/schemas/property';
import {
  createPropertyAction,
  setPropertyTagsAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';

import { isFieldRelevant, type ConditionalFieldKey } from './field-matrix';
import { toCreatePayload } from './payload';
import { WizardShell, type WizardStepDef } from './wizard/WizardShell';
import { StepBien } from './wizard/steps/StepBien';
import { StepLieu } from './wizard/steps/StepLieu';
import { StepCaracteristiques } from './wizard/steps/StepCaracteristiques';
import { StepPrix } from './wizard/steps/StepPrix';
import { StepPhotos } from './wizard/steps/StepPhotos';
import { StepFinition } from './wizard/steps/StepFinition';

const CLE_BROUILLON = 'property-create-wizard';

/** Les clés qu'une étape possède. L'étape 3 les tire de la matrice — elles varient avec le type. */
const CLES_PAR_ETAPE: readonly (keyof PropertyFormValues)[][] = [
  ['type', 'contract_type'],
  ['city', 'quarter', 'region', 'street', 'postal_code', 'country'],
  [],
  ['price', 'currency', 'rent_period', 'available_from'],
  [],
  ['title', 'description'],
];

const CARACTERISTIQUES: readonly ConditionalFieldKey[] = [
  'area', 'bedrooms', 'bathrooms', 'furnished', 'year_built',
  'parking_spaces', 'floor_number', 'total_floors', 'title_type',
];

function valeursInitiales(): PropertyFormValues {
  return {
    title: '', type: 'apartment', contract_type: 'rent',
    price: undefined as unknown as number, currency: 'XOF', rent_period: undefined,
    city: '', quarter: '', region: '', street: '', postal_code: '', country: '',
    latitude: undefined, longitude: undefined, area: undefined, bedrooms: undefined,
    bathrooms: undefined, furnished: false, year_built: undefined, parking_spaces: undefined,
    floor_number: undefined, total_floors: undefined, title_type: undefined,
    available_from: undefined, description: '', tag_ids: [],
  };
}

export function PropertyWizard({ tags = [] }: { readonly tags?: Tag[] }) {
  const t = useTranslations('property.wizard');
  const router = useRouter();
  const { defaults } = useGeoSuggestion();
  const brouillon = useWizardDraft<Partial<PropertyFormValues>>(CLE_BROUILLON);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [erreurPhotos, setErreurPhotos] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [idCree, setIdCree] = useState<number | null>(null);

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<PropertyFormValues, PropertyDetail>({
      schema: propertyFormSchema,
      defaultValues: valeursInitiales(),
      onSubmit: async (values) => {
        // Un bien déjà créé n'est jamais recréé : une reprise après échec partiel (photos,
        // tags) rejoue les écritures manquantes, pas la création. C'est l'AC7.
        if (idCree !== null) return { id: idCree } as PropertyDetail;

        const resultat = await createPropertyAction(
          toCreatePayload(values as unknown as PropertyFormPayload, 'submit') as never,
        );
        if (!resultat.ok) {
          throw new ApiError(resultat.status ?? 500, {
            message: resultat.message, errors: resultat.errors,
          });
        }
        return resultat.data as PropertyDetail;
      },
      onSuccess: async (bien) => {
        if (!bien?.id) throw new ApiError(500, { message: t('missingId') });
        setIdCree(bien.id);

        const valeurs = form.getValues() as unknown as PropertyFormPayload;
        const echecs: string[] = [];

        if (valeurs.tag_ids?.length) {
          const r = await setPropertyTagsAction(bien.id, valeurs.tag_ids);
          if (!r.ok) echecs.push(t('partial.tags'));
        }

        if (photos.length > 0) {
          const formData = new FormData();
          for (const f of photos) formData.append('photos', f);
          const r = await uploadPropertyPhotosAction(bien.id, formData);
          if (!r.ok) echecs.push(t('partial.photos'));
        }

        // Un échec ici n'est PAS un échec de création : le dire autrement enverrait
        // l'utilisateur recommencer, et créer un doublon.
        if (echecs.length > 0) {
          setAvertissement(t('partial.message', { items: echecs.join(', ') }));
          return;
        }

        await brouillon.clear();
        router.push(`/app/properties/${bien.id}`);
        router.refresh();
      },
    });

  const { watch, getValues, setValue, trigger } = form;
  const type = watch('type');
  const contrat = watch('contract_type');

  // Le CERTAIN, posé d'office et une seule fois : pays, devise. La ville et la région, elles,
  // restent à la suggestion (AC6). `country` n'est écrit que s'il est encore vide — un retour
  // en arrière ne doit pas écraser une correction.
  useEffect(() => {
    if (defaults.country && !getValues('country')) setValue('country', defaults.country);
    if (defaults.currency) setValue('currency', defaults.currency);
  }, [defaults.country, defaults.currency, getValues, setValue]);

  // Autosave silencieux, débounce 800 ms côté hook. Persiste SUR LE SERVEUR (TCK-250), donc un
  // brouillon survit au changement d'appareil — pas seulement à un rechargement d'onglet.
  useEffect(() => {
    const abonnement = watch((valeurs) => brouillon.save(index, valeurs as Partial<PropertyFormValues>));
    return () => abonnement.unsubscribe();
  }, [watch, brouillon, index]);

  const naviguer = async (suivant: number, sens: 1 | -1) => {
    if (sens > 0) {
      const cles =
        index === 2
          ? CARACTERISTIQUES.filter((c) => isFieldRelevant(c, { type, contract: contrat }))
          : CLES_PAR_ETAPE[index];
      const valide = await trigger(cles as never);
      if (!valide) return;
    }
    setDirection(sens);
    setIndex(suivant);
  };

  const etapes: WizardStepDef[] = [
    {
      id: 'bien', title: t('steps.bien.title'), subtitle: t('steps.bien.subtitle'),
      body: <StepBien form={form} />,
      canAdvance: Boolean(type && contrat),
    },
    {
      id: 'lieu', title: t('steps.lieu.title'), subtitle: t('steps.lieu.subtitle'),
      body: <StepLieu form={form} />,
    },
    {
      id: 'caracteristiques',
      title: t('steps.caracteristiques.title', { type: t(`typeLower.${type}`) }),
      subtitle: t(
        isFieldRelevant('bedrooms', { type, contract: contrat })
          ? 'steps.caracteristiques.subtitle'
          : 'steps.caracteristiques.subtitleShort',
      ),
      body: <StepCaracteristiques form={form} tags={tags} />,
    },
    {
      id: 'prix', title: t('steps.prix.title'),
      subtitle: t(contrat === 'rent' ? 'steps.prix.subtitleRent' : 'steps.prix.subtitleSale'),
      body: <StepPrix form={form} />,
    },
    {
      id: 'photos', title: t('steps.photos.title'), subtitle: t('steps.photos.subtitle'),
      skippable: true,
      body: (
        <StepPhotos
          files={photos}
          onChange={(f) => { setErreurPhotos(null); setPhotos((p) => [...p, ...f]); }}
          onRemove={(i) => setPhotos((p) => p.filter((_, k) => k !== i))}
          error={erreurPhotos}
        />
      ),
    },
    {
      id: 'finition', title: t('steps.finition.title'), subtitle: t('steps.finition.subtitle'),
      body: <StepFinition form={form} />,
    },
  ];

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FormGlobalError>
        {globalError ? (
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button type="button" onClick={clearGlobalError} className="text-xs underline">
              {t('close')}
            </button>
          </span>
        ) : null}
      </FormGlobalError>

      {avertissement ? (
        <p role="alert"
          className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          {avertissement}
        </p>
      ) : null}

      <WizardShell
        steps={etapes}
        index={index}
        direction={direction}
        onNavigate={(n, s) => void naviguer(n, s)}
        onFinish={() => void handleSubmit()}
        finishLabel={t('publish')}
        busy={isSubmitting}
        footerExtra={
          <Button type="button" variant="ghost" size="sm"
            onClick={async () => { await brouillon.flush(); router.push('/app/properties'); }}>
            {t('resumeLater')}
          </Button>
        }
      />
    </form>
  );
}
```

- [ ] **Step 4 : Exporter et câbler la route**

`src/components/property-form/index.ts` :

```ts
export { PropertyForm } from './PropertyForm';
export { PropertyWizard } from './PropertyWizard';
export { PropertyModerationBanner } from './PropertyModerationBanner';
```

Dans `src/app/(dashboard)/app/properties/new/page.tsx`, remplacer l'import et le rendu :

```tsx
import { PropertyWizard } from '@/components/property-form';
// …
<PropertyWizard tags={tags} />
```

`PropertyForm` reste importé par `PropertyDetailTabs` en mode édition — ne pas le supprimer.

- [ ] **Step 5 : Ajouter les clés i18n de l'assemblage**

Compléter `property.wizard` dans les **trois** dictionnaires : `steps.*` (six titres et
sous-titres, dont `caracteristiques.subtitleShort` et `prix.subtitleRent`/`subtitleSale`),
`typeLower.*` (les 16 types en minuscule, pour l'interpolation « Parlez-nous du terrain »),
`fields.*`, `placeholders.*`, `partial.{tags,photos,message}`, `publish`, `resumeLater`,
`missingId`, `close`, `geoSuggestFull`, `geoSuggestCity`, `geoDefaultsNote`, `useMyPosition`,
`mapHint`, `addressDetailsShow`, `addressDetailsHide`, `titleTypeHint`, `titleComposedHint`,
`photosCounter`, `descriptionCounter`.

Ajouter aussi le vocabulaire `property.titleTypes`, **au caractère près** ce qu'émet
`takussan-api/lang/<locale>/properties.php` — c'est la condition pour que la Task 11 puisse
resserrer la garde de parité sans ajouter de tolérance :

```json
"titleTypes": {
  "bail": "Bail", "titre_foncier": "Titre foncier",
  "deliberation": "Délibération", "autre": "Autre"
}
```

`en` : `Lease` · `Land Title` · `Deliberation` · `Other`.
`wo` : `Contrat` · `Titre foncier` · `Délibération` · `Yeneen`.

- [ ] **Step 6 : Relancer les tests**

```bash
npm run test -- src/components/property-form/__tests__/PropertyWizard.test.tsx
node scripts/check-i18n.mjs
```

Attendu : **PASS** — 6 tests, garde i18n verte.

- [ ] **Step 7 : Commit**

```bash
git add src/components/property-form/PropertyWizard.tsx \
        src/components/property-form/index.ts \
        src/components/property-form/__tests__/PropertyWizard.test.tsx \
        "src/app/(dashboard)/app/properties/new/page.tsx" \
        src/messages/fr.json src/messages/en.json src/messages/wo.json
git commit -m "feat(web): parcours guidé de publication branché sur /app/properties/new (TCK-464)"
```

---

## Task 10 : L'édition alignée sur la matrice

**Files:**
- Modify: `takussan-web/src/components/property-form/PropertyForm.tsx`
- Modify: `takussan-web/src/components/property-form/__tests__/PropertyForm.test.tsx`

**Interfaces:**
- Consumes: `isFieldRelevant`, `areaLabelKey`, `sanitizeByType` (Task 2) ; `toUpdatePayload`
  (Task 3) ; `titleTypeValues` (Task 3).
- Produces: `PropertyForm` ne sert plus que `mode="edit"` ; sa prop `mode` devient
  `readonly mode: 'edit'`.

**Ce qui change, exhaustivement :**

1. La section « Caractéristiques » enveloppe chaque champ dans `isFieldRelevant(...)`.
2. La section gagne `title_type` (`FormSelect`), `floor_number` / `total_floors`, et
   `available_from` (`FormDatePicker`, sous condition `contract_type === 'rent'`).
3. `toDefaults` lit les quatre nouveaux champs depuis `PropertyDetail`.
4. La soumission passe par `toUpdatePayload` : l'adresse part imbriquée dans le `PUT`, et
   `setPropertyAddressAction` **disparaît de ce chemin**.
5. `mode === 'create'` et tout ce qu'il gardait (`selectSubmitIntent`, section Photos,
   bouton brouillon, `createPropertyAction`) sont **supprimés** — la création est ailleurs.

- [ ] **Step 1 : Ajouter les tests d'édition**

Dans `src/components/property-form/__tests__/PropertyForm.test.tsx`, ajouter :

```tsx
describe('conditionnalité en édition (TCK-464)', () => {
  function bien(patch: Record<string, unknown> = {}) {
    return {
      id: 7, title: 'Terrain Diamniadio', type: 'land', contract_type: 'sale',
      price: 25_000_000, currency: 'XOF', title_type: 'bail',
      location: { city: 'Diamniadio' }, tags: [], ...patch,
    } as never;
  }

  it('AC2 — éditer un terrain ne demande plus ses chambres', () => {
    render(<PropertyForm mode="edit" property={bien()} tags={[]} />, { wrapper });
    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/année de construction/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/statut foncier/i)).toBeInTheDocument();
  });

  it('AC5 — le statut foncier existant est pré-rempli', () => {
    render(<PropertyForm mode="edit" property={bien()} tags={[]} />, { wrapper });
    expect(screen.getByLabelText(/statut foncier/i)).toHaveValue('bail');
  });

  it('AC3 — éditer un appartement demande son étage, pas ses niveaux', () => {
    render(
      <PropertyForm mode="edit" property={bien({ type: 'apartment', contract_type: 'rent' })} tags={[]} />,
      { wrapper },
    );
    expect(screen.getByLabelText(/étage/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre de niveaux/i)).not.toBeInTheDocument();
  });

  it('AC1 — la ville modifiée part dans le bloc address du PUT', async () => {
    const user = userEvent.setup();
    vi.mocked(updatePropertyAction).mockResolvedValue({ ok: true, data: { id: 7 } } as never);
    render(<PropertyForm mode="edit" property={bien()} tags={[]} />, { wrapper });

    await user.clear(screen.getByLabelText(/ville/i));
    await user.type(screen.getByLabelText(/ville/i), 'Thiès');
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledWith(
        7, expect.objectContaining({ address: expect.objectContaining({ city: 'Thiès' }) }),
      );
    });
  });
});
```

- [ ] **Step 2 : Lancer et vérifier l'échec**

```bash
npm run test -- src/components/property-form/__tests__/PropertyForm.test.tsx
```

Attendu : **4 échecs** — « Chambres » toujours présent, « Statut foncier » absent, et
`updatePropertyAction` appelé avec `city` au premier niveau.

- [ ] **Step 3 : Appliquer les cinq changements ci-dessus**

Point de vigilance : `toDefaults` doit lire `property.available_from` — le champ n'existait pas
dans `PropertyDetail` avant la Task 3, et `PropertyResource` ne l'émettait pas avant la Task 1.
Sans les deux, ce champ serait pré-rempli vide en permanence, et chaque enregistrement l'effacerait
en base.

- [ ] **Step 4 : Relancer**

```bash
npm run test -- src/components/property-form/__tests__/PropertyForm.test.tsx
npx tsc --noEmit
```

Attendu : **PASS**, `tsc` propre. Si `tsc` signale `mode="create"` quelque part, c'est un appelant
oublié : il doit passer à `PropertyWizard`.

- [ ] **Step 5 : Commit**

```bash
git add src/components/property-form/PropertyForm.tsx \
        src/components/property-form/__tests__/PropertyForm.test.tsx
git commit -m "refactor(web): l'édition d'un bien lit la même matrice de pertinence que la création (TCK-464)"
```

---

## Task 11 : Resserrer la garde de parité des libellés

**Files:**
- Modify: `takussan-web/src/types/__tests__/property-labels.parity.test.ts:55-60`

**Interfaces:**
- Consumes: le sous-arbre `property.titleTypes` des trois dictionnaires (Task 9).

**Pourquoi c'est une tâche et non une ligne perdue ailleurs :** le commentaire de `GROUPES` dit
aujourd'hui « `title_type` n'a pas de pendant front ». À partir de la Task 9, c'est faux. Une garde
dont le commentaire ment est pire qu'une garde absente : on la croit.

- [ ] **Step 1 : Ajouter le groupe**

```ts
/** Groupe PHP → sous-arbre `property.*` du dictionnaire. */
const GROUPES: Record<string, string> = {
  type: 'types',
  contract_type: 'contractTypes',
  rent_period: 'rentPeriods',
  status: 'status',
  // TCK-464 — `title_type` A un pendant front depuis que le formulaire l'expose. Le
  // vocabulaire a été aligné au caractère près sur `lang/<locale>/properties.php` DANS le
  // même lot : aucune entrée n'entre dans DIVERGENCES_CONNUES, la garde se resserre sans
  // acquérir de tolérance.
  title_type: 'titleTypes',
};
```

- [ ] **Step 2 : Lancer la garde**

```bash
npm run test -- src/types/__tests__/property-labels.parity.test.ts
```

Attendu : **PASS**, et `DIVERGENCES_CONNUES` **inchangée** — 44 entrées, pas 45. Si le test rougit
sur une entrée `title_type.*`, c'est que le dictionnaire de la Task 9 diverge d'un caractère :
corriger le **dictionnaire**, jamais la liste de tolérance.

- [ ] **Step 3 : Commit**

```bash
git add src/types/__tests__/property-labels.parity.test.ts
git commit -m "test(web): la garde de parité des libellés couvre désormais title_type (TCK-464)"
```

---

## Task 12 : Vérification complète et rituel de fin de branche

**Files:** aucun — vérification seule.

> ⚠ Cette tâche est portée par la **session déléguante**, jamais par un agent délégué. La suite
> entière lancée par dix agents ne se partage pas la machine, elle la sature : ×11 mesuré à
> `load average` 200-258. Et un rouge sous charge accuse le mauvais coupable.

- [ ] **Step 1 : Front — les quatre portes**

```bash
cd takussan-web
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

Attendu : 0 erreur ESLint, `tsc` silencieux, suite verte, build réussi.

- [ ] **Step 2 : Les gardes du dépôt, toutes**

```bash
cd .. && for g in scripts/check-*.mjs; do node "$g" >/dev/null || echo "✗ $g"; done
node docs/backlog/gen-index.mjs --check
node docs/gen-features-by-actor.mjs --check
```

Attendu : aucune ligne `✗`, les deux générateurs à jour.

- [ ] **Step 3 : Backend — Pint puis la suite entière**

```bash
cd takussan-api
docker compose -f ../docker-compose.yml up -d postgres
./vendor/bin/pint --test
php artisan test
```

Attendu : Pint propre, suite verte. **Référence : 470 à 610 s machine au repos.** Relever
`uptime` et `sysctl -n hw.ncpu` à côté du chiffre — un temps pris sous charge décrit la machine,
pas le dépôt, et ne se compare à rien.

- [ ] **Step 4 : Le cliquet de couverture, dans sa forme EXACTE**

```bash
XDEBUG_MODE=coverage php vendor/phpunit/phpunit/phpunit --coverage-clover=storage/coverage/clover.xml
php bin/coverage-gate.php storage/coverage/clover.xml --min=86
```

⚠ La **variable d'environnement**, pas `-d xdebug.mode=…`. Et **jamais** `php artisan test
--coverage --min=86` pour en juger : cette forme sait sortir en 0 sans avoir rien mesuré (J-10).
Une sortie sans ligne `Total:` n'a pas mesuré la couverture.

- [ ] **Step 5 : Vérification par ablation — la seule qui prouve quelque chose**

Pour AC1, AC2 et AC4, remettre temporairement le code fautif et vérifier que le test **rougit** :

```bash
# AC1 — rétablir l'ancienne condition d'adresse dans payload.ts (retirer `city` du bloc)
npm run test -- src/components/property-form/__tests__/payload.test.ts   # DOIT échouer
git checkout src/components/property-form/payload.ts
```

*Un test vert ne prouve rien s'il serait vert sans le correctif.* Faire de même pour la purge
(Task 2) et la conditionnalité (Task 9) avant de proposer la fusion.

- [ ] **Step 6 : Passer le ticket à `done` et régénérer l'index**

Éditer le frontmatter de `docs/backlog/tickets/TCK-464-*.md` : `status: done`, `updated:` à la date
du jour. Puis :

```bash
node docs/backlog/gen-index.mjs && node docs/backlog/check-backlog.mjs
```

⚠ **Le statut vaut pour ce qui est mergé sur `dev`.** Tant que la branche n'est pas fusionnée,
c'est `doing`, pas `done`.

- [ ] **Step 7 : Ouvrir la PR vers `dev`**

Ne jamais fusionner ni pousser sans demande explicite. La PR cible **`dev`**, jamais `master` — un
merge vers `master` déploie le front en production via l'intégration Git Vercel, ce qui est une
action sortante et non un rangement de branche.

---

## Auto-relecture du plan

**Couverture des AC du ticket :**

| AC | Tâche(s) |
|---|---|
| AC1 — la ville seule produit une adresse | Task 3 (test), Task 10 (édition), Task 12 §5 (ablation) |
| AC2 — terrain sans chambres, avec statut foncier | Task 2, Task 8, Task 9, Task 10 |
| AC3 — appartement avec étage, sans niveaux | Task 2 (invariant), Task 9, Task 10 |
| AC4 — bascule vente purge `rent_period` | Task 2, Task 3 |
| AC5 — `title_type`, `floor_number`, `postal_code` écrits puis relus | Task 1, Task 10 |
| AC6 — suggestion acceptée, pas posée | Task 4, Task 8, Task 9 |
| AC7 — échec photos ≠ échec de création | Task 9 |
| AC8 — `prefers-reduced-motion` | Task 6 |
| AC9 — 360 px, bouton hors défilement | Task 7 |
| AC10 — lint, tsc, tests, Pint, suite | Task 12 |

**Deux points laissés ouverts, délibérément et nommés :**

1. **`ChoiceChips` en sélection multiple** (Task 8, note en fin d'étape 2) — la version mono-choix
   ne montre pas l'état actif des tags. C'est un bogue, pas une finition : la prop `selected` et
   son test se font dans la Task 8, pas plus tard.
2. **Les trois mots français de `suggest-title.ts`** (Task 5) — entorse assumée et bornée au
   principe n°5, parce que la sortie est une valeur par défaut modifiable et non un libellé
   d'interface. À rouvrir le jour où `en`/`wo` sont servis à des utilisateurs qui publient.

**Un manquement plus large, hors de ce plan :** `globals.css` n'a aucun bloc
`prefers-reduced-motion`, et `fadeInUp` / `cardEnter` / `sectionEnter` s'exécutent donc quelle que
soit la préférence système, sur tout le site. La Task 6 ne neutralise que ce qu'elle introduit —
poser une règle universelle depuis un ticket sur la publication changerait le comportement de
tout le produit sans que personne ne l'ait instruit. **À ouvrir en ticket propre.**
