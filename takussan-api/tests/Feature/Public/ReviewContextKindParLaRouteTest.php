<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2522 (seconde contre-vérification du 2026-11-09) — le contexte d'un avis sur la fiche d'AGENT,
 * pour un avis ÉCRIT PAR LE CHEMIN DE PRODUCTION : `POST /api/agents/{user}/reviews`
 * (`ReviewController::storeForAgent`, qui pose `context_type`/`context_id` depuis la preuve), approuvé par
 * `POST /api/reviews/{review}/approve`, puis lu sur `GET /api/public/agents/{slug}`. Aucun avis fabriqué
 * par la factory : `ReviewContextKindTest` prouve ce que la ressource SERT d'une colonne donnée, celui-ci
 * prouve que l'application PRODUIT cette colonne.
 *
 * L'avis d'AGENCE n'y est pas : `storeForAgency` ne pose pas encore le contexte (TCK-2577).
 */
class ReviewContextKindParLaRouteTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $client;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = Agency::factory()->create();
        $this->agent = User::factory()->create(['username' => 'awa-diop', 'status' => 'active']);
        $this->materializeRoleProfile($this->agent, 'agent', $this->agence);
        $this->client = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Sarr']);
    }

    /** Dépose l'avis par la route, l'approuve par la route, et rend l'avis tel que la fiche publique le sert. */
    private function avisPublieParLaRoute(): array
    {
        $this->actingAsApi($this->client);
        $this->postJson("/api/agents/{$this->agent->id}/reviews", [
            'rating' => 5,
            'title' => 'Très bien',
            'content' => 'Suivi sérieux.',
        ])->assertCreated();
        $avis = Review::query()->latest('id')->firstOrFail();

        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agence);
        $this->actingAsApi($admin);
        $this->postJson("/api/reviews/{$avis->id}/approve")->assertOk();

        $this->app['auth']->forgetGuards();
        $public = $this->getJson('/api/public/agents/awa-diop')->assertOk();
        $this->assertSame($avis->id, $public->json('data.reviews.recent.0.id'));
        $this->assertStringNotContainsString('"context_id"', $public->getContent());
        $this->assertStringNotContainsString('"context_type"', $public->getContent());

        return $public->json('data.reviews.recent.0');
    }

    public function test_un_avis_depose_apres_une_visite_s_affiche_avec_son_contexte_visite(): void
    {
        PropertyVisit::factory()->create([
            'property_id' => Property::factory()->published()->create(['agency_id' => $this->agence->id])->id,
            'visitor_id' => $this->client->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now(),
        ]);

        $this->assertSame('visit', $this->avisPublieParLaRoute()['context_kind']);
    }

    public function test_un_avis_depose_sur_un_bail_s_affiche_avec_son_contexte_bail(): void
    {
        $bien = Property::factory()->published()->create(['agency_id' => $this->agence->id, 'user_id' => $this->agent->id]);
        Lease::factory()->create([
            'property_id' => $bien->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->client->id])->id,
            'status' => LeaseStatus::Active,
        ]);

        $this->assertSame('lease', $this->avisPublieParLaRoute()['context_kind']);
    }
}
