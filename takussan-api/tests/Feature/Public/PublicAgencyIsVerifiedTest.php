<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1079 (P85.06) — la fiche publique d'agence sert `is_verified`, comme l'annuaire.
 *
 * L'annuaire et la carte d'agence de la fiche bien montraient le badge vérifié ; la fiche
 * elle-même ne recevait pas la clé. Les deux valeurs sont éprouvées : une clé figée à `true` ou à
 * `false` rougit.
 */
class PublicAgencyIsVerifiedTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_fiche_sert_l_etat_verifie_de_l_agence(): void
    {
        foreach (['agence-verifiee' => true, 'agence-non-verifiee' => false] as $slug => $verifiee) {
            $agence = Agency::factory()->create([
                'slug' => $slug,
                'status' => AgencyStatus::Active,
                'is_verified' => $verifiee,
            ]);
            Property::factory()->published()->create(['agency_id' => $agence->id]);

            $this->getJson('/api/public/agencies/'.$slug)
                ->assertOk()
                ->assertJsonPath('data.is_verified', $verifiee);
        }
    }
}
