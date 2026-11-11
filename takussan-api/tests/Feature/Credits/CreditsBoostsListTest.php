<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\Enums\BoostBadge;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyBoostDailyStat;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2663 — `GET /api/credits/boosts` : les mises en avant de l'espace actif et ce que chacune a
 * rapporté DANS SA FENÊTRE (de `starts_at` à `ended_at`, ou maintenant si elle court).
 */
class CreditsBoostsListTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(Carbon::parse('2026-11-20 10:00:00'));
    }

    private function property(Agency $agency, array $attributes = []): Property
    {
        return Property::factory()->published()->create(['agency_id' => $agency->id] + $attributes);
    }

    private function boost(Property $property, string $starts, ?string $ended, BoostStatus $status = BoostStatus::Ended, BoostKind $kind = BoostKind::Featured): PropertyBoost
    {
        return PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $property->agency_id, 'kind' => $kind,
            'variant' => $kind === BoostKind::Badge ? BoostBadge::cases()[0] : null,
            'price_credits' => 20, 'duration_days' => 7,
            'starts_at' => Carbon::parse($starts), 'ends_at' => Carbon::parse($ended ?? $starts)->addDays(7),
            'ended_at' => $ended !== null ? Carbon::parse($ended) : null, 'status' => $status,
        ]);
    }

    private function lead(Property $property, string $at, array $attributes = []): PropertyContactLead
    {
        $lead = PropertyContactLead::factory()->create(['property_id' => $property->id] + $attributes);
        $lead->forceFill(['created_at' => Carbon::parse($at)])->save();

        return $lead;
    }

    private function visit(Property $property, string $at, VisitStatus $status = VisitStatus::Scheduled): void
    {
        $visit = PropertyVisit::factory()->create(['property_id' => $property->id, 'status' => $status]);
        $visit->forceFill(['created_at' => Carbon::parse($at)])->save();
    }

    private function stat(PropertyBoost $boost, string $date, int $impressions, int $clicks): void
    {
        PropertyBoostDailyStat::query()->create([
            'property_boost_id' => $boost->id, 'date' => $date, 'impressions' => $impressions, 'clicks' => $clicks,
        ]);
    }

    /** @return array<string, mixed> */
    private function row(array $data, int $id): array
    {
        $row = collect($data)->firstWhere('id', $id);
        $this->assertNotNull($row, "le boost {$id} est absent de la liste");

        return $row;
    }

    public function test_ac1_les_mesures_sont_prises_dans_la_fenetre_du_boost(): void
    {
        $agency = Agency::factory()->create();
        $property = $this->property($agency);
        $other = $this->property($agency);
        $boost = $this->boost($property, '2026-11-05 09:00', '2026-11-12 09:00');
        $neighbour = $this->boost($other, '2026-11-05 09:00', '2026-11-12 09:00');

        $this->lead($property, '2026-11-04 18:00');            // avant la fenêtre
        $this->lead($property, '2026-11-06 12:00');            // dedans
        $this->lead($property, '2026-11-14 12:00');            // après
        $this->lead($other, '2026-11-07 12:00');               // un autre bien, dans la fenêtre
        $this->visit($property, '2026-11-04 18:00');
        $this->visit($property, '2026-11-07 12:00');
        $this->visit($property, '2026-11-13 12:00');
        $this->stat($boost, '2026-11-05', 100, 3);
        $this->stat($boost, '2026-11-06', 50, 2);
        $this->stat($neighbour, '2026-11-05', 999, 99);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($this->apiGet('/api/credits/boosts')->assertOk()->json('data'), $boost->id);

        $this->assertSame(['impressions' => 150, 'clicks' => 5, 'contacts' => 1, 'visits' => 1], $row['measures']);
    }

    public function test_ac1_un_boost_qui_court_se_mesure_jusqu_a_maintenant(): void
    {
        $agency = Agency::factory()->create();
        $property = $this->property($agency);
        $boost = $this->boost($property, '2026-11-18 09:00', null, BoostStatus::Active);

        $this->lead($property, '2026-11-17 12:00');            // avant
        $this->lead($property, '2026-11-19 12:00');            // dedans
        $this->lead($property, '2026-11-21 12:00');            // après maintenant
        $this->visit($property, '2026-11-19 12:00');

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($this->apiGet('/api/credits/boosts')->assertOk()->json('data'), $boost->id);

        $this->assertSame(1, $row['measures']['contacts']);
        $this->assertSame(1, $row['measures']['visits']);
        $this->assertSame(0, $row['measures']['impressions']);
        $this->assertNull($row['ended_at']);
    }

    public function test_les_clics_whatsapp_et_appel_comptent_comme_contacts(): void
    {
        $agency = Agency::factory()->create();
        $property = $this->property($agency);
        $boost = $this->boost($property, '2026-11-05 09:00', '2026-11-12 09:00');
        $this->lead($property, '2026-11-06 12:00');
        $this->lead($property, '2026-11-07 12:00', ['channel' => ContactLeadChannel::Whatsapp, 'name' => null, 'email' => null, 'phone' => null, 'message' => null]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($this->apiGet('/api/credits/boosts')->assertOk()->json('data'), $boost->id);

        $this->assertSame(2, $row['measures']['contacts']);
    }

    public function test_un_contact_adresse_a_une_autre_agence_ne_compte_pas(): void
    {
        $agency = Agency::factory()->create();
        $property = $this->property($agency);
        $boost = $this->boost($property, '2026-11-05 09:00', '2026-11-12 09:00');
        $this->lead($property, '2026-11-06 12:00');
        // Le bien a changé d'agence : la demande reçue par l'autre n'appartient pas à cet espace.
        $this->lead($property, '2026-11-07 12:00', ['agency_id' => Agency::factory()->create()->id]);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($this->apiGet('/api/credits/boosts')->assertOk()->json('data'), $boost->id);

        $this->assertSame(1, $row['measures']['contacts']);
    }

    public function test_la_ligne_rend_le_bien_et_aucune_donnee_du_demandeur(): void
    {
        $agency = Agency::factory()->create();
        $property = $this->property($agency, ['title' => 'Villa Mermoz']);
        $property->address()->create(['street' => '12 rue X', 'neighborhood' => 'Mermoz', 'city' => 'Dakar', 'country' => 'SN']);
        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');
        $boost = $this->boost($property, '2026-11-05 09:00', '2026-11-12 09:00');
        $this->lead($property, '2026-11-06 12:00', ['name' => 'Awa Secrète', 'phone' => '+221770000099', 'email' => 'awa@exemple.sn']);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $response = $this->apiGet('/api/credits/boosts')->assertOk();
        $row = $this->row($response->json('data'), $boost->id);

        $this->assertSame('featured', $row['kind']);
        $this->assertSame('ended', $row['status']);
        $this->assertSame(20, $row['price_credits']);
        $this->assertSame(['id', 'title', 'main_photo_url', 'quarter'], array_keys($row['property']));
        $this->assertSame('Villa Mermoz', $row['property']['title']);
        $this->assertSame('Mermoz', $row['property']['quarter']);
        $this->assertNotNull($row['property']['main_photo_url']);
        $this->assertStringNotContainsString('Awa Secrète', $response->getContent());
        $this->assertStringNotContainsString('770000099', $response->getContent());
        $this->assertStringNotContainsString('awa@exemple.sn', $response->getContent());
    }

    public function test_ac2_un_boost_d_une_autre_agence_n_apparait_jamais(): void
    {
        $agency = Agency::factory()->create();
        $mine = $this->boost($this->property($agency), '2026-11-18 09:00', null, BoostStatus::Active);
        $theirs = $this->boost($this->property(Agency::factory()->create()), '2026-11-18 09:00', null, BoostStatus::Active);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertSame([$mine->id], array_column($this->apiGet('/api/credits/boosts')->assertOk()->json('data'), 'id'));
        $this->apiGet("/api/credits/boosts?filter[id]={$theirs->id}")->assertOk()->assertJsonCount(0, 'data');
        $this->apiGet("/api/credits/boosts?filter[id]={$mine->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->apiGet("/api/credits/boosts?filter[id]={$theirs->id}&filter[status]=active")->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_ac3_un_membre_sans_boost_spend_recoit_403_avant_la_validation(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet('/api/credits/boosts')->assertForbidden();
        $this->apiGet('/api/credits/boosts?filter[status]=nimporte')->assertForbidden();
    }

    public function test_sans_espace_actif_le_refus_est_nomme(): void
    {
        $this->apiActingAsRole('customer');

        $this->apiGet('/api/credits/boosts')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }

    public function test_par_defaut_les_boosts_en_cours_et_ceux_termines_depuis_trente_jours(): void
    {
        $agency = Agency::factory()->create();
        $active = $this->boost($this->property($agency), '2026-11-18 09:00', null, BoostStatus::Active);
        $paused = $this->boost($this->property($agency), '2026-10-12 09:00', null, BoostStatus::Paused); // commencé avant les terminés
        $recent = $this->boost($this->property($agency), '2026-10-15 09:00', '2026-10-22 09:00');
        $cancelled = $this->boost($this->property($agency), '2026-11-01 09:00', '2026-11-02 09:00', BoostStatus::Cancelled);
        $old = $this->boost($this->property($agency), '2026-10-01 09:00', '2026-10-08 09:00');

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $default = array_column($this->apiGet('/api/credits/boosts')->assertOk()->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$active->id, $paused->id, $recent->id, $cancelled->id], $default);
        $this->assertSame([$active->id, $paused->id], array_slice($default, 0, 2), 'ce qui court passe d\'abord, le plus récent en tête');

        $live = array_column($this->apiGet('/api/credits/boosts?filter[status]=active')->assertOk()->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$active->id, $paused->id], $live);

        $ended = array_column($this->apiGet('/api/credits/boosts?filter[status]=ended')->assertOk()->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$recent->id, $cancelled->id, $old->id], $ended);

        $this->apiGet('/api/credits/boosts?filter[status]=paused')->assertStatus(422);
    }

    public function test_la_liste_est_paginee(): void
    {
        $agency = Agency::factory()->create();
        foreach (range(1, 3) as $i) {
            $this->boost($this->property($agency), "2026-11-1{$i} 09:00", null, BoostStatus::Active);
        }

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/credits/boosts?per_page=2')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.last_page', 2);
    }

    private function queriesFor(Agency $agency, int $boosts): int
    {
        foreach (range(1, $boosts) as $i) {
            $property = $this->property($agency);
            $property->address()->create(['neighborhood' => "Quartier {$i}", 'city' => 'Dakar', 'country' => 'SN']);
            $property->addMedia(UploadedFile::fake()->image('photo.jpg'))->toMediaCollection('photos');
            $boost = $this->boost($property, '2026-11-05 09:00', '2026-11-12 09:00');
            $this->stat($boost, '2026-11-06', 10, 1);
            $this->lead($property, '2026-11-06 12:00');
            $this->visit($property, '2026-11-07 12:00');
        }

        DB::flushQueryLog();
        DB::enableQueryLog();
        $response = $this->apiGet('/api/credits/boosts?per_page=50')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertCount($boosts, $response->json('data'));
        $this->assertNotNull($response->json('data.0.property.main_photo_url'));
        $this->assertSame(1, $response->json('data.0.measures.contacts'));

        return $count;
    }

    public function test_ac5_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_boosts(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => $small = Agency::factory()->create()]);
        $two = $this->queriesFor($small, 2);

        $this->apiActingAsRole('agency_admin', ['agency' => $large = Agency::factory()->create()]);
        $twenty = $this->queriesFor($large, 20);

        $this->assertSame($two, $twenty, "2 boosts : {$two} requêtes ; 20 boosts : {$twenty}");
    }
}
