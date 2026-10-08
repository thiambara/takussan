<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-591 AC5 — dépublier en lot : bilan par codes, autorisation ligne à ligne, transaction ; et,
 * depuis verif-591 M3, exactement l'écriture et la règle de statut de `PUT …/visibility`.
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
        // Un brouillon déjà privé : l'unitaire le refuse (422 `property_cannot_unpublish`), le lot aussi.
        $this->privateId = Property::factory()->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ])->id;
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
            ['forbidden', 'invalid_status', 'not_found'],
            collect($response->json('failed'))->pluck('reason')->all(),
        );
        $this->assertSame('forbidden', collect($response->json('failed'))->firstWhere('id', $this->foreignId)['reason']);
        $this->assertSame(3, Property::query()->whereIn('id', $this->publicIds)->where('visibility', 'private')->count());
        // verif-591 M3 — ce que l'unitaire écrit : brouillon, date de publication effacée.
        $this->assertSame(3, Property::query()->whereIn('id', $this->publicIds)
            ->where('status', PropertyStatus::Draft->value)->whereNull('published_at')->count());
        $this->assertSame('public', Property::query()->find($this->foreignId)->visibility->value);
    }

    /**
     * verif-591 M3 — le lot et l'unitaire, côte à côte : même état produit, même refus hors
     * `available | published` (un bien en modération reste public, en lot comme à l'unité).
     */
    public function test_bulk_unpublish_is_the_unitary_unpublish(): void
    {
        $agency = Property::query()->find($this->publicIds[0])->agency_id;
        $pair = fn () => Property::factory()->create(['agency_id' => $agency, 'status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);
        [$unit, $bulk] = [$pair(), $pair()];
        $pending = Property::factory()->create(['agency_id' => $agency, 'status' => PropertyStatus::PendingReview, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);

        $this->actingAsApi($this->agent)->apiPut("/api/properties/{$unit->id}/visibility", ['visibility' => 'private'])->assertOk();
        $this->actingAsApi($this->agent)->apiPut("/api/properties/{$pending->id}/visibility", ['visibility' => 'private'])->assertStatus(422);
        $this->actingAsApi($this->agent)->apiPost('/api/properties/bulk-visibility', [
            'property_ids' => [$bulk->id, $pending->id],
            'visibility' => 'private',
        ])->assertOk()
            ->assertJsonPath('updated_ids', [$bulk->id])
            ->assertJsonPath('failed', [['id' => $pending->id, 'reason' => 'invalid_status']]);

        $state = fn (Property $p) => [$p->fresh()->status->value, $p->fresh()->visibility->value, $p->fresh()->published_at];
        $this->assertSame(['draft', 'private', null], $state($unit));
        $this->assertSame($state($unit), $state($bulk));
        $this->assertSame(['pending_review', 'public'], array_slice($state($pending), 0, 2));
    }

    /**
     * TCK-587 — changer la visibilité est un geste `publish` : un bailleur l'est refusé sur son
     * propre bien par `PUT …/visibility`, il l'est donc aussi en lot.
     */
    public function test_a_landlord_cannot_unpublish_his_own_property_in_bulk(): void
    {
        $agency = Property::query()->find($this->publicIds[0])->agency_id;
        $landlord = User::factory()->create();
        $this->materializeRoleProfile($landlord, 'owner', Agency::query()->find($agency));
        $own = Property::factory()->create([
            'agency_id' => $agency,
            'user_id' => $landlord->id,
            'visibility' => PropertyVisibility::Public,
        ]);

        $this->actingAsApi($landlord)->apiPut("/api/properties/{$own->id}/visibility", ['visibility' => 'private'])
            ->assertForbidden();
        $this->actingAsApi($landlord)->apiPost('/api/properties/bulk-visibility', [
            'property_ids' => [$own->id],
            'visibility' => 'private',
        ])->assertOk()->assertJsonPath('updated', 0)->assertJsonPath('failed.0.reason', 'forbidden');

        $this->assertSame('public', $own->fresh()->visibility->value);
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
