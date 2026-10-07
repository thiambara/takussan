<?php

namespace Tests\Feature\Api;

use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Notifications\VisitRescheduledNotification;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 AC12 — le client propose un autre créneau : la visite repasse en attente de
 * confirmation à la nouvelle heure, et l'agence est prévenue. Personne d'autre ne le peut.
 */
class PropertyVisitRescheduleTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    public function test_le_client_replanifie_sa_visite_confirmee(): void
    {
        Notification::fake();
        $x = $this->agence();
        $agent = $this->personnel($x);
        $visiteur = $this->client();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($x)->id,
            'visitor_id' => $visiteur->id,
            'agent_id' => $agent->id,
            'status' => VisitStatus::Confirmed,
        ]);
        $nouveau = $this->creneau(jours: 4, heure: 15, minute: 30);

        Sanctum::actingAs($this->client());
        $this->postJson("/api/property-visits/{$visite->id}/reschedule", ['scheduled_at' => $nouveau])->assertForbidden();
        Sanctum::actingAs($this->personnel($this->agence()));
        $this->postJson("/api/property-visits/{$visite->id}/reschedule", ['scheduled_at' => $nouveau])->assertForbidden();

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$visite->id}/reschedule", ['scheduled_at' => $this->creneau(heure: 7)])
            ->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);

        $this->postJson("/api/property-visits/{$visite->id}/reschedule", ['scheduled_at' => $nouveau])
            ->assertOk()
            ->assertJsonPath('data.status', VisitStatus::Scheduled->value);

        $visite->refresh();
        $this->assertSame(VisitStatus::Scheduled, $visite->status);
        $this->assertTrue($visite->scheduled_at->equalTo(Carbon::parse($nouveau)));
        Notification::assertSentToTimes($agent, VisitRescheduledNotification::class, 1);
        Notification::assertNotSentTo($visiteur, VisitRescheduledNotification::class);
    }

    public function test_une_visite_annulee_ne_se_replanifie_pas(): void
    {
        $visiteur = $this->client();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence())->id,
            'visitor_id' => $visiteur->id,
            'status' => VisitStatus::Cancelled,
        ]);

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$visite->id}/reschedule", ['scheduled_at' => $this->creneau()])
            ->assertUnprocessable();
    }
}
