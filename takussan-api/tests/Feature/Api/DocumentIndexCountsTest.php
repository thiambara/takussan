<?php

namespace Tests\Feature\Api;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P199.03 (TCK-2165) — la bibliothèque groupe par type une page de 30 triée par date, et chaque
 * groupe affichait le compte de SA page. L'API rend le compte par type de toute la liste filtrée,
 * dans `meta.counts`, chaque type présent, à zéro s'il n'a aucun document.
 */
class DocumentIndexCountsTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/documents?fields[documents]=id,name,type,created_at&sort=-created_at&per_page=30';

    public function test_counts_cover_every_page_of_the_list(): void
    {
        $user = User::factory()->create();
        Document::factory()->count(20)->create(['uploaded_by' => $user->id, 'type' => DocumentType::LeaseContract->value]);
        Document::factory()->count(15)->create(['uploaded_by' => $user->id, 'type' => DocumentType::Receipt->value]);
        // Un tiers : hors de la liste, hors des comptes.
        Document::factory()->count(4)->create(['type' => DocumentType::Receipt->value]);

        Sanctum::actingAs($user);

        $response = $this->getJson(self::URL)->assertOk();

        $this->assertCount(30, $response->json('data'));
        $this->assertSame(35, $response->json('meta.total'));
        $counts = $response->json('meta.counts');
        $this->assertSame(20, $counts['lease_contract']);
        $this->assertSame(15, $counts['receipt']);
        $this->assertSame(0, $counts['passport']);
        $this->assertSame(
            array_map(fn (DocumentType $t) => $t->value, DocumentType::cases()),
            array_keys($counts),
        );
    }

    public function test_counts_follow_the_list_filters(): void
    {
        $user = User::factory()->create();
        Document::factory()->count(3)->create(['uploaded_by' => $user->id, 'type' => DocumentType::LeaseContract->value]);
        Document::factory()->count(2)->create(['uploaded_by' => $user->id, 'type' => DocumentType::Receipt->value]);

        Sanctum::actingAs($user);

        $counts = $this->getJson(self::URL.'&filter[type]=receipt')->assertOk()->json('meta.counts');

        $this->assertSame(0, $counts['lease_contract']);
        $this->assertSame(2, $counts['receipt']);
    }
}
