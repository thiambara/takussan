<?php

namespace Tests\Feature\Onboarding;

use App\Events\Onboarding\SpaceCreated;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** TCK-633 (lot C, interface C → F) — l'assistant hôte annonce l'espace qu'il crée. */
class SpaceCreatedEventTest extends TestCase
{
    use RefreshDatabase;

    public function test_l_assistant_annonce_l_espace_cree(): void
    {
        Event::fake([SpaceCreated::class]);
        $user = User::factory()->create(['phone' => '+221770000123', 'phone_verified_at' => now()]);
        Sanctum::actingAs($user);

        $id = $this->postJson('/api/host/individual/onboard', [
            'agency' => ['name' => 'Espace de Fatou', 'primary_city' => 'Dakar', 'currency' => 'XOF'],
            'phone_otp' => ['phone' => '+221770000123'],
            'preferences' => ['primary_property_type' => 'apartment'],
            'cgu_accepted' => true,
        ])->assertCreated()->json('data.agency.id');

        Event::assertDispatchedTimes(SpaceCreated::class, 1);
        Event::assertDispatched(SpaceCreated::class, fn (SpaceCreated $e) => $e->agency->is(Agency::query()->findOrFail($id)));
    }
}
