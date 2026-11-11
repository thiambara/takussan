<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2585 — `GET /api/property-visits/counts` : les comptes des sept onglets, égaux aux totaux de
 * l'index filtré de chacun, sous la même portée (agence isolée, `mine`).
 */
class PropertyVisitCountsTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const ONGLETS = ['unassigned', 'requested', 'confirmed', 'past', 'cancelled', 'today', 'to_close'];

    private Agency $x;

    private User $moi;

    private CarbonImmutable $maintenant;

    protected function setUp(): void
    {
        parent::setUp();

        // Un instant fixe, à la seconde, en milieu de journée à Dakar : « aujourd'hui » a un avant et un après.
        $this->maintenant = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->setTime(12, 0)->utc();
        Carbon::setTestNow($this->maintenant);
        CarbonImmutable::setTestNow($this->maintenant);

        $this->x = $this->agence();
        $this->moi = $this->personnel($this->x);
        $collegue = $this->personnel($this->x);
        $bien = $this->bienDe($this->x);

        $v = fn (array $a) => PropertyVisit::factory()->create($a + ['property_id' => $bien->id, 'visitor_id' => $this->client()->id]);
        $h = fn (int $minutes) => $this->maintenant->addMinutes($minutes);

        $v(['status' => VisitStatus::Scheduled, 'agent_id' => null, 'scheduled_at' => $h(60 * 26)]);
        $v(['status' => VisitStatus::Scheduled, 'agent_id' => null, 'scheduled_at' => $h(90)]);
        $v(['status' => VisitStatus::Scheduled, 'agent_id' => $this->moi->id, 'scheduled_at' => $h(60 * 50)]);
        // À l'instant pivot : « à venir » (borne basse incluse) ET « passée » (borne haute incluse), comme l'index.
        $v(['status' => VisitStatus::Scheduled, 'agent_id' => $this->moi->id, 'scheduled_at' => $this->maintenant]);
        $v(['status' => VisitStatus::Confirmed, 'agent_id' => $this->moi->id, 'scheduled_at' => $h(120)]);
        $v(['status' => VisitStatus::Confirmed, 'agent_id' => $collegue->id, 'scheduled_at' => $h(60 * 30)]);
        $v(['status' => VisitStatus::Confirmed, 'agent_id' => $this->moi->id, 'scheduled_at' => $h(-120)]);
        $v(['status' => VisitStatus::Completed, 'agent_id' => $this->moi->id, 'scheduled_at' => $h(-60 * 30), 'completed_at' => $h(-60 * 29)]);
        $v(['status' => VisitStatus::Completed, 'agent_id' => $collegue->id, 'scheduled_at' => $h(-60 * 30), 'completed_at' => $h(-60 * 29), 'reported_at' => $h(-60 * 28)]);
        $v(['status' => VisitStatus::Cancelled, 'agent_id' => $this->moi->id, 'scheduled_at' => $h(60 * 5)]);
        $v(['status' => VisitStatus::Cancelled, 'agent_id' => null, 'scheduled_at' => $h(-60 * 5)]);
        $v(['status' => VisitStatus::NoShow, 'agent_id' => $this->moi->id, 'scheduled_at' => $h(-60 * 3)]);
        $v(['status' => VisitStatus::Scheduled, 'agent_id' => null, 'scheduled_at' => VisitWindow::Afternoon->startOn($this->maintenant->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d'))->utc(), 'preferred_window' => VisitWindow::Afternoon]);

        // Une autre agence : rien de ses visites n'entre dans les comptes de X.
        $y = $this->agence();
        $bienY = $this->bienDe($y);
        foreach ([VisitStatus::Scheduled, VisitStatus::Confirmed, VisitStatus::Cancelled] as $status) {
            PropertyVisit::factory()->create(['property_id' => $bienY->id, 'status' => $status, 'agent_id' => null, 'scheduled_at' => $h(60)]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** Les bornes que le front pose sur la liste pour chaque onglet (`bornesDeLOnglet`). */
    private function filtresDe(string $onglet): array
    {
        $now = $this->maintenant->format('Y-m-d H:i:s');

        return match ($onglet) {
            'unassigned' => ['status' => 'scheduled', 'unassigned' => '1', 'scheduled_at_min' => $now],
            'requested' => ['status' => 'scheduled', 'scheduled_at_min' => $now],
            'confirmed' => ['status' => 'confirmed', 'scheduled_at_min' => $now],
            'past' => ['scheduled_at_max' => $now],
            'cancelled' => ['status' => 'cancelled'],
            'today' => ['day' => $this->maintenant->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d')],
            'to_close' => ['to_close' => '1'],
        };
    }

    /** @return array<string, int> */
    private function totauxDeLIndex(array $portee): array
    {
        $totaux = [];
        foreach (self::ONGLETS as $onglet) {
            $totaux[$onglet] = $this->getJson('/api/property-visits?'.http_build_query(['filter' => $portee + $this->filtresDe($onglet)]))
                ->assertOk()->json('meta.total');
        }

        return $totaux;
    }

    /** AC2 — `counts?mine=1` rend, onglet par onglet, le `meta.total` de l'index filtré. */
    public function test_ac2_mine_egale_les_totaux_des_sept_index_filtres(): void
    {
        Sanctum::actingAs($this->moi);
        $counts = $this->getJson('/api/property-visits/counts?mine=1')->assertOk()->json('data');

        $this->assertSame($this->totauxDeLIndex(['mine' => '1']), $counts);
        // Le test n'est pas vide : chaque onglet compte quelque chose de connu.
        $this->assertSame(['unassigned' => 0, 'requested' => 2, 'confirmed' => 1, 'past' => 4, 'cancelled' => 1, 'today' => 5, 'to_close' => 2], $counts);
    }

    public function test_sans_mine_l_agence_entiere_et_rien_d_une_autre(): void
    {
        Sanctum::actingAs($this->moi);
        $counts = $this->getJson('/api/property-visits/counts')->assertOk()->json('data');

        $this->assertSame($this->totauxDeLIndex([]), $counts);
        $this->assertSame(['unassigned' => 3, 'requested' => 5, 'confirmed' => 2, 'past' => 6, 'cancelled' => 2, 'today' => 8, 'to_close' => 2], $counts);

        // `filter[mine]` est l'écriture longue de `mine=1`.
        $this->assertSame(
            $this->getJson('/api/property-visits/counts?mine=1')->json('data'),
            $this->getJson('/api/property-visits/counts?filter[mine]=1')->assertOk()->json('data'),
        );
    }

    public function test_un_agent_d_une_autre_agence_et_un_client_ne_comptent_rien_de_x(): void
    {
        Sanctum::actingAs($this->personnel($this->agence()));
        $this->assertSame(array_fill_keys(self::ONGLETS, 0), $this->getJson('/api/property-visits/counts')->assertOk()->json('data'));

        Sanctum::actingAs($this->client());
        $this->assertSame(array_fill_keys(self::ONGLETS, 0), $this->getJson('/api/property-visits/counts')->assertOk()->json('data'));
    }

    /** Une requête pour les sept comptes (plus celles de l'authentification et de la portée). */
    public function test_les_sept_comptes_en_une_requete(): void
    {
        Sanctum::actingAs($this->moi);
        $this->getJson('/api/property-visits/counts')->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/property-visits/counts')->assertOk();
        $comptes = collect(DB::getQueryLog())->filter(fn (array $q) => str_contains($q['query'], 'count(*) filter'))->count();
        DB::disableQueryLog();

        $this->assertSame(1, $comptes);
    }

    public function test_sans_compte_401(): void
    {
        $this->getJson('/api/property-visits/counts')->assertUnauthorized();
    }
}
