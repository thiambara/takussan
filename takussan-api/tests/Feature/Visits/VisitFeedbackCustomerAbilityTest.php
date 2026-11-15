<?php

namespace Tests\Feature\Visits;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * Vérification de TCK-2581 — `abilities.feedback_customer` dit au lecteur s'il peut déposer l'avis du
 * VISITEUR : le `$isCustomer` de `PropertyVisitController::feedback`, le visiteur (`visitor_id`) ou le
 * client rattaché par la fiche (`customer.user_id`). Le front le déduisait de `visit.customer`, que
 * l'API masque au client rattaché par la seule fiche (les visites 303, 350 et 90 de la base de démo) :
 * il ne pouvait pas noter sa visite, que l'API lui accepte. Le drapeau ne doit jamais diverger de ce
 * que l'API accepte : la parité est éprouvée persona par persona contre `POST …/feedback` (et contre
 * `reschedule`, qui reconnaît le demandeur par les mêmes deux branches).
 */
class VisitFeedbackCustomerAbilityTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    private User $bailleur;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->bailleur = $this->bailleur($this->agence);
        $this->bien = $this->bienDe($this->agence, $this->bailleur);
    }

    /** @param  array<string, mixed>  $attributes */
    private function visiteTerminee(array $attributes = [], ?Property $bien = null): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => ($bien ?? $this->bien)->id,
            'visitor_id' => null,
            'customer_id' => null,
            'agent_id' => null,
            'status' => VisitStatus::Completed,
            'scheduled_at' => now()->subHours(3),
            'completed_at' => now()->subHours(2),
        ]);
    }

    /** @return array<string, array{0: User, 1: PropertyVisit, 2: bool, 3: array<string, string>}> */
    private function personas(): array
    {
        $visiteur = $this->client();
        $clientDeLaFiche = $this->client();
        $double = $this->personnel($this->agence());
        OwnerProfile::factory()->create(['user_id' => $double->id, 'agency_id' => $this->agence->id]);
        $double = $double->fresh();

        // Le visiteur par son seul compte : la fiche de la visite n'est pas liée à lui (une branche
        // à la fois, sinon l'ablation de l'une resterait verte).
        $parLeVisiteur = $this->visiteTerminee(['visitor_id' => $visiteur->id, 'customer_id' => $this->ficheClient($this->agence)->id]);
        // Le cas de la base de démo : `visitor_id` nul, la fiche liée au compte.
        $parLaFiche = $this->visiteTerminee(['customer_id' => $this->ficheClient($this->agence, $clientDeLaFiche)->id]);
        $chezLeDouble = $this->visiteTerminee(['customer_id' => $this->ficheClient($this->agence, $this->client())->id], $this->bienDe($this->agence, $double));

        return [
            'le visiteur' => [$visiteur, $parLeVisiteur, true, []],
            'le client de la fiche sans visitor_id' => [$clientDeLaFiche, $parLaFiche, true, []],
            'le personnel de l’agence' => [$this->personnel($this->agence), $parLaFiche, false, []],
            'le bailleur du bien' => [$this->bailleur, $parLaFiche, false, []],
            'le personnel d’ailleurs, bailleur ici' => [
                $double, $chezLeDouble, false,
                ['X-Profile-Id' => 'agent:'.AgentProfile::query()->where('user_id', $double->id)->value('id')],
            ],
        ];
    }

    public function test_le_drapeau_dit_qui_peut_donner_l_avis_du_visiteur(): void
    {
        foreach ($this->personas() as $qui => [$lecteur, $visite, $attendu, $entetes]) {
            Sanctum::actingAs($lecteur);
            $this->flushHeaders()->withHeaders($entetes);

            $this->assertSame($attendu, $this->getJson("/api/property-visits/{$visite->id}")->assertOk()->json('data.abilities.feedback_customer'), $qui);
            // `abilities` n'est émis que sur LA visite de la route (P152.04) : jamais en liste.
            $ligne = collect($this->getJson('/api/property-visits?per_page=100')->assertOk()->json('data'))->firstWhere('id', $visite->id);
            $this->assertNotNull($ligne, $qui.' lit pourtant la visite en liste');
            $this->assertArrayNotHasKey('abilities', $ligne, $qui.' (liste)');
        }
    }

    public function test_le_drapeau_ne_diverge_jamais_de_ce_que_l_api_accepte(): void
    {
        foreach ($this->personas() as $qui => [$lecteur, $visite, , $entetes]) {
            Sanctum::actingAs($lecteur);
            $this->flushHeaders()->withHeaders($entetes);

            $drapeau = $this->getJson("/api/property-visits/{$visite->id}")->assertOk()->json('data.abilities.feedback_customer');
            $this->assertIsBool($drapeau, $qui);

            $avis = $this->postJson("/api/property-visits/{$visite->id}/feedback", ['role' => 'customer', 'rating' => 4]);
            $this->assertSame($drapeau, $avis->isSuccessful(), $qui.' : POST feedback (rôle customer) → '.$avis->status());
            $this->assertSame($drapeau, $lecteur->can('reschedule', $visite->fresh()), $qui.' : reschedule');
        }
    }
}
