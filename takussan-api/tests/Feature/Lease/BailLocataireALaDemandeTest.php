<?php

namespace Tests\Feature\Lease;

use App\Models\Customer;
use App\Models\Enums\IdType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2780 — `GET /api/leases/{id}` ne rend le locataire que sous `include=tenant`, et sous
 * `fields[customers]` seulement `id` et les clés demandées. Avant, `show` chargeait `tenant` d'office
 * et rendait `CustomerResource` entier (téléphone, e-mail…) à tout lecteur du bail, `include` ou non.
 *
 * Les quatre lecteurs de `LeasePolicy::view` : le bailleur du bien (ici SUSPENDU, qui garde la
 * lecture), le personnel de l'agence, le locataire du bail et le super-admin. Le locataire compte
 * double : `LeasePolicy::view` lit `$lease->tenant` pour le reconnaître, ce qui charge la relation
 * avant le rendu — un `show` qui se fierait à `whenLoaded('tenant')` la rendrait sans `include`.
 */
class BailLocataireALaDemandeTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Lease $lease;

    private Customer $tenant;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();

        $this->tenant = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'added_by_id' => $this->agent->id,
            'user_id' => $this->client->id,
            'first_name' => 'Awa',
            'last_name' => 'NDIAYE',
            'email' => 'awa.ndiaye@example.test',
            'phone' => '+221771234567',
            'id_type' => IdType::IdCard,
            'emergency_contact_name' => 'Fatou Sow',
        ]);
        $this->lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id,
            'status' => LeaseStatus::Active,
        ]);

        // Le bailleur du bien, suspendu dans l'agence : il garde la lecture de son bail.
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => OwnerProfileStatus::Blocked->value]);

        $this->superAdmin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($this->superAdmin, 'super_admin');
    }

    /** @return array<string, User> */
    private function lecteurs(): array
    {
        return [
            'bailleur suspendu' => $this->landlord->fresh(),
            'personnel' => $this->agent->fresh(),
            'locataire' => $this->client->fresh(),
            'super-admin' => $this->superAdmin->fresh(),
        ];
    }

    private function lire(User $lecteur, string $requete): TestResponse
    {
        $this->app['auth']->forgetGuards();
        $this->actingAs($lecteur, 'sanctum');

        return $this->getJson("/api/leases/{$this->lease->id}{$requete}")->assertOk();
    }

    /** AC1 — sans `include=tenant`, la clé `tenant` est absente, pour chacun des quatre lecteurs. */
    public function test_sans_include_la_cle_tenant_est_absente(): void
    {
        foreach ($this->lecteurs() as $qui => $lecteur) {
            foreach (['', '?include=property', '?include=property,landlord,agent'] as $requete) {
                $data = $this->lire($lecteur, $requete)->json('data');
                $this->assertSame($this->lease->id, $data['id'], "{$qui} {$requete}");
                $this->assertArrayNotHasKey('tenant', $data, "{$qui} {$requete}");
                $this->assertStringNotContainsString('+221771234567', json_encode($data), "{$qui} {$requete}");
                $this->assertStringNotContainsString('awa.ndiaye@example.test', json_encode($data), "{$qui} {$requete}");
            }
        }
    }

    /** AC2 — `fields[customers]` borne le bloc à `id` et aux clés demandées : ni téléphone ni e-mail. */
    public function test_les_champs_demandes_bornent_le_bloc(): void
    {
        foreach ($this->lecteurs() as $qui => $lecteur) {
            $bloc = $this->lire($lecteur, '?include=tenant&fields[customers]=id,first_name,last_name')->json('data.tenant');
            $this->assertArrayNotHasKey('phone', $bloc, $qui);
            $this->assertArrayNotHasKey('email', $bloc, $qui);
            $this->assertSame(['id' => $this->tenant->id, 'first_name' => 'Awa', 'last_name' => 'NDIAYE'], $bloc, $qui);

            // `id` est toujours rendu, demandé ou non.
            $this->assertSame(['id' => $this->tenant->id, 'first_name' => 'Awa'], $this->lire($lecteur, '?include=tenant&fields[customers]=first_name')->json('data.tenant'), $qui);
        }
    }

    /**
     * AC4 — la requête exacte de « Démarrer » (`useContexteDuBail`) : ni le téléphone ni l'e-mail du locataire
     * NULLE PART dans la réponse, signature du locataire comprise (son compte porte les mêmes coordonnées).
     */
    public function test_la_requete_de_demarrer_ne_porte_aucune_coordonnee_du_locataire(): void
    {
        $this->client->forceFill(['email' => 'awa.ndiaye@example.test', 'phone' => '+221771234567'])->save();
        LeaseSignature::query()->create([
            'lease_id' => $this->lease->id, 'role' => LeaseSignature::ROLE_TENANT, 'method' => LeaseSignature::METHOD_OTP,
            'user_id' => $this->client->id, 'document_sha256' => str_repeat('a', 64), 'signed_at' => now(),
            'otp_channel' => 'sms', 'otp_destination' => '+221771234567',
        ]);

        foreach ($this->lecteurs() as $qui => $lecteur) {
            $data = $this->lire($lecteur, '?include=tenant,property&fields[customers]=id,first_name,last_name')->json('data');
            $this->assertSame(['id' => $this->tenant->id, 'first_name' => 'Awa', 'last_name' => 'NDIAYE'], $data['tenant'], $qui);
            $this->assertCount(1, $data['signatures'], $qui);
            $json = json_encode($data);
            $this->assertStringNotContainsString('771234567', $json, $qui);
            $this->assertStringNotContainsString('awa.ndiaye@example.test', $json, $qui);
        }
    }

    /**
     * Aucune clé demandée n'ouvre un droit : `CustomerResource` juge ses gardes sur la fiche complète.
     * Le bailleur, à qui la fiche est refusée, ne reçoit ni la pièce ni le contact d'urgence ; le
     * personnel, qui lit la fiche, les reçoit.
     */
    public function test_une_cle_demandee_n_ouvre_aucun_droit(): void
    {
        $requete = '?include=tenant&fields[customers]=id,id_type,emergency_contact_name,budget_max,phone';

        $bailleur = $this->lire($this->landlord->fresh(), $requete)->json('data.tenant');
        $this->assertSame(['id' => $this->tenant->id, 'phone' => '+221771234567'], $bailleur);

        $personnel = $this->lire($this->agent->fresh(), $requete)->json('data.tenant');
        $this->assertSame('id_card', $personnel['id_type']);
        $this->assertSame('Fatou Sow', $personnel['emergency_contact_name']);
        $this->assertArrayNotHasKey('email', $personnel);
    }

    /** Un `fields[customers]` reçu en liste vaut absent (ADR-0075) : le bloc entier, pas une 500. */
    public function test_des_champs_en_liste_valent_absents(): void
    {
        $bloc = $this->lire($this->agent->fresh(), '?include=tenant&fields[customers][]=first_name')->json('data.tenant');
        $this->assertSame('+221771234567', $bloc['phone']);
    }

    /**
     * AC3 — `include=tenant` sans `fields` rend le bloc d'avant, à l'instantané : les clés relevées sur
     * l'arbre d'avant TCK-2780 (le 2026-11-14), et les mêmes valeurs que le bloc de la liste
     * (`GET /api/leases?include=tenant`, que ce ticket ne touche pas).
     */
    public function test_sans_fields_le_bloc_est_celui_d_avant(): void
    {
        $communes = ['id', 'first_name', 'last_name', 'email', 'phone', 'occupation', 'status', 'pipeline_stage', 'locale', 'agency_id', 'user_id', 'added_by_id', 'last_contacted_at', 'created_at', 'updated_at'];
        $attendues = [
            'bailleur suspendu' => $communes,
            'personnel' => self::CLES_DU_PERSONNEL,
            'locataire' => $communes,
            'super-admin' => self::CLES_DU_PERSONNEL,
        ];

        foreach ($this->lecteurs() as $qui => $lecteur) {
            $bloc = $this->lire($lecteur, '?include=tenant')->json('data.tenant');
            $this->assertSame($attendues[$qui], array_keys($bloc), $qui);
            $this->assertSame('+221771234567', $bloc['phone'], $qui);
            $this->assertSame('awa.ndiaye@example.test', $bloc['email'], $qui);

            $this->app['auth']->forgetGuards();
            $this->actingAs($lecteur, 'sanctum');
            $ligne = collect($this->getJson('/api/leases?include=tenant')->assertOk()->json('data'))->firstWhere('id', $this->lease->id);
            $this->assertEquals($ligne['tenant'], $bloc, $qui);
        }
    }

    private const CLES_DU_PERSONNEL = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'id_type', 'id_number_masked', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage', 'locale', 'agency_id',
        'user_id', 'added_by_id', 'metadata', 'notes', 'seeking_contract_type', 'budget_min', 'budget_max',
        'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms', 'seeking_deduced_at', 'last_contacted_at',
        'created_at', 'updated_at',
    ];
}
