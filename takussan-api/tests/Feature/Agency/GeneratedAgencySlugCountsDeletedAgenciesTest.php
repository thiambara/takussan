<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ReadsPhoneCodes;
use Tests\TestCase;

/**
 * TCK-1133 (P92.08) — `agencies.slug` est unique sur TOUTES les lignes, supprimées comprises. Le
 * slug engendré à partir du nom doit donc compter les agences supprimées : sans quoi un nom déjà
 * porté par une agence supprimée rendait 500 (`agencies_slug_unique`) au provisionnement par le
 * super-admin et à l'inscription d'un hôte.
 */
class GeneratedAgencySlugCountsDeletedAgenciesTest extends TestCase
{
    use ReadsPhoneCodes, RefreshDatabase;

    public function test_provisioning_skips_the_slug_of_a_deleted_agency(): void
    {
        Notification::fake();
        Agency::factory()->create(['name' => 'Sunu Gestion', 'slug' => 'sunu-gestion'])->delete();
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/agencies', [
            'agency' => ['name' => 'Sunu Gestion', 'email' => 'contact@sunu.test'],
            'admin' => [
                'first_name' => 'Awa',
                'last_name' => 'Ndiaye',
                'email' => 'admin@sunu.test',
                'language' => 'fr',
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.agency.slug', 'sunu-gestion-2');
    }

    public function test_host_onboarding_skips_the_slug_of_a_deleted_agency(): void
    {
        Agency::factory()->create(['name' => 'Espace de Amine', 'slug' => 'espace-de-amine'])->delete();

        $user = User::factory()->create(['phone' => '+221770000000', 'phone_verified_at' => null]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/host/individual/onboard', [
            'agency' => ['name' => 'Espace de Amine', 'primary_city' => 'Dakar', 'currency' => 'XOF'],
            'phone_otp' => ['phone' => '+221770000000', 'code' => $this->issuePhoneCode($user)],
            'preferences' => ['primary_property_type' => 'apartment'],
            'cgu_accepted' => true,
        ])->assertCreated();

        $this->assertSame(
            'espace-de-amine-2',
            Agency::query()->findOrFail($response->json('data.agency.id'))->slug,
        );
    }
}
