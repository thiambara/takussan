<?php

namespace Tests\Feature\Media;

use App\Models\Customer;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Media\PrivateMediaAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\Support\ImageEnTete;
use Tests\Support\MaintenanceActors;
use Tests\Support\RemoteDiskFake;
use Tests\TestCase;

/**
 * TCK-2088 (P180.02, ADR-0029, amendement du 2026-10-23) — les vignettes privées ne chargent plus
 * l'original.
 *
 * Avant ce ticket, `media.private.show` ne savait servir que l'original : la grille de l'état des
 * lieux et la galerie de maintenance posaient chaque photo entière (jusqu'à 5 et 10 Mo) dans une
 * tuile d'une centaine de pixels. La route sert désormais une conversion nommée dans l'URL signée,
 * prise dans une liste propre à la collection, et seulement une fois produite.
 *
 * Tout se joue sur `r2-private` simulé par {@see RemoteDiskFake} : la présignature y nomme le
 * chemin servi, ce qui dit QUEL fichier sort.
 */
class PrivateMediaConversionTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');
    }

    // ─── La route signée ─────────────────────────────────────────

    public function test_the_signed_route_serves_the_named_conversion_not_the_original(): void
    {
        $media = $this->roomPhoto();
        $this->assertTrue($media->hasGeneratedConversion('preview'));

        $location = (string) $this->get(app(PrivateMediaAccess::class)->signedUrl($media, conversion: 'preview'))
            ->assertRedirect()
            ->headers->get('Location');

        $this->assertStringStartsWith(
            RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$media->getPathRelativeToRoot('preview').'?',
            $location,
        );
        $this->assertNotSame($media->getPathRelativeToRoot(), $media->getPathRelativeToRoot('preview'));
        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);
        $this->assertSame('image/jpeg', $query['ResponseContentType']);
    }

    public function test_without_a_conversion_the_route_still_serves_the_original(): void
    {
        $media = $this->roomPhoto();

        $location = (string) $this->get(app(PrivateMediaAccess::class)->signedUrl($media))
            ->assertRedirect()
            ->headers->get('Location');

        $this->assertStringStartsWith(
            RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$media->getPathRelativeToRoot().'?',
            $location,
        );
    }

    public function test_a_conversion_outside_the_collection_list_is_not_served(): void
    {
        // `thumbnail` n'est pas une conversion servie de `room_photos` : même marquée produite, la
        // liste la refuse, avant tout accès au disque.
        $media = $this->roomPhoto();
        $media->markAsConversionGenerated('thumbnail');
        $media->save();

        $this->get(app(PrivateMediaAccess::class)->signedUrl($media, conversion: 'thumbnail'))
            ->assertNotFound();
    }

    public function test_a_conversion_not_yet_produced_is_not_served(): void
    {
        $media = $this->roomPhoto();
        $media->markAsConversionNotGenerated('preview');
        $media->save();

        $this->get(app(PrivateMediaAccess::class)->signedUrl($media, conversion: 'preview'))
            ->assertNotFound();
    }

    public function test_the_conversion_name_is_covered_by_the_signature(): void
    {
        $media = $this->roomPhoto();
        $access = app(PrivateMediaAccess::class);

        // Ni ajoutée à l'URL de l'original, ni changée dans celle d'une conversion.
        $this->get($access->signedUrl($media).'&conversion=preview')->assertForbidden();
        $this->get(str_replace('conversion=preview', 'conversion=full', $access->signedUrl($media, conversion: 'preview')))
            ->assertForbidden();
    }

    // ─── État des lieux ──────────────────────────────────────────

    public function test_the_inventory_resource_serves_the_preview_and_keeps_the_original(): void
    {
        $media = $this->roomPhoto($inventory, $owner);

        Sanctum::actingAs($owner);
        $photo = $this->getJson("/api/inventories/{$inventory->id}")->assertOk()->json('data.room_photos.0.photos.0');

        $this->assertSame($media->id, $photo['id']);
        $this->assertNotSame($photo['url'], $photo['preview_url']);
        $this->assertStringNotContainsString('conversion=', $photo['url']);
        $this->assertStringContainsString('conversion=preview', $photo['preview_url']);
        $this->assertStringStartsWith(
            RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$media->getPathRelativeToRoot('preview').'?',
            (string) $this->get($photo['preview_url'])->headers->get('Location'),
        );
    }

    public function test_the_inventory_resource_falls_back_to_the_original_while_the_preview_is_queued(): void
    {
        $media = $this->roomPhoto($inventory, $owner);
        $media->markAsConversionNotGenerated('preview');
        $media->save();

        Sanctum::actingAs($owner);
        $photo = $this->getJson("/api/inventories/{$inventory->id}")->assertOk()->json('data.room_photos.0.photos.0');

        $this->assertSame($photo['url'], $photo['preview_url']);
    }

    // ─── Maintenance ─────────────────────────────────────────────

    public function test_maintenance_photos_get_a_thumbnail_served_beside_the_original(): void
    {
        ['mr' => $mr, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Open);

        Sanctum::actingAs($tenant);
        $this->post("/api/maintenance-requests/{$mr->id}/photos", [
            'photos' => [UploadedFile::fake()->image('fuite.jpg', 2000, 1500)],
        ], ['Accept' => 'application/json'])->assertSuccessful();

        $media = $mr->refresh()->getFirstMedia('photos');
        $this->assertTrue($media->hasGeneratedConversion('thumbnail'));

        $photo = $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->json('data.media.photos.0');

        $this->assertStringNotContainsString('conversion=', $photo['url']);
        $this->assertStringContainsString('conversion=thumbnail', $photo['thumbnail_url']);
        $this->assertStringStartsWith(
            RemoteDiskFake::PRESIGNED_HOST.'/r2-private/'.$media->getPathRelativeToRoot('thumbnail').'?',
            (string) $this->get($photo['thumbnail_url'])->headers->get('Location'),
        );
    }

    public function test_a_maintenance_photo_beyond_twenty_megapixels_is_refused_on_the_three_routes(): void
    {
        $bombe = fn () => [UploadedFile::fake()->image('ok.jpg', 10, 10), ImageEnTete::jpeg(10_000, 10_000, 'bombe.jpg')];

        ['mr' => $open, 'tenant' => $tenant] = $this->maintenanceScenario(MaintenanceStatus::Open);
        Sanctum::actingAs($tenant);
        $this->post("/api/maintenance-requests/{$open->id}/photos", ['photos' => $bombe()], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos.1'])
            ->assertJsonMissingValidationErrors(['photos.0']);

        ['mr' => $inProgress, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);
        Sanctum::actingAs($landlord);
        $this->post("/api/maintenance-requests/{$inProgress->id}/complete", [
            '_method' => 'PUT',
            'resolution_notes' => 'Joint changé.',
            'photos' => $bombe(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos.1'])
            ->assertJsonMissingValidationErrors(['photos.0']);

        ['mr' => $completed, 'tenant' => $requester] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()]);
        Sanctum::actingAs($requester);
        $this->post("/api/maintenance-requests/{$completed->id}/contest-resolution", [
            'comment' => 'La fuite a repris.',
            'photos' => $bombe(),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos.1'])
            ->assertJsonMissingValidationErrors(['photos.0']);

        foreach ([$open, $inProgress, $completed] as $mr) {
            $this->assertCount(0, $mr->refresh()->media);
        }
    }

    private function roomPhoto(?Inventory &$inventory = null, ?User &$owner = null): Media
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);
        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'rooms' => [['name' => 'Salon', 'condition' => 'good', 'elements' => []]],
        ]);

        return $inventory->addMedia(UploadedFile::fake()->image('salon.jpg', 1600, 1200))
            ->withCustomProperties(['room_name' => 'Salon'])
            ->toMediaCollection('room_photos')
            ->refresh();
    }
}
