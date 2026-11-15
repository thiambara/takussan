<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\ApiTestCase;

/**
 * TCK-2672 (AC5) — `GET /api/properties/moderation/{property}` : le bien soumis en entier, qui
 * l'a soumis (avec son profil dans l'agence) et la liste de contrôle, dans le périmètre de la file.
 */
class PropertyModerationDetailTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['moderation_required' => true]);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
        $this->landlord = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Fall']);
        $this->materializeRoleProfile($this->landlord, 'owner', $this->agency);
    }

    /** Un bien saisi par `$by` dans l'agence : l'observateur le met en revue, `Auditable` le journalise. */
    private function submittedBy(User $by, ?User $holder = null): Property
    {
        $this->actingAs($by);
        $property = Property::factory()->create([
            'agency_id' => $this->agency->id, 'user_id' => ($holder ?? $by)->id,
            'status' => PropertyStatus::Available, 'description' => 'Grand appartement lumineux au calme.',
        ]);
        $this->assertSame(PropertyStatus::PendingReview, $property->fresh()->status, 'précondition : en revue');

        return $property;
    }

    public function test_ac5_description_toutes_les_photos_et_le_bailleur(): void
    {
        $property = $this->submittedBy($this->landlord);
        foreach (range(1, 6) as $i) {
            $property->addMedia(UploadedFile::fake()->image("p{$i}.jpg"))->toMediaCollection('photos');
        }
        $this->actingAsApi($this->admin);

        $data = $this->getJson("/api/properties/moderation/{$property->id}")->assertOk()->json('data');

        $this->assertSame('Grand appartement lumineux au calme.', $data['description']);
        $this->assertCount(6, $data['photos']);
        $this->assertNotNull($data['photos'][0]['url']);
        $this->assertSame(['id' => $this->landlord->id, 'name' => 'Moussa Fall', 'profile' => 'owner'], $data['submitted_by']);
        $this->assertSame(1, $data['submitted_count_in_agency']);
        $this->assertSame(6, $data['checks']['photos_count']);
        $this->assertSame(5, $data['checks']['description_words']);
        $this->assertArrayHasKey('price_vs_median', $data['checks']);
        $this->assertNotNull($data['submitted_at']);
        foreach (['price', 'type', 'contract_type', 'address'] as $key) {
            $this->assertArrayHasKey($key, $data);
        }
    }

    public function test_un_bien_saisi_par_un_agent_pour_un_bailleur_est_soumis_par_l_agent(): void
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $this->agency);
        $this->submittedBy($agent, $this->landlord);
        $property = $this->submittedBy($agent, $this->landlord);
        $this->actingAsApi($this->admin);

        $data = $this->getJson("/api/properties/moderation/{$property->id}")->assertOk()->json('data');

        $this->assertSame($agent->id, $data['submitted_by']['id']);
        $this->assertSame('agent', $data['submitted_by']['profile']);
        $this->assertSame(2, $data['submitted_count_in_agency']);
    }

    public function test_le_troisieme_bien_du_bailleur(): void
    {
        $this->submittedBy($this->landlord);
        $this->submittedBy($this->landlord);
        $property = $this->submittedBy($this->landlord);
        $this->actingAsApi($this->admin);

        $this->getJson("/api/properties/moderation/{$property->id}")->assertOk()
            ->assertJsonPath('data.submitted_count_in_agency', 3);
    }

    /** Sans trace au journal (bien posé hors d'une session), le titulaire, et tous ses biens de l'agence. */
    public function test_sans_journal_le_titulaire_et_ses_biens_de_l_agence(): void
    {
        $this->app['auth']->forgetGuards();
        $property = null;
        foreach (range(1, 3) as $i) {
            $property = Property::factory()->create([
                'agency_id' => $this->agency->id, 'user_id' => $this->landlord->id, 'status' => PropertyStatus::PendingReview,
            ]);
        }
        Property::factory()->create(['agency_id' => Agency::factory()->create()->id, 'user_id' => $this->landlord->id]);
        $this->actingAsApi($this->admin);

        $data = $this->getJson("/api/properties/moderation/{$property->id}")->assertOk()->json('data');

        $this->assertSame(['id' => $this->landlord->id, 'name' => 'Moussa Fall', 'profile' => 'owner'], $data['submitted_by']);
        $this->assertSame(3, $data['submitted_count_in_agency']);
    }

    public function test_hors_du_perimetre_403(): void
    {
        $property = $this->submittedBy($this->landlord);

        $otherAdmin = User::factory()->create();
        $this->materializeRoleProfile($otherAdmin, 'agency_admin', Agency::factory()->create());
        $this->actingAsApi($otherAdmin);
        $this->getJson("/api/properties/moderation/{$property->id}")->assertForbidden();

        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $this->agency);
        $this->actingAsApi($agent);
        $this->getJson("/api/properties/moderation/{$property->id}")->assertForbidden();

        $this->actingAsApi($this->landlord);
        $this->getJson("/api/properties/moderation/{$property->id}")->assertForbidden();
    }

    public function test_la_plateforme_voit_tout(): void
    {
        $property = $this->submittedBy($this->landlord);
        $this->apiActingAsRole('super_admin');

        $this->getJson("/api/properties/moderation/{$property->id}")->assertOk()
            ->assertJsonPath('data.id', $property->id);
    }

    public function test_la_route_ne_masque_pas_la_file(): void
    {
        $this->submittedBy($this->landlord);
        $this->actingAsApi($this->admin);

        $this->getJson('/api/properties/moderation')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/properties/moderation/abc')->assertNotFound();
    }
}
