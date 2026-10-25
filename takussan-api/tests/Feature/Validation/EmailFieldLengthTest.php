<?php

namespace Tests\Feature\Validation;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1110 (P91.05) — la règle `email` de Laravel ne borne pas la longueur, et les colonnes
 * d'adresse sont des `varchar(255)`. Chaque voie qui écrit une adresse la borne à la colonne :
 * au-delà, 422 sur la clé, et non le 500 de PostgreSQL (22001). À la borne, l'écriture passe.
 */
class EmailFieldLengthTest extends ApiTestCase
{
    use RefreshDatabase;

    /** Une adresse valide de la longueur voulue : domaine en étiquettes de 60, partie locale ≤ 64. */
    private static function adresse(int $longueur): string
    {
        $domaine = 'sn';
        while (strlen($domaine) < $longueur - 1 - 61) {
            $domaine = str_repeat('d', 60).'.'.$domaine;
        }

        return str_repeat('a', $longueur - 1 - strlen($domaine)).'@'.$domaine;
    }

    public function test_l_adresse_temoin_a_la_longueur_voulue(): void
    {
        $this->assertSame(256, strlen(self::adresse(256)));
        $this->assertSame(255, strlen(self::adresse(255)));
    }

    public function test_inscription(): void
    {
        $corps = fn (string $email) => [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => $email,
            'password' => 'Motdepasse-Solide-2026',
            'password_confirmation' => 'Motdepasse-Solide-2026',
        ];

        $this->postJson('/api/auth/register', $corps(self::adresse(256)))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertSame(0, User::query()->count());

        $this->postJson('/api/auth/register', $corps(self::adresse(255)))->assertCreated();
    }

    public function test_fiche_client(): void
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, 'agent', Agency::factory()->create());
        Sanctum::actingAs($user);

        $this->postJson('/api/customers', ['first_name' => 'Awa', 'last_name' => 'Diop', 'email' => self::adresse(256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertSame(0, Customer::query()->count());

        $id = $this->postJson('/api/customers', ['first_name' => 'Awa', 'last_name' => 'Diop', 'email' => self::adresse(255)])
            ->assertCreated()
            ->json('data.id');

        $this->putJson("/api/customers/{$id}", ['email' => self::adresse(256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->putJson("/api/customers/{$id}", ['email' => self::adresse(255)])->assertOk();
    }

    public function test_garant(): void
    {
        $owner = User::factory()->create();
        Sanctum::actingAs($owner);

        $this->postJson('/api/guarantors', ['first_name' => 'Jean', 'last_name' => 'Dupont', 'email' => self::adresse(256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertSame(0, Guarantor::query()->count());
        $this->postJson('/api/guarantors', ['first_name' => 'Jean', 'last_name' => 'Dupont', 'email' => self::adresse(255)])
            ->assertCreated();

        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        $this->putJson("/api/guarantors/{$guarantor->id}", ['email' => self::adresse(256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->putJson("/api/guarantors/{$guarantor->id}", ['email' => self::adresse(255)])->assertOk();

        $property = Property::factory()->create(['user_id' => $owner->id]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $owner->id]);
        $this->postJson("/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop', 'email' => self::adresse(256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->assertSame(0, $lease->guarantors()->count());
        $this->postJson("/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop', 'email' => self::adresse(255)])
            ->assertCreated();
    }

    /** TCK-2311 (P225.06) — la création par `POST /api/agencies` est retirée : reste la modification. */
    public function test_agence(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['email' => self::adresse(256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
        $this->patchJson("/api/agencies/{$agency->id}", ['email' => self::adresse(255)])->assertOk();
    }

    public function test_demande_de_visite_publique(): void
    {
        $property = Property::factory()->published()->create();
        $corps = fn (string $email) => [
            'scheduled_at' => now()->addDays(2)->setTime(10, 0)->toIso8601String(),
            'visitor_name' => 'Awa Ndiaye',
            'visitor_email' => $email,
            'visitor_phone' => '+221770000000',
        ];

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", $corps(self::adresse(256)))
            ->assertStatus(422)
            ->assertJsonValidationErrors('visitor_email');
        $this->assertSame(0, PropertyVisit::query()->count());

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", $corps(self::adresse(255)))
            ->assertCreated();
    }
}
