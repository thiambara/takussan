<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2589 (lot C2) — « Confirmer » de la fiche client lit ce qu'il lui faut dans `upcoming_visits`
 * et non plus dans le show de la visite (qui sert le visiteur et la fiche) : `preferred_window` et
 * `manage`. La règle de `manage` est CELLE d'`abilities.manage` du show de visite
 * (`PropertyVisitPolicy::gere`), sans N+1 sur le bien, et la clé n'existe que là où
 * `upcoming_visits` est servi : au personnel de l'agence de la fiche.
 */
class CustomerUpcomingVisitsManageTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $bailleurAuteur;

    private Customer $fiche;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->bailleurAuteur = $this->bailleur($this->agence);
        $this->fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->bailleurAuteur->id]);
    }

    private function visite(Property $bien, array $attributes = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributes + [
            'property_id' => $bien->id,
            'customer_id' => $this->fiche->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => Carbon::parse('2026-11-12 10:00:00'),
        ]);
    }

    /** @return array<string, mixed> */
    private function fiche(): array
    {
        return $this->getJson("/api/customers/{$this->fiche->id}?fields[customers]=next_action,follow_up,referent&include=upcomingVisits")
            ->assertOk()->json('data');
    }

    public function test_manage_est_la_regle_du_show_de_visite_pour_chaque_visite_a_venir(): void
    {
        $dansLAgence = $this->visite($this->bienDe($this->agence, $this->bailleur($this->agence)));
        $aTranche = $this->visite($this->bienDe($this->agence, $this->bailleur($this->agence)), [
            'scheduled_at' => Carbon::parse('2026-11-12 14:00:00'), 'preferred_window' => VisitWindow::Afternoon,
        ]);
        // Le client visite aussi le bien d'une AUTRE agence, où l'admin reste l'agent assigné :
        // `update` le laisse passer (agent de la visite), `agitPourLeBien` non (pas du personnel de
        // cette agence). Il la lit à la fiche, il ne la gère pas.
        $ailleurs = $this->agence();
        $horsAgence = $this->visite($this->bienDe($ailleurs, $this->bailleur($ailleurs)), [
            'scheduled_at' => Carbon::parse('2026-11-13 10:00:00'), 'agent_id' => $this->admin->id,
        ]);

        Sanctum::actingAs($this->admin);
        $aVenir = collect($this->fiche()['upcoming_visits'])->keyBy('id');

        $this->assertSame([$dansLAgence->id, $aTranche->id, $horsAgence->id], $aVenir->keys()->all());
        $this->assertTrue($aVenir[$dansLAgence->id]['manage']);
        $this->assertTrue($aVenir[$aTranche->id]['manage']);
        $this->assertFalse($aVenir[$horsAgence->id]['manage']);
        $this->assertNull($aVenir[$dansLAgence->id]['preferred_window']);
        $this->assertSame('afternoon', $aVenir[$aTranche->id]['preferred_window']);

        // La même règle que le show de la visite, visite par visite.
        foreach ([$dansLAgence, $aTranche] as $v) {
            $this->assertSame($aVenir[$v->id]['manage'], $this->getJson("/api/property-visits/{$v->id}")->assertOk()->json('data.abilities.manage'));
        }

        // Rien du visiteur ni de la fiche : ces seules clés.
        $this->assertSame(['id', 'property_id', 'status', 'scheduled_at', 'preferred_window', 'manage'], array_keys($aVenir[$dansLAgence->id]));
    }

    public function test_hors_personnel_ni_upcoming_visits_ni_manage(): void
    {
        $this->visite($this->bienDe($this->agence, $this->bailleur($this->agence)));

        Sanctum::actingAs($this->bailleurAuteur);
        $corps = $this->getJson("/api/customers/{$this->fiche->id}?fields[customers]=next_action,follow_up,referent&include=upcomingVisits")->assertOk();

        $this->assertArrayNotHasKey('upcoming_visits', $corps->json('data'));
        $this->assertStringNotContainsString('"manage"', $corps->getContent());
    }

    public function test_le_meme_nombre_de_requetes_pour_une_et_pour_trois_visites(): void
    {
        $this->visite($this->bienDe($this->agence, $this->bailleur($this->agence)));

        Sanctum::actingAs($this->admin);
        $compter = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->fiche();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        // Une première lecture chauffe les caches de la requête suivante (capacités, réglages).
        $compter();
        $une = $compter();

        foreach (['2026-11-13 10:00:00', '2026-11-14 10:00:00'] as $quand) {
            $this->visite($this->bienDe($this->agence, $this->bailleur($this->agence)), ['scheduled_at' => Carbon::parse($quand)]);
        }
        $this->assertCount(3, $this->fiche()['upcoming_visits']);
        $this->assertSame($une, $compter());
    }
}
