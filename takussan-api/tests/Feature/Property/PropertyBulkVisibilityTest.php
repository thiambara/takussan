<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC5 — dépublier en lot : bilan par codes, autorisation ligne à ligne, transaction.
 */
class PropertyBulkVisibilityTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $agent;

    /** @var list<int> */
    private array $publicIds;

    private int $foreignId;

    private int $privateId;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $agency);

        $this->publicIds = Property::factory()->count(3)
            ->create(['agency_id' => $agency->id, 'visibility' => PropertyVisibility::Public])
            ->pluck('id')->all();
        $this->foreignId = Property::factory()->create(['agency_id' => Agency::factory()->create()->id])->id;
        $this->privateId = Property::factory()->create(['agency_id' => $agency->id, 'visibility' => PropertyVisibility::Private])->id;
    }

    private function send()
    {
        $unknown = Property::query()->max('id') + 1000;

        return $this->actingAsApi($this->agent)->apiPost('/api/properties/bulk-visibility', [
            'property_ids' => [...$this->publicIds, $this->foreignId, $this->privateId, $unknown],
            'visibility' => 'private',
        ]);
    }

    public function test_the_summary_names_each_refusal_by_code(): void
    {
        $response = $this->send()->assertOk()->assertJsonPath('updated', 3);

        $this->assertEqualsCanonicalizing($this->publicIds, $response->json('updated_ids'));
        $this->assertEqualsCanonicalizing(
            ['forbidden', 'unchanged', 'not_found'],
            collect($response->json('failed'))->pluck('reason')->all(),
        );
        $this->assertSame('forbidden', collect($response->json('failed'))->firstWhere('id', $this->foreignId)['reason']);
        $this->assertSame(3, Property::query()->whereIn('id', $this->publicIds)->where('visibility', 'private')->count());
        $this->assertSame('public', Property::query()->find($this->foreignId)->visibility->value);
    }

    public function test_publishing_in_bulk_is_refused(): void
    {
        $this->actingAsApi($this->agent)->apiPost('/api/properties/bulk-visibility', [
            'property_ids' => $this->publicIds,
            'visibility' => 'public',
        ])->assertStatus(422);
    }

    public function test_an_exception_on_the_second_authorized_row_leaves_all_three_unchanged(): void
    {
        $updates = 0;
        DB::listen(function ($query) use (&$updates) {
            if (str_starts_with($query->sql, 'update "properties"') && ++$updates === 2) {
                throw new \RuntimeException('panne injectée');
            }
        });

        $this->withoutExceptionHandling();
        try {
            $this->send();
            $this->fail('La panne injectée aurait dû remonter.');
        } catch (\RuntimeException $e) {
            $this->assertSame('panne injectée', $e->getMessage());
        }

        $this->assertSame(3, Property::query()->whereIn('id', $this->publicIds)->where('visibility', 'public')->count());
    }
}
