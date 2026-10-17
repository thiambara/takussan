<?php

namespace Tests\Feature\Search;

use App\Models\Document;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * P16.03 (TCK-785) — `GET /api/documents?filter[search]=…` classe par pertinence, comme les
 * clients, les interventions, les agences et les utilisateurs (TCK-281).
 *
 * Rouge avant correctif : `DocumentController::index()` posait `->defaultSort('-created_at')` en
 * dur, et jetait l'ordre de Meilisearch. Les trois documents sont créés dans l'ordre INVERSE de
 * leur pertinence : le tri par date rendrait 2-fautes, 1-faute, exact.
 */
class DocumentListRelevanceTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @return array{0: User, 1: Document, 2: Document, 3: Document} */
    private function troisDocuments(): array
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        $doc = fn (string $nom, int $jours) => Document::factory()->create([
            'documentable_id' => $property->id,
            'documentable_type' => Property::class,
            'uploaded_by' => $user->id,
            'name' => $nom,
            'description' => null,
            'created_at' => now()->subDays($jours),
        ]);
        $exact = $doc('Ndiayefall', 3);
        $uneFaute = $doc('Ndiayefalt', 2);
        $deuxFautes = $doc('Ndiayefaxt', 1);
        $this->indexSearchable(Document::class);

        return [$user, $exact, $uneFaute, $deuxFautes];
    }

    public function test_la_recherche_classe_par_pertinence_et_non_par_date(): void
    {
        [$user, $exact, $uneFaute, $deuxFautes] = $this->troisDocuments();
        Sanctum::actingAs($user);

        $ids = $this->getJson('/api/documents?filter[search]=Ndiayefall&fields[documents]=id,name')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $uneFaute->id, $deuxFautes->id], $ids);
    }

    public function test_un_sort_explicite_reste_souverain(): void
    {
        [$user, $exact, $uneFaute, $deuxFautes] = $this->troisDocuments();
        Sanctum::actingAs($user);

        $ids = $this->getJson('/api/documents?filter[search]=Ndiayefall&sort=-created_at&fields[documents]=id,name,created_at')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$deuxFautes->id, $uneFaute->id, $exact->id], $ids);
    }

    public function test_sans_recherche_le_plus_recent_d_abord(): void
    {
        [$user, $exact, $uneFaute, $deuxFautes] = $this->troisDocuments();
        Sanctum::actingAs($user);

        $ids = $this->getJson('/api/documents?fields[documents]=id,name,created_at')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$deuxFautes->id, $uneFaute->id, $exact->id], $ids);
    }
}
