<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
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
 *
 * TCK-817 — la route exige `properties.update_own` ou `properties.update_any` à l'agence active :
 * l'acteur est un agent de `$agency`, ses biens y sont rattachés. Un compte sans agence, que ces
 * tests prenaient jusque-là, est refusé en tête (`PropertyBulkRoutesGateTest`).
 */
class PropertyBulkArchiveTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    private function membre(): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', $this->agency);

        return $user;
    }

    public function test_requires_auth(): void
    {
        $this->postJson('/api/properties/bulk-archive', ['property_ids' => [1]])
            ->assertUnauthorized();
    }

    public function test_archives_authorized_properties(): void
    {
        $owner = $this->membre();
        /** @var Collection<int, Property> $props */
        $props = Property::factory()->count(3)->create([
            'user_id' => $owner->id,
            'agency_id' => $this->agency->id,
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

    /**
     * TCK-591 (verif-591 M3) — archiver en lot écrit exactement ce qu'écrit `PUT …/status=archived` :
     * la date de publication était gardée par le lot, effacée par l'unitaire.
     */
    public function test_bulk_archive_writes_what_the_unitary_archive_writes(): void
    {
        $owner = $this->membre();
        [$unit, $bulk] = Property::factory()->count(2)->create([
            'user_id' => $owner->id,
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::Available,
            'published_at' => now(),
        ])->all();

        Sanctum::actingAs($owner);
        $this->putJson("/api/properties/{$unit->id}/status", ['status' => 'archived'])->assertOk();
        $this->postJson('/api/properties/bulk-archive', ['property_ids' => [$bulk->id]])
            ->assertOk()->assertJsonPath('archived', 1);

        $state = fn (Property $p) => [$p->fresh()->status->value, $p->fresh()->visibility->value, $p->fresh()->published_at];
        $this->assertSame(['archived', 'private', null], $state($unit));
        $this->assertSame($state($unit), $state($bulk));
        $this->assertNotNull($bulk->fresh()->archived_at);
    }

    public function test_reports_unauthorized_in_failed_list(): void
    {
        $me = $this->membre();
        $other = User::factory()->create();

        $mine = Property::factory()->count(2)->create(['user_id' => $me->id, 'agency_id' => $this->agency->id]);
        $foreign = Property::factory()->create(['user_id' => $other->id, 'agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($me);

        $ids = [...$mine->pluck('id')->all(), $foreign->id];
        $response = $this->postJson('/api/properties/bulk-archive', [
            'property_ids' => $ids,
        ])->assertOk();

        $response->assertJsonPath('archived', 2);
        $failed = $response->json('failed');
        $this->assertCount(1, $failed);
        $this->assertSame($foreign->id, $failed[0]['id']);
        // TCK-817 — le bien d'une autre agence sort en `not_found` : `forbidden` disait qu'il existe.
        $this->assertSame('not_found', $failed[0]['reason']);

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
        $me = $this->membre();
        $fresh = Property::factory()->create(['user_id' => $me->id, 'agency_id' => $this->agency->id]);
        $old = Property::factory()->create([
            'user_id' => $me->id,
            'agency_id' => $this->agency->id,
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
        $owner = $this->membre();
        $p = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);

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

    public function test_activity_previous_status_reflects_pre_archive_value(): void
    {
        // Regression: Eloquent syncs original attributes on save, so reading
        // `getOriginal('status')` AFTER `save()` would wrongly return
        // 'archived'. The activity log must capture the prior status.
        $owner = $this->membre();
        $p = Property::factory()->create([
            'user_id' => $owner->id,
            'agency_id' => $this->agency->id,
            'status' => PropertyStatus::Available,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson('/api/properties/bulk-archive', [
            'property_ids' => [$p->id],
        ])->assertOk();

        /** @var Activity|null $entry */
        $entry = Activity::query()
            ->where('description', 'property.archived_bulk')
            ->where('subject_id', $p->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($entry);
        $this->assertSame('available', $entry->properties['previous_status'] ?? null);
    }

    public function test_validates_property_ids_required(): void
    {
        $me = $this->membre();
        Sanctum::actingAs($me);

        $this->postJson('/api/properties/bulk-archive', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['property_ids']);
    }
}
