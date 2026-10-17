<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-806 (P20.04) — le bien imbriqué d'une liste pro ne relit pas sa photo ligne par ligne.
 *
 * `PropertyResource` rend `main_photo_url` par `getFirstMedia('photos')`, qui interroge `media`
 * pour chaque bien dont la relation n'est pas chargée. Les baux, les réservations et les
 * conversations chargeaient `property` sans `property.media` : une requête `media` par ligne.
 * Le budget se juge en requêtes sur `media`, pour 2 lignes puis 12, chaque bien avec sa photo.
 */
class NestedPropertyPhotoQueryBudgetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function bienAvecPhoto(User $owner): Property
    {
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');

        return $property;
    }

    /** @return array{0: int, 1: mixed} les requêtes sur `media`, et la photo de la première ligne */
    private function mediaQueries(string $url): array
    {
        $count = 0;
        DB::listen(function ($query) use (&$count) {
            if (preg_match('/from "media"/', $query->sql)) {
                $count++;
            }
        });
        $response = $this->getJson($url)->assertOk();
        app('events')->forget('Illuminate\Database\Events\QueryExecuted');

        return [$count, $response->json('data.0.property.main_photo_url')];
    }

    /** @param  callable(): void  $addRow */
    private function assertFlat(string $url, callable $addRow): void
    {
        $addRow();
        $addRow();
        [$two, $photo] = $this->mediaQueries($url);
        $this->assertNotNull($photo, 'la ligne doit rendre la photo de son bien');

        for ($i = 0; $i < 10; $i++) {
            $addRow();
        }
        [$twelve] = $this->mediaQueries($url);

        $this->assertSame($two, $twelve, "{$url} : {$two} requêtes media pour 2 lignes, {$twelve} pour 12");
    }

    public function test_la_liste_des_baux_ne_relit_pas_la_photo_par_ligne(): void
    {
        $landlord = User::factory()->create();
        Sanctum::actingAs($landlord);

        $this->assertFlat('/api/leases?include=property,tenant&per_page=20', function () use ($landlord) {
            Lease::factory()->create([
                'landlord_id' => $landlord->id,
                'property_id' => $this->bienAvecPhoto($landlord)->id,
            ]);
        });
    }

    public function test_la_liste_des_reservations_ne_relit_pas_la_photo_par_ligne(): void
    {
        $me = User::factory()->create();
        $owner = User::factory()->create();
        Sanctum::actingAs($me);

        $this->assertFlat('/api/bookings?include=property,customer&per_page=20', function () use ($me, $owner) {
            Booking::factory()->create([
                'created_by_id' => $me->id,
                'property_id' => $this->bienAvecPhoto($owner)->id,
            ]);
        });
    }

    public function test_la_liste_des_conversations_ne_relit_pas_la_photo_par_ligne(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        Sanctum::actingAs($me);

        $this->assertFlat('/api/conversations?per_page=20', function () use ($me, $other) {
            $conversation = Conversation::create([
                'type' => ConversationType::Direct->value,
                'status' => ConversationStatus::Active->value,
                'subject' => 'Bien',
                'created_by' => $me->id,
                'property_id' => $this->bienAvecPhoto($other)->id,
            ]);
            $conversation->participants()->attach($me->id, ['joined_at' => now()]);
            $conversation->participants()->attach($other->id, ['joined_at' => now()]);
        });
    }
}
