<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P147.07 (TCK-1279) — `POST /api/agencies` ne laisse plus le créateur choisir le statut de son
 * agence : `suspended` est la sanction de la console (motif, `reinstate`), `inactive` l'état de
 * `unverify`. L'agence naît `active`.
 */
class CreationDAgenceSansStatutTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_statut_envoye_est_ignore_et_l_agence_nait_active(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $id = $this->postJson('/api/agencies', ['name' => 'Keur Sanction', 'status' => 'suspended'])
            ->assertCreated()->json('data.id');

        $this->assertSame(AgencyStatus::Active, Agency::query()->findOrFail($id)->status);
    }
}
