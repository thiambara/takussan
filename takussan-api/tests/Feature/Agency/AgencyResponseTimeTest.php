<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2871 (AC6) — `GET /api/agencies/{agency}/response-time` : « L'agence vous répond d'ordinaire en
 * 2 h ». La médiane de la première réponse de l'AGENCE sur 90 jours, arrondie à l'heure, `204` sous
 * 10 réponses mesurées ; jamais une donnée par agent ; lisible par un client connecté sans profil.
 */
class AgencyResponseTimeTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00'));
        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    /** Une demande du formulaire déposée il y a `$ilYaJours` jours, répondue `$apresMinutes` plus tard. */
    private function reponse(int $apresMinutes, int $ilYaJours = 5, ?Agency $agence = null): void
    {
        $agence ??= $this->agence;
        $recue = now()->subDays($ilYaJours);
        $lead = PropertyContactLead::factory()->create([
            'property_id' => $this->bienDe($agence)->id,
            'agency_id' => $agence->id,
            'recipient_user_id' => $this->agent->id,
        ]);
        PropertyContactLead::query()->whereKey($lead->id)->toBase()->update([
            'created_at' => $recue,
            'first_responded_at' => $recue->copy()->addMinutes($apresMinutes),
            'first_responded_by_id' => $this->agent->id,
            'first_response_channel' => 'whatsapp',
        ]);
    }

    /** 12 réponses de médiane 1 h 40 (moyenne ≈ 4 h 40 : c'est bien la médiane qui est servie). */
    private function douzeReponses(): void
    {
        foreach ([30, 30, 30, 30, 30, 100, 100, 600, 600, 600, 600, 600] as $minutes) {
            $this->reponse($minutes);
        }
    }

    public function test_ac6_douze_reponses_de_mediane_1_h_40_rendent_2_h(): void
    {
        $this->douzeReponses();
        // Hors des 90 jours, et d'une autre agence : rien ne compte.
        $this->reponse(5000, 120);
        $this->reponse(5000, 5, $this->agence());

        Sanctum::actingAs($this->client());
        $reponse = $this->getJson("/api/agencies/{$this->agence->id}/response-time")->assertOk();

        $this->assertSame(['median_hours' => 2, 'sample' => 12], $reponse->json('data'));
        $this->assertSame(['data'], array_keys($reponse->json()));
    }

    public function test_ac6_neuf_reponses_rendent_204(): void
    {
        foreach (range(1, 9) as $i) {
            $this->reponse(100);
        }

        Sanctum::actingAs($this->client());
        $this->getJson("/api/agencies/{$this->agence->id}/response-time")->assertNoContent();
    }

    public function test_dix_reponses_suffisent_et_une_mediane_sous_la_demi_heure_vaut_une_heure(): void
    {
        foreach (range(1, 10) as $i) {
            $this->reponse(20);
        }

        Sanctum::actingAs($this->client());
        $this->getJson("/api/agencies/{$this->agence->id}/response-time")->assertOk()
            ->assertExactJson(['data' => ['median_hours' => 1, 'sample' => 10]]);
    }
}
