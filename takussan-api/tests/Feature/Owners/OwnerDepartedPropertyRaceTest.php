<?php

namespace Tests\Feature\Owners;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Owners\OwnerDepartureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2753 (r1 de la contre-vérification, ADR-0108 § 5) — un bien ne naît ni ne passe au nom d'un
 * bailleur parti, même quand le départ tombe ENTRE le jugement du bailleur et l'écriture du bien.
 *
 * L'entrelacement est rejoué de façon déterministe : le départ s'exécute dans l'évènement du modèle
 * (`creating` pour la saisie, `updating` pour le transfert), c'est-à-dire après le jugement de
 * `TitulaireALaSaisie::bailleurActif()` et avant l'écriture. Avant la garde, la saisie rendait 201 et
 * le bailleur parti tenait un bien vivant. Le rejugement sous verrou après l'écriture
 * (`TitulaireALaSaisie::exigerActifSousVerrou()`) le refuse.
 *
 * Fixture : une agence A, son administrateur Ad, un agent Ag, le bailleur L (profil P dans A), sans
 * bien : son départ passe.
 */
class OwnerDepartedPropertyRaceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $landlord;

    private OwnerProfile $profile;

    private bool $parti = false;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Standard, 'commission_rate' => 8, 'is_verified' => true]);
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->agencyAgent($this->agency);
        $this->landlord = User::factory()->withOwnerProfile($this->agency)->create(['phone_verified_at' => now()]);
        $this->profile = OwnerProfile::query()->where('user_id', $this->landlord->id)->firstOrFail();
    }

    private function asUser(User $u): void
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($u->fresh(), 'sanctum');
    }

    /** Le départ réel de L, une fois, quand le modèle s'apprête à écrire un bien à son nom. */
    private function partirAuMomentDe(string $evenement): void
    {
        Property::$evenement(function (Property $p): void {
            if ($this->parti || (int) $p->user_id !== (int) $this->landlord->id) {
                return;
            }
            $this->parti = true;
            app(OwnerDepartureService::class)->depart($this->profile->fresh(), $this->admin->fresh());
        });
    }

    /** @param  array<string, mixed>  $extra */
    private function saisir(array $extra = []): TestResponse
    {
        return $this->postJson('/api/properties', [
            'title' => 'Course', 'type' => 'apartment', 'contract_type' => 'rent', 'rent_period' => 'monthly',
            'price' => 300_000, ...$extra,
        ]);
    }

    private function biensDeL(): int
    {
        return Property::query()->where('user_id', $this->landlord->id)->where('agency_id', $this->agency->id)->count();
    }

    public function test_temoin_la_saisie_au_nom_d_un_bailleur_actif_passe(): void
    {
        $this->asUser($this->agent);
        $this->saisir(['owner_id' => $this->landlord->id])->assertCreated();
        $this->assertSame(1, $this->biensDeL());
    }

    public function test_le_depart_entre_le_jugement_et_l_insertion_refuse_la_saisie(): void
    {
        $this->partirAuMomentDe('creating');
        $this->asUser($this->agent);

        $this->saisir(['owner_id' => $this->landlord->id])
            ->assertStatus(422)->assertJsonPath('code', 'property.owner_not_in_agency');
        $this->assertTrue($this->parti, 'le départ a bien couru dans la fenêtre');
        $this->assertSame(0, $this->biensDeL());
    }

    public function test_le_lot_qui_herite_d_un_bailleur_parti_entre_temps_est_refuse(): void
    {
        $immeuble = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        // Le départ réel est refusé tant que l'immeuble existe : on rejoue son effet (le profil
        // devenu inactif, validé par une autre transaction) dans la même fenêtre.
        Property::creating(function (Property $p): void {
            if (! $this->parti && (int) $p->user_id === (int) $this->landlord->id) {
                $this->parti = true;
                $this->profile->fresh()->forceFill(['status' => OwnerProfileStatus::Inactive])->save();
            }
        });
        $this->asUser($this->admin);

        $this->saisir(['parent_id' => $immeuble->id])
            ->assertStatus(422)->assertJsonPath('code', 'property.owner_not_in_agency');
        $this->assertTrue($this->parti);
        $this->assertSame(0, Property::query()->where('parent_id', $immeuble->id)->count());
    }

    public function test_temoin_le_lot_herite_du_bailleur_actif(): void
    {
        $immeuble = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $this->asUser($this->admin);

        $this->saisir(['parent_id' => $immeuble->id])->assertCreated();
        $this->assertSame(2, $this->biensDeL());
    }

    public function test_la_proposition_d_un_bailleur_parti_entre_temps_est_refusee(): void
    {
        $this->partirAuMomentDe('creating');
        $this->asUser($this->landlord);

        $this->saisir()->assertStatus(422)->assertJsonPath('code', 'property.owner_not_in_agency');
        $this->assertTrue($this->parti);
        $this->assertSame(0, $this->biensDeL());
    }

    public function test_temoin_le_transfert_a_un_bailleur_actif_passe(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
        $this->asUser($this->admin);

        $this->putJson("/api/properties/{$bien->id}/owner", ['owner_id' => $this->landlord->id])->assertOk();
        $this->assertSame((int) $this->landlord->id, (int) $bien->fresh()->user_id);
    }

    public function test_le_depart_entre_le_jugement_et_l_ecriture_refuse_le_transfert(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
        $this->partirAuMomentDe('updating');
        $this->asUser($this->admin);

        $this->putJson("/api/properties/{$bien->id}/owner", ['owner_id' => $this->landlord->id])
            ->assertStatus(422)->assertJsonPath('code', 'property.owner_not_in_agency');
        $this->assertTrue($this->parti);
        $this->assertSame((int) $this->agent->id, (int) $bien->fresh()->user_id);
        $this->assertSame(0, $this->biensDeL());
    }
}
