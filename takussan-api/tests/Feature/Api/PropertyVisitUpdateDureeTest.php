<?php

namespace Tests\Feature\Api;

use App\Http\Requests\Api\StorePropertyVisitRequest;
use App\Http\Requests\Api\UpdatePropertyVisitRequest;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1836 (P184.03) — la création plafonne la durée d'une visite à 240 minutes (« une visite de
 * 100 000 minutes, une fois confirmée, bloquait le bien ») ; la modification ne gardait que
 * `min:5`, et rouvrait le défaut par le `PATCH`.
 */
class PropertyVisitUpdateDureeTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_patch_refuse_une_duree_au_dela_du_plafond_et_ne_bloque_pas_le_bien(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $a = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => now()->addDay()->setTime(10, 0),
            'duration_minutes' => 30,
        ]);
        $b = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(20)->setTime(10, 0),
            'duration_minutes' => 30,
        ]);
        Sanctum::actingAs($owner);

        $this->patchJson("/api/property-visits/{$a->id}", ['duration_minutes' => 100000])
            ->assertStatus(422)
            ->assertJsonValidationErrors('duration_minutes');
        $this->assertSame(30, $a->fresh()->duration_minutes);

        $this->postJson("/api/property-visits/{$b->id}/confirm")->assertOk();
    }

    public function test_le_patch_accepte_le_plafond_lui_meme(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDay()->setTime(10, 0),
        ]);
        Sanctum::actingAs($owner);

        $this->patchJson("/api/property-visits/{$visit->id}", ['duration_minutes' => 240])->assertOk();
        $this->assertSame(240, $visit->fresh()->duration_minutes);
    }

    public function test_creation_et_modification_partagent_la_meme_borne_de_duree(): void
    {
        $this->assertSame(240, StorePropertyVisitRequest::MAX_DURATION_MINUTES);

        $regle = (new UpdatePropertyVisitRequest)->rules()['duration_minutes'];
        $this->assertContains('max:'.StorePropertyVisitRequest::MAX_DURATION_MINUTES, $regle);
        $this->assertTrue(Validator::make(['duration_minutes' => 240], ['duration_minutes' => $regle])->passes());
        $this->assertTrue(Validator::make(['duration_minutes' => 241], ['duration_minutes' => $regle])->fails());
    }
}
