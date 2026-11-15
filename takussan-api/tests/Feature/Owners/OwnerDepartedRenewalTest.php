<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2753 (r0 de la contre-vérification, ADR-0108 § 5) — un bail échu ne se renouvelle ni au nom
 * d'un bailleur parti (ou bloqué) de l'agence, ni sur un bien supprimé. Avant la garde, l'admin
 * renouvelait le bail `expired` d'un bailleur parti : un bail neuf naissait à son nom, sur un bien
 * supprimé, et le départ se trouvait défait sans que rien ne le dise.
 *
 * Fixture : une agence A, son administrateur Ad, le bailleur L (profil P dans A), un locataire, un
 * bien VIVANT de L portant un bail `expired`.
 */
class OwnerDepartedRenewalTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private OwnerProfile $profile;

    private Property $property;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
        $tenant = Customer::factory()->create(['user_id' => User::factory()->create()->id, 'agency_id' => $this->agency->id]);
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $tenant->id, 'status' => LeaseStatus::Expired, 'commission_rate' => 10,
            'start_date' => '2025-10-01', 'end_date' => '2026-09-30',
        ]);
        $this->actingAs($this->admin, 'sanctum');
    }

    private function renouveler(): TestResponse
    {
        return $this->postJson("/api/leases/{$this->lease->id}/renew", []);
    }

    private function enfants(): int
    {
        return Lease::query()->where('renewed_from_lease_id', $this->lease->id)->count();
    }

    public function test_temoin_le_bail_echu_d_un_bailleur_actif_se_renouvelle(): void
    {
        $this->renouveler()->assertCreated();
        $this->assertSame(1, $this->enfants());
    }

    public function test_le_depart_reel_puis_le_renouvellement_est_refuse(): void
    {
        $this->property->delete();
        $this->deleteJson("/api/owners/{$this->profile->id}")->assertOk();
        $this->assertSame(OwnerProfileStatus::Inactive, $this->profile->fresh()->status);

        $this->renouveler()->assertStatus(422)->assertJsonPath('code', 'lease.renewal_property_deleted');
        $this->assertSame(0, $this->enfants());
    }

    public function test_un_bailleur_parti_ne_recoit_pas_de_bail_meme_sur_un_bien_vivant(): void
    {
        $this->profile->forceFill(['status' => OwnerProfileStatus::Inactive])->save();

        $this->renouveler()->assertStatus(422)->assertJsonPath('code', 'lease.renewal_owner_departed');
        $this->assertSame(0, $this->enfants());
    }

    public function test_un_bailleur_bloque_non_plus(): void
    {
        $this->profile->forceFill(['status' => OwnerProfileStatus::Blocked])->save();

        $this->renouveler()->assertStatus(422)->assertJsonPath('code', 'lease.renewal_owner_departed');
        $this->assertSame(0, $this->enfants());
    }

    public function test_un_bien_supprime_refuse_le_renouvellement_meme_a_un_bailleur_actif(): void
    {
        $this->property->delete();

        $this->renouveler()->assertStatus(422)->assertJsonPath('code', 'lease.renewal_property_deleted');
        $this->assertSame(0, $this->enfants());
    }

    public function test_le_depart_d_une_autre_agence_ne_compte_pas(): void
    {
        $autre = Agency::factory()->create(['kind' => AgencyKind::Standard, 'is_verified' => true]);
        OwnerProfile::query()->create([
            'user_id' => $this->landlord->id, 'agency_id' => $autre->id, 'status' => OwnerProfileStatus::Inactive,
        ]);

        $this->renouveler()->assertCreated();
        $this->assertSame(1, $this->enfants());
    }

    public function test_les_libelles_existent_dans_les_trois_langues(): void
    {
        foreach (['fr', 'en', 'wo'] as $langue) {
            foreach (['renewal_property_deleted', 'renewal_owner_departed'] as $code) {
                $this->assertNotSame("errors.lease.{$code}", __("errors.lease.{$code}", [], $langue), "{$langue} : {$code}");
            }
        }
    }
}
