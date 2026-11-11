<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\VisitReportOutcome;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\CustomerSuggestedStageQuery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2591 (ADR-0103 § 5) — l'étape proposée par le dernier fait postérieur au dernier
 * changement d'étape : visite confirmée → prospect, compte rendu « intéressé » → qualifié,
 * candidature ou offre → négociation, bail signé → gagné. Jamais en arrière, jamais vers
 * « perdu », jamais écrite ; écartée, elle ne revient pas pour le même fait.
 */
class CustomerSuggestedStageTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Property $property;

    private Customer $mouhamed;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);

        $this->travelTo(now()->subDays(20));
        $this->mouhamed = $this->fiche(CustomerPipelineStage::Lead, ['first_name' => 'Mouhamed']);
        $this->travelBack();
        $this->travelTo(now()->subDays(15));
    }

    protected function tearDown(): void
    {
        $this->travelBack();
        parent::tearDown();
    }

    /** @param  array<string, mixed>  $attributes */
    private function fiche(CustomerPipelineStage $stage, array $attributes = []): Customer
    {
        return Customer::factory()->create($attributes + [
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'user_id' => null,
            'status' => CustomerStatus::Active,
            'pipeline_stage' => $stage,
        ]);
    }

    private function visiteConfirmee(?Customer $fiche = null, array $attributes = []): PropertyVisit
    {
        $this->travel(1)->days();
        $visit = PropertyVisit::factory()->create($attributes + [
            'property_id' => $this->property->id,
            'customer_id' => ($fiche ?? $this->mouhamed)->id,
            'visitor_id' => null,
            'status' => VisitStatus::Scheduled,
        ]);
        $this->travel(1)->hours();
        $visit->update(['status' => VisitStatus::Confirmed]);

        return $visit;
    }

    private function compteRendu(PropertyVisit $visit, VisitReportOutcome $outcome): void
    {
        $this->travel(1)->days();
        $visit->update(['status' => VisitStatus::Completed, 'completed_at' => now(), 'report_outcome' => $outcome, 'reported_at' => now()]);
    }

    private function demande(Customer $fiche, BookingKind $kind, BookingStatus $status = BookingStatus::Pending): Booking
    {
        $this->travel(1)->days();

        return Booking::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id,
            'customer_id' => $fiche->id, 'created_by_id' => $this->agent->id,
            'kind' => $kind, 'status' => $status,
        ]);
    }

    private function etape(Customer $fiche, CustomerPipelineStage $stage): void
    {
        $this->travel(1)->days();
        $fiche->update(['pipeline_stage' => $stage]);
    }

    /** @return array{to: string, reason: string, at: string}|null */
    private function proposee(?Customer $fiche = null): ?array
    {
        Sanctum::actingAs($this->agent);
        $fiche ??= $this->mouhamed;

        $show = $this->getJson("/api/customers/{$fiche->id}?fields[customers]=id,pipeline_stage,suggested_stage")
            ->assertOk()->assertJsonPath('data.pipeline_stage', $fiche->fresh()->pipeline_stage->value)
            ->json('data.suggested_stage');
        $liste = collect($this->getJson('/api/customers?fields[customers]=id,suggested_stage&per_page=100')->assertOk()->json('data'))
            ->firstWhere('id', $fiche->id)['suggested_stage'];
        $this->assertSame($show, $liste, 'la fiche et la liste disent la même chose');

        return $show;
    }

    private function ecarter(string $reason, ?Customer $fiche = null): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson('/api/customers/'.($fiche ?? $this->mouhamed)->id.'/suggested-stage/dismiss', ['reason_event' => $reason]);
    }

    public function test_ac4_confirmed_visit_proposes_prospect_dismiss_clears_it_and_an_interested_report_proposes_qualified(): void
    {
        $this->assertNull($this->proposee());

        $visit = $this->visiteConfirmee();
        $proposee = $this->proposee();
        $this->assertSame('prospect', $proposee['to']);
        $this->assertSame('visit_confirmed', $proposee['reason']);
        $this->assertSame($visit->fresh()->confirmed_at->toIso8601String(), $proposee['at']);

        $this->ecarter('visit_confirmed')->assertNoContent();
        $this->assertNull($this->proposee());
        $this->assertSame('lead', $this->mouhamed->fresh()->pipeline_stage->value, 'aucune étape ne change sans geste');
        $this->assertSame(1, Activity::query()->where('subject_id', $this->mouhamed->id)->where('event', CustomerSuggestedStageQuery::DISMISSED_EVENT)->count());

        $this->compteRendu($visit, VisitReportOutcome::Interested);
        $this->assertSame(['to' => 'qualified', 'reason' => 'visit_interested'], array_intersect_key($this->proposee(), ['to' => 1, 'reason' => 1]));
    }

    public function test_a_dismissed_fact_never_comes_back_but_a_new_one_proposes_again(): void
    {
        $this->visiteConfirmee();
        $this->ecarter('visit_confirmed')->assertNoContent();

        // Une retouche de la visite écartée ne la ressuscite pas.
        $this->travel(1)->days();
        PropertyVisit::query()->where('customer_id', $this->mouhamed->id)->first()->update(['notes' => 'portail bleu']);
        $this->assertNull($this->proposee());

        // Une seconde visite, confirmée après : un fait nouveau.
        $this->visiteConfirmee();
        $this->assertSame('prospect', $this->proposee()['to']);
    }

    public function test_ac5_an_application_on_a_qualified_fiche_proposes_negotiating_a_visit_on_a_negotiating_fiche_nothing(): void
    {
        $qualifiee = $this->fiche(CustomerPipelineStage::Qualified);
        $this->demande($qualifiee, BookingKind::Application);
        $this->assertSame(['to' => 'negotiating', 'reason' => 'application_created'], array_intersect_key($this->proposee($qualifiee), ['to' => 1, 'reason' => 1]));

        $offre = $this->fiche(CustomerPipelineStage::Prospect);
        $this->demande($offre, BookingKind::Offer);
        $this->assertSame('offer_created', $this->proposee($offre)['reason']);

        $negociation = $this->fiche(CustomerPipelineStage::Negotiating);
        $this->visiteConfirmee($negociation);
        $this->assertNull($this->proposee($negociation));
    }

    public function test_a_signed_lease_proposes_converted_from_any_live_stage(): void
    {
        $locataire = $this->fiche(CustomerPipelineStage::Prospect);
        $this->travel(1)->days();
        Lease::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'tenant_id' => $locataire->id, 'signed_at' => now()]);

        $this->assertSame(['to' => 'converted', 'reason' => 'lease_signed'], array_intersect_key($this->proposee($locataire), ['to' => 1, 'reason' => 1]));
    }

    public function test_only_facts_after_the_last_stage_change_count(): void
    {
        $this->visiteConfirmee();
        $this->etape($this->mouhamed, CustomerPipelineStage::Prospect);
        $this->assertNull($this->proposee(), 'la visite précède le passage en prospect');

        // Retour en arrière à la main : la visite, antérieure au changement, ne propose rien.
        $this->etape($this->mouhamed, CustomerPipelineStage::Lead);
        $this->assertNull($this->proposee());
    }

    public function test_never_backwards_never_to_lost_and_nothing_on_a_closed_fiche(): void
    {
        foreach ([CustomerPipelineStage::Converted, CustomerPipelineStage::Lost] as $stage) {
            $close = $this->fiche($stage);
            $this->demande($close, BookingKind::Offer);
            $this->assertNull($this->proposee($close), $stage->value);
        }

        $qualifiee = $this->fiche(CustomerPipelineStage::Qualified);
        $this->visiteConfirmee($qualifiee);
        $this->assertNull($this->proposee($qualifiee), 'une visite ne ramène pas un qualifié en prospect');
    }

    /** « Le dernier fait », à la lettre : une visite plus récente masque une candidature antérieure. */
    public function test_the_last_fact_alone_decides(): void
    {
        $qualifiee = $this->fiche(CustomerPipelineStage::Qualified);
        $this->demande($qualifiee, BookingKind::Application);
        $this->visiteConfirmee($qualifiee);

        $this->assertNull($this->proposee($qualifiee));
    }

    public function test_closed_bookings_and_cancelled_visits_are_not_facts(): void
    {
        $prospect = $this->fiche(CustomerPipelineStage::Prospect);
        $this->demande($prospect, BookingKind::Offer, BookingStatus::Rejected);
        $this->assertNull($this->proposee($prospect));

        $lead = $this->fiche(CustomerPipelineStage::Lead);
        $visit = $this->visiteConfirmee($lead);
        $visit->update(['status' => VisitStatus::Cancelled]);
        $this->assertNull($this->proposee($lead));
    }

    public function test_a_visit_made_by_the_account_of_the_fiche_counts(): void
    {
        $compte = User::factory()->create();
        $fiche = $this->fiche(CustomerPipelineStage::Lead, ['user_id' => $compte->id]);
        $this->visiteConfirmee($fiche, ['customer_id' => null, 'visitor_id' => $compte->id]);

        $this->assertSame('prospect', $this->proposee($fiche)['to']);
    }

    /**
     * Les horodatages sont à la seconde : une fiche créée puis sa candidature saisie dans la foulée
     * peuvent la partager. L'étape de création est un défaut, pas une décision prise au vu du fait :
     * ce fait fondateur compte. Un fait de la même seconde qu'un changement d'étape à la main, non.
     */
    public function test_a_fact_born_with_the_fiche_counts_but_not_one_at_the_instant_of_a_stage_change(): void
    {
        $neeAvec = $this->fiche(CustomerPipelineStage::Lead);
        Booking::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id,
            'customer_id' => $neeAvec->id, 'created_by_id' => $this->agent->id,
            'kind' => BookingKind::Application, 'status' => BookingStatus::Pending,
        ]);
        $this->assertSame('application_created', $this->proposee($neeAvec)['reason']);

        $deplacee = $this->fiche(CustomerPipelineStage::Lead);
        $this->travel(1)->days();
        $deplacee->update(['pipeline_stage' => CustomerPipelineStage::Prospect]);
        Booking::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id,
            'customer_id' => $deplacee->id, 'created_by_id' => $this->agent->id,
            'kind' => BookingKind::Offer, 'status' => BookingStatus::Pending,
        ]);
        $this->assertNull($this->proposee($deplacee));
    }

    /**
     * L'agence est la frontière : la visite que le COMPTE du client a faite chez une autre agence
     * n'est pas un fait de cette fiche — ni sa proposition, ni son heure ne doivent fuiter.
     */
    public function test_a_visit_of_the_account_at_another_agency_proposes_nothing(): void
    {
        $compte = User::factory()->create();
        $fiche = $this->fiche(CustomerPipelineStage::Lead, ['user_id' => $compte->id]);
        $ailleurs = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->visiteConfirmee($fiche, ['customer_id' => null, 'visitor_id' => $compte->id, 'property_id' => $ailleurs->id]);

        $this->assertNull($this->proposee($fiche));
    }

    public function test_dismiss_refuses_a_stale_reason_and_a_reader_without_rights(): void
    {
        $this->ecarter('visit_confirmed')->assertStatus(409)->assertJsonPath('code', 'customer.suggested_stage_stale');

        $this->visiteConfirmee();
        $this->ecarter('lease_signed')->assertStatus(409);
        $this->ecarter('nope')->assertStatus(422);

        Sanctum::actingAs(User::factory()->withAgentProfile(Agency::factory()->create())->create());
        $this->postJson("/api/customers/{$this->mouhamed->id}/suggested-stage/dismiss", ['reason_event' => 'nope'])->assertForbidden();

        $this->assertSame('prospect', $this->proposee()['to']);
    }

    public function test_a_legacy_confirmed_visit_gets_its_confirmation_date_from_the_migration(): void
    {
        $visit = $this->visiteConfirmee();
        DB::table('property_visits')->where('id', $visit->id)->update(['confirmed_at' => null]);

        $migration = require database_path('migrations/2026_11_11_130500_add_confirmed_at_to_property_visits.php');
        $migration->down();
        $migration->up();

        $this->assertEquals($visit->fresh()->updated_at, $visit->fresh()->confirmed_at);
    }

    public function test_confirming_through_the_api_dates_the_fact(): void
    {
        $this->travel(1)->days();
        $visit = PropertyVisit::factory()->create([
            'property_id' => $this->property->id, 'customer_id' => $this->mouhamed->id,
            'visitor_id' => null, 'agent_id' => $this->agent->id, 'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(3),
        ]);
        $this->travel(1)->hours();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/property-visits/{$visit->id}/confirm")->assertOk();

        $this->assertNotNull($visit->fresh()->confirmed_at);
        $this->assertSame('visit_confirmed', $this->proposee()['reason']);
    }
}
