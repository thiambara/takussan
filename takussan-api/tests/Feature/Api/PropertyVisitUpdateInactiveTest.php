<?php

namespace Tests\Feature\Api;

use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1838 (P184.04) — le `PATCH` ne refusait que `completed` et `cancelled` : une visite
 * marquée « absent » se déplaçait, le visiteur recevait l'annonce d'un rendez-vous que rien ne
 * pouvait plus confirmer ni reporter. Le déplacement suit désormais la règle du report
 * (`visit.reschedule_inactive` hors `ACTIVE_STATUSES`) ; le reste de la visite reste modifiable.
 */
class PropertyVisitUpdateInactiveTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private PropertyVisit $visit;

    protected function setUp(): void
    {
        parent::setUp();
        $this->owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id]);
        $this->visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::NoShow,
            'scheduled_at' => now()->subHour(),
            'notes' => 'avant',
        ]);
        Notification::fake();
        Sanctum::actingAs($this->owner);
    }

    public function test_une_visite_absente_ne_se_deplace_pas_et_le_visiteur_n_est_pas_averti(): void
    {
        $avant = $this->visit->scheduled_at;

        $this->patchJson("/api/property-visits/{$this->visit->id}", [
            'scheduled_at' => now()->addDays(2)->setTime(10, 0)->toIso8601String(),
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'visit.reschedule_inactive');

        $fresh = $this->visit->fresh();
        $this->assertSame(VisitStatus::NoShow, $fresh->status);
        $this->assertTrue($fresh->scheduled_at->equalTo($avant));
        Notification::assertNothingSent();
    }

    public function test_les_notes_et_le_type_d_une_visite_absente_restent_modifiables(): void
    {
        $this->patchJson("/api/property-visits/{$this->visit->id}", [
            'notes' => 'le visiteur a prévenu trop tard',
            'type' => 'virtual',
        ])->assertOk();

        $fresh = $this->visit->fresh();
        $this->assertSame('le visiteur a prévenu trop tard', $fresh->notes);
        $this->assertSame(VisitStatus::NoShow, $fresh->status);
        Notification::assertNothingSent();
    }
}
