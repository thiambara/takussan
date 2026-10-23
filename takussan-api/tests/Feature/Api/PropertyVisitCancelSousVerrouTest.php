<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * P182.06 (TCK-1820) — l'annulation d'une visite juge `visit.cannot_cancel` sur la ligne relue
 * sous verrou, comme `confirmOrFail`. Elle le jugeait sur le modèle lié à la route : deux
 * annulations simultanées passaient toutes deux et prévenaient deux fois, et une annulation
 * concurrente d'un `complete` écrasait `completed`.
 *
 * La course se rejoue sans concurrence : un écouteur `retrieved` change la ligne en base juste
 * après la liaison de route, si bien que le contrôleur tient un modèle resté `scheduled` pendant
 * que la base dit autre chose — ce que voit le second de deux appels simultanés.
 */
class PropertyVisitCancelSousVerrouTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private Property $bien;

    private User $visiteur;

    private PropertyVisit $visite;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->bien = $this->bienDe($this->x);
        $this->visiteur = $this->client();
        $this->visite = PropertyVisit::factory()->create([
            'property_id' => $this->bien->id,
            'visitor_id' => $this->visiteur->id,
            'agent_id' => $this->personnel($this->x)->id,
            'status' => VisitStatus::Scheduled,
        ]);
    }

    /** La première lecture de la visite (la liaison de route) laisse la base passer à `$statut`. */
    private function changerLaBaseApresLaLiaison(VisitStatus $statut): void
    {
        $fait = false;
        PropertyVisit::retrieved(function (PropertyVisit $lue) use (&$fait, $statut): void {
            if ($fait || $lue->id !== $this->visite->id) {
                return;
            }
            $fait = true;
            DB::table('property_visits')->where('id', $lue->id)->update(['status' => $statut->value]);
        });
    }

    public function test_une_visite_deja_annulee_en_base_ne_s_annule_pas_une_seconde_fois(): void
    {
        $this->changerLaBaseApresLaLiaison(VisitStatus::Cancelled);

        Sanctum::actingAs($this->visiteur);
        $this->postJson("/api/property-visits/{$this->visite->id}/cancel", ['reason' => 'Second onglet'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'visit.cannot_cancel');

        Notification::assertNothingSent();
        $this->assertNull($this->visite->fresh()->cancellation_reason);
    }

    public function test_une_visite_terminee_en_base_n_est_pas_ecrasee_par_l_annulation(): void
    {
        $this->changerLaBaseApresLaLiaison(VisitStatus::Completed);

        Sanctum::actingAs($this->visiteur);
        $this->postJson("/api/property-visits/{$this->visite->id}/cancel", ['reason' => 'Trop tard'])
            ->assertStatus(422);

        Notification::assertNothingSent();
        $this->assertSame(VisitStatus::Completed, $this->visite->fresh()->status);
    }

    public function test_une_visite_planifiee_s_annule_toujours_et_previent_l_agence(): void
    {
        Sanctum::actingAs($this->visiteur);
        $this->postJson("/api/property-visits/{$this->visite->id}/cancel", ['reason' => 'Empêché'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertSame(VisitStatus::Cancelled, $this->visite->fresh()->status);
        $this->assertSame('Empêché', $this->visite->fresh()->cancellation_reason);
        Notification::assertCount(1);
    }
}
