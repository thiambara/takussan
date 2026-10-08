<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC15 : la liste des biens fait le même nombre de requêtes pour 2 biens et pour 20.
 *
 * Chaque bien a sa photo, un propriétaire distinct, agent de l'agence et pourvu d'un avatar : ce sont
 * les trois lectures par ligne de `PropertyResource` (photo principale, avatar, `is_agent`).
 */
class PropertyIndexQueryBudgetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function listedProperty(Agency $agency): Property
    {
        $owner = User::factory()->withAgentProfile($agency)->create();
        $owner->addMedia(UploadedFile::fake()->image('avatar.jpg'))->toMediaCollection('avatar');
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');

        return $property;
    }

    private function queries(): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $response = $this->getJson('/api/properties?per_page=20')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        $first = $response->json('data.0');
        $this->assertNotNull($first['main_photo_url']);
        $this->assertNotNull($first['owner']['avatar_url']);
        $this->assertTrue($first['owner']['is_agent']);

        return $count;
    }

    public function test_ac15_the_list_costs_the_same_for_two_and_twenty_properties(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        foreach (range(1, 2) as $_) {
            $this->listedProperty($agency);
        }
        $this->actingAsApi($admin);
        $this->getJson('/api/properties?per_page=20')->assertOk();

        $two = $this->queries();
        foreach (range(1, 18) as $_) {
            $this->listedProperty($agency);
        }
        $twenty = $this->queries();

        $this->assertSame(20, count($this->getJson('/api/properties?per_page=20')->json('data')));
        $this->assertSame($two, $twenty, "2 biens : {$two} requêtes, 20 biens : {$twenty}");
    }

    public function test_is_agent_still_ignores_a_suspended_profile(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        $property = $this->listedProperty($agency);
        $property->owner->agentProfiles()->update(['status' => 'suspended']);

        $this->actingAsApi($admin);

        $this->assertFalse($this->getJson('/api/properties?per_page=20')->assertOk()->json('data.0.owner.is_agent'));
    }
}
