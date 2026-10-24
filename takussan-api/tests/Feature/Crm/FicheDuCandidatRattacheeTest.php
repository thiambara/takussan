<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P158.01 (TCK-1710) — la candidature d'un compte qui a un profil dans l'agence ne crée plus une
 * seconde fiche du même client dans son CRM.
 *
 * `CustomerService::findOrCreateFromUser()` ne cherchait une fiche que par `user_id`, puis en créait
 * une dans l'agence du compte. Recommandation du délégué, retenue par le porteur : la fiche de cette
 * agence au même téléphone ou au même e-mail se rattache au compte, si elle n'a pas encore de compte
 * et si la correspondance porte sur un téléphone ou un e-mail VÉRIFIÉS du compte ; sinon la fiche
 * se crée comme avant.
 */
class FicheDuCandidatRattacheeTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'price' => 50_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
    }

    /** @param  array<string, mixed>  $attributes */
    private function candidat(array $attributes): User
    {
        return User::factory()->withOwnerProfile($this->agency)->create($attributes + [
            'phone' => '+221771234567',
            'email' => 'awa@example.test',
        ]);
    }

    private function fiche(array $attributes = []): Customer
    {
        return Customer::factory()->create($attributes + [
            'agency_id' => $this->agency->id,
            'user_id' => null,
            'phone' => '77 123 45 67',
            'email' => 'AWA@example.test',
        ]);
    }

    private function postuler(User $user): void
    {
        Sanctum::actingAs($user);

        $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'guests' => 1,
        ])->assertCreated();
    }

    public function test_la_fiche_de_l_agence_au_telephone_verifie_se_rattache_au_compte(): void
    {
        $fiche = $this->fiche();
        $user = $this->candidat(['phone_verified_at' => now(), 'email_verified_at' => null]);

        $this->postuler($user);

        $this->assertSame(1, Customer::query()->where('agency_id', $this->agency->id)->count());
        $this->assertSame($user->id, $fiche->refresh()->user_id);
    }

    public function test_la_fiche_de_l_agence_a_l_e_mail_verifie_se_rattache_au_compte(): void
    {
        $fiche = $this->fiche(['phone' => '77 000 00 00']);
        $user = $this->candidat(['phone_verified_at' => null, 'email_verified_at' => now()]);

        $this->postuler($user);

        $this->assertSame(1, Customer::query()->where('agency_id', $this->agency->id)->count());
        $this->assertSame($user->id, $fiche->refresh()->user_id);
    }

    public function test_sans_coordonnee_verifiee_la_fiche_se_cree_comme_avant(): void
    {
        $fiche = $this->fiche();
        $user = $this->candidat(['phone_verified_at' => null, 'email_verified_at' => null]);

        $this->postuler($user);

        $this->assertNull($fiche->refresh()->user_id);
        $this->assertSame(1, Customer::query()->where('user_id', $user->id)->count());
    }

    public function test_une_fiche_deja_liee_a_un_autre_compte_ne_se_rattache_pas(): void
    {
        $autre = User::factory()->create();
        $fiche = $this->fiche(['user_id' => $autre->id]);
        $user = $this->candidat(['phone_verified_at' => now(), 'email_verified_at' => now()]);

        $this->postuler($user);

        $this->assertSame($autre->id, $fiche->refresh()->user_id);
        $this->assertSame(1, Customer::query()->where('user_id', $user->id)->count());
    }
}
