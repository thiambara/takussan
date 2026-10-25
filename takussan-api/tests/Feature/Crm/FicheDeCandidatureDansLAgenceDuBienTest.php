<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P15.01 (TCK-2350, décision du porteur du 2026-10-25) — la fiche née d'une candidature naît dans
 * l'agence du BIEN, et non dans celle du visiteur.
 *
 * `CustomerService::findOrCreateFromUser()` créait la fiche avec l'agence du visiteur, `null` pour
 * un candidat sans profil d'agence : `visibleTo()` et `CustomerPolicy::view` la cachaient au
 * personnel de l'agence du bien, et `LeaseService` rendait 403 sur le bail tiré de la candidature.
 * La fiche réutilisée était la première du compte, quelle que soit son agence.
 *
 * Le rattachement d'une fiche que l'agence a déjà ne se fait que sur une coordonnée VÉRIFIÉE du
 * compte (patron de TCK-1710). Aucune fiche existante ne change d'agence. Un bien sans agence ne
 * change pas.
 */
class FicheDeCandidatureDansLAgenceDuBienTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = Agency::factory()->create();
        $this->bien = $this->bienAuMois($this->agence->id);
    }

    private function bienAuMois(?int $agencyId, array $extra = []): Property
    {
        return Property::factory()->published()->create($extra + [
            'agency_id' => $agencyId,
            'visibility' => PropertyVisibility::Public,
            'price' => 250_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
        ]);
    }

    /** Un candidat sans aucun profil d'agence. */
    private function candidat(array $attributes = []): User
    {
        return User::factory()->create($attributes + [
            'phone' => '+221771234567',
            'email' => 'awa@example.test',
            'phone_verified_at' => null,
            'email_verified_at' => null,
        ]);
    }

    private function postuler(User $candidat, ?Property $bien = null): Booking
    {
        $bien ??= $this->bien;
        $id = $this->actingAsApi($candidat)
            ->postJson("/api/public/properties/{$bien->slug}/booking-request", [
                'start_date' => now()->addDay()->toDateString(),
                'end_date' => now()->addYear()->toDateString(),
                'guests' => 1,
            ])
            ->assertCreated()
            ->json('data.id');

        return Booking::query()->findOrFail($id);
    }

    public function test_la_fiche_d_une_candidature_nait_dans_l_agence_du_bien_et_le_personnel_en_tire_un_bail(): void
    {
        $candidat = $this->candidat();

        $reservation = $this->postuler($candidat);

        $fiche = $reservation->customer;
        $this->assertSame($this->agence->id, $fiche->agency_id);
        $this->assertSame($candidat->id, $fiche->user_id);

        $agent = $this->agencyAgent($this->agence);
        $this->actingAsApi($agent)->getJson("/api/customers/{$fiche->id}")->assertOk();
        $this->postJson('/api/leases', [
            'property_id' => $this->bien->id,
            'tenant_id' => $fiche->id,
            'type' => 'residential_rent',
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 250000,
        ])->assertCreated();
    }

    public function test_la_reservation_par_l_api_et_l_offre_d_achat_suivent_la_meme_regle(): void
    {
        $candidat = $this->candidat();
        $sejour = $this->bienAuMois($this->agence->id, ['rent_period' => RentPeriod::Daily, 'price' => 30_000]);

        $id = $this->actingAsApi($candidat)->postJson('/api/bookings', [
            'property_id' => $sejour->id,
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
        ])->assertCreated()->json('data.id');
        $this->assertSame($this->agence->id, Booking::query()->findOrFail($id)->customer->agency_id);

        $autre = Agency::factory()->create();
        $aVendre = $this->bienAuMois($autre->id, ['contract_type' => ContractType::Sale, 'rent_period' => null]);
        $offre = $this->postJson("/api/public/properties/{$aVendre->slug}/booking-request", [
            'offer_amount' => 1_000_000,
            'offer_expires_at' => now()->addDays(10)->toDateString(),
            'terms_accepted' => true,
        ])->assertCreated()->json('data.id');
        $this->assertSame($autre->id, Booking::query()->findOrFail($offre)->customer->agency_id);
    }

    public function test_la_fiche_du_compte_dans_une_autre_agence_n_est_pas_reprise_et_ne_bouge_pas(): void
    {
        $candidat = $this->candidat();
        $ailleurs = Agency::factory()->create();
        $ficheAilleurs = Customer::factory()->create(['agency_id' => $ailleurs->id, 'user_id' => $candidat->id]);
        $ficheSansAgence = Customer::factory()->create(['agency_id' => null, 'user_id' => $candidat->id]);

        $reservation = $this->postuler($candidat);

        $this->assertNotContains($reservation->customer_id, [$ficheAilleurs->id, $ficheSansAgence->id]);
        $this->assertSame($this->agence->id, $reservation->customer->agency_id);
        $this->assertSame($ailleurs->id, $ficheAilleurs->refresh()->agency_id);
        $this->assertNull($ficheSansAgence->refresh()->agency_id);
    }

    public function test_la_fiche_du_compte_dans_l_agence_du_bien_est_reprise(): void
    {
        $candidat = $this->candidat();
        $fiche = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => $candidat->id]);

        $reservation = $this->postuler($candidat);

        $this->assertSame($fiche->id, $reservation->customer_id);
        $this->assertSame(1, Customer::query()->where('user_id', $candidat->id)->count());
    }

    public function test_la_fiche_de_l_agence_du_bien_se_rattache_sur_une_coordonnee_verifiee(): void
    {
        $fiche = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => null, 'phone' => '77 123 45 67']);
        $candidat = $this->candidat(['phone_verified_at' => now()]);

        $reservation = $this->postuler($candidat);

        $this->assertSame($fiche->id, $reservation->customer_id);
        $this->assertSame($candidat->id, $fiche->refresh()->user_id);
        $this->assertSame(1, Customer::query()->where('agency_id', $this->agence->id)->count());
    }

    public function test_sans_coordonnee_verifiee_aucune_fiche_de_l_agence_n_est_rattachee(): void
    {
        $fiche = Customer::factory()->create([
            'agency_id' => $this->agence->id, 'user_id' => null, 'phone' => '77 123 45 67', 'email' => 'awa@example.test',
        ]);
        $candidat = $this->candidat();

        $reservation = $this->postuler($candidat);

        $this->assertNull($fiche->refresh()->user_id);
        $this->assertNotSame($fiche->id, $reservation->customer_id);
        $this->assertSame($this->agence->id, $reservation->customer->agency_id);
    }

    /** Témoin : un bien sans agence ne change pas, la fiche suit l'agence du compte comme avant. */
    public function test_temoin_un_bien_sans_agence_ne_change_pas(): void
    {
        $candidat = $this->candidat();
        $sansAgence = $this->bienAuMois(null);

        $reservation = $this->postuler($candidat, $sansAgence);

        $this->assertNull($reservation->customer->agency_id);
        $this->assertSame($candidat->id, $reservation->customer->user_id);
    }
}
