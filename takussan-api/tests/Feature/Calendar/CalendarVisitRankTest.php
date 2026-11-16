<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2886 — un événement `visit` dit son rang (`visit_rank`) : sa place parmi les visites non
 * annulées du même client sur le même bien, par date. Nul sans client.
 */
class CalendarVisitRankTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    private User $agent;

    private Property $bien;

    private Customer $fiche;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
        $this->agent = $this->personnel($this->x);
        $this->bien = $this->bienDe($this->x);
        $this->fiche = $this->ficheClient($this->x);
    }

    private function visite(int $jours, VisitStatus $status = VisitStatus::Confirmed, ?Customer $fiche = null, ?Property $bien = null, bool $sansClient = false): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => ($bien ?? $this->bien)->id,
            'customer_id' => $sansClient ? null : ($fiche ?? $this->fiche)->id,
            'visitor_id' => null,
            'agent_id' => $this->agent->id,
            'status' => $status,
            'scheduled_at' => now()->addDays($jours)->setTime(10, 0),
            'duration_minutes' => 30,
        ]);
    }

    /** @return array<int, array<string, mixed>> les événements `visit`, par id */
    private function evenements(): array
    {
        $response = $this->actingAsApi($this->agent)
            ->getJson('/api/calendar?types[]=visit&start_date='.now()->subDays(10)->toDateString().'&end_date='.now()->addDays(10)->toDateString())
            ->assertOk();
        $this->app['auth']->forgetGuards();

        return collect($response->json('data'))->where('type', 'visit')->keyBy('id')->all();
    }

    /** AC2 — la première visite rend 1, la deuxième 2. */
    public function test_ac2_la_deuxieme_visite_rend_2(): void
    {
        $premiere = $this->visite(1);
        $deuxieme = $this->visite(3);

        $events = $this->evenements();

        $this->assertSame(1, $events[$premiere->id]['visit_rank']);
        $this->assertSame(2, $events[$deuxieme->id]['visit_rank']);
    }

    /** AC2 — une visite annulée ne compte pas, même passée et hors de la fenêtre servie. */
    public function test_ac2_une_visite_annulee_ne_compte_pas(): void
    {
        $this->visite(-30, VisitStatus::Cancelled);
        $this->visite(1, VisitStatus::Cancelled);
        $visite = $this->visite(3);

        $this->assertSame(1, $this->evenements()[$visite->id]['visit_rank']);
    }

    /** Une visite faite hors de la fenêtre compte : le rang se juge sur tout l'historique. */
    public function test_une_visite_faite_avant_la_fenetre_compte(): void
    {
        $this->visite(-30, VisitStatus::Completed);
        $visite = $this->visite(2);

        $this->assertSame(2, $this->evenements()[$visite->id]['visit_rank']);
    }

    /** Le rang se juge par client ET par bien. */
    public function test_le_rang_est_propre_au_client_et_au_bien(): void
    {
        $this->visite(1);
        $autreClient = $this->visite(2, fiche: $this->ficheClient($this->x));
        $autreBien = $this->visite(3, bien: $this->bienDe($this->x));

        $events = $this->evenements();

        $this->assertSame(1, $events[$autreClient->id]['visit_rank']);
        $this->assertSame(1, $events[$autreBien->id]['visit_rank']);
    }

    /** Sans client, pas de rang. */
    public function test_sans_client_le_rang_est_nul(): void
    {
        $visite = $this->visite(2, sansClient: true);

        $events = $this->evenements();

        $this->assertArrayHasKey('visit_rank', $events[$visite->id]);
        $this->assertNull($events[$visite->id]['visit_rank']);
    }

    /** AC3 — le nombre de requêtes ne dépend pas du nombre de visites. */
    public function test_ac3_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_visites(): void
    {
        $this->visite(1);
        $compte = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->evenements();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };

        $un = $compte();
        $this->visite(2);
        $this->visite(3, fiche: $this->ficheClient($this->x));
        $this->visite(4, bien: $this->bienDe($this->x));

        $this->assertSame($un, $compte());
    }
}
