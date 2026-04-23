<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use App\Observers\PropertyObserver;
use App\Services\Property\PropertyBulkArchiveService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-074 — `POST /api/properties/bulk-archive`.
 */
class PropertyBulkArchiveTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_auth(): void
    {
        $this->postJson('/api/properties/bulk-archive', ['property_ids' => [1]])
            ->assertUnauthorized();
    }

    public function test_archives_authorized_properties(): void
    {
        $owner = User::factory()->create();
        /** @var Collection<int, Property> $props */
        $props = Property::factory()->count(3)->create([
            'user_id' => $owner->id,
            'status' => PropertyStatus::Available,
        ]);

        Sanctum::actingAs($owner);

        $response = $this->postJson('/api/properties/bulk-archive', [
            'property_ids' => $props->pluck('id')->all(),
        ])->assertOk();

        $response->assertJsonPath('archived', 3);
        $this->assertSame([], $response->json('failed'));

        foreach ($props as $p) {
            $this->assertDatabaseHas('properties', [
                'id' => $p->id,
                'status' => 'archived',
            ]);
            $p->refresh();
            $this->assertNotNull($p->archived_at);
        }
    }

    public function test_reports_unauthorized_in_failed_list(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        $mine = Property::factory()->count(2)->create(['user_id' => $me->id]);
        $foreign = Property::factory()->create(['user_id' => $other->id]);

        Sanctum::actingAs($me);

        $ids = [...$mine->pluck('id')->all(), $foreign->id];
        $response = $this->postJson('/api/properties/bulk-archive', [
            'property_ids' => $ids,
        ])->assertOk();

        $response->assertJsonPath('archived', 2);
        $failed = $response->json('failed');
        $this->assertCount(1, $failed);
        $this->assertSame($foreign->id, $failed[0]['id']);
        $this->assertSame('forbidden', $failed[0]['reason']);

        // Foreign property was not mutated.
        $this->assertDatabaseMissing('properties', [
            'id' => $foreign->id,
            'status' => 'archived',
        ]);
    }

    public function test_transactional_on_failure(): void
    {
        $me = User::factory()->create();
        $props = Property::factory()->count(3)->create([
            'user_id' => $me->id,
            'status' => PropertyStatus::Available,
        ]);

        $service = new PropertyBulkArchiveService;

        // Inject a saving closure on the second property that throws —
        // we expect the DB::transaction to rollback every prior change.
        $brokenId = $props[1]->id;
        $listener = function (Property $p) use ($brokenId): void {
            if ($p->id === $brokenId && $p->status === PropertyStatus::Archived) {
                throw new \RuntimeException('boom');
            }
        };
        Property::saving($listener);

        try {
            $service->archive(
                $props->pluck('id')->all(),
                $me,
                'crash test'
            );
            $this->fail('RuntimeException should have bubbled up.');
        } catch (\RuntimeException $e) {
            $this->assertSame('boom', $e->getMessage());
        } finally {
            // Drop just the `saving` listeners we added, not every event
            // on the model (Property has observers registered globally).
            Property::flushEventListeners();
            Property::observe(PropertyObserver::class);
        }

        // No row should be archived.
        $archivedCount = Property::query()
            ->whereIn('id', $props->pluck('id')->all())
            ->where('status', 'archived')
            ->count();
        $this->assertSame(0, $archivedCount);
    }

    public function test_skips_already_archived_properties(): void
    {
        $me = User::factory()->create();
        $fresh = Property::factory()->create(['user_id' => $me->id]);
        $old = Property::factory()->create([
            'user_id' => $me->id,
            'status' => PropertyStatus::Archived,
        ]);

        Sanctum::actingAs($me);

        $response = $this->postJson('/api/properties/bulk-archive', [
            'property_ids' => [$fresh->id, $old->id],
        ])->assertOk();

        $this->assertSame(1, $response->json('archived'));
        $failed = collect($response->json('failed'));
        $this->assertTrue($failed->contains(fn ($f) => $f['id'] === $old->id && $f['reason'] === 'already_archived'));
    }

    public function test_bulk_archive_logs_activity(): void
    {
        $owner = User::factory()->create();
        $p = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/properties/bulk-archive', [
            'property_ids' => [$p->id],
            'reason' => 'fin de saison',
        ])->assertOk();

        $this->assertTrue(
            Activity::query()
                ->where('description', 'property.archived_bulk')
                ->where('subject_id', $p->id)
                ->where('causer_id', $owner->id)
                ->exists()
        );
    }

    public function test_validates_property_ids_required(): void
    {
        $me = User::factory()->create();
        Sanctum::actingAs($me);

        $this->postJson('/api/properties/bulk-archive', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['property_ids']);
    }
}
