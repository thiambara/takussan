<?php

namespace Tests\Feature\Seeders;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\Support\DemoTenantSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-2684, AC8 — un compte de démonstration dont le profil actif est LOCATAIRE.
 *
 * Mesuré le 2026-11-11 sur la base de démo : `customer@agency1.demo.takussan.sn`, le « locataire »
 * des outils de l'audit, porte `["customer"]` — aucun bail —, et la coque de `/app` lui donne le
 * menu d'un CLIENT (« Favoris · Visites »). Les 66 comptes qui ont un bail actif ont des adresses
 * tirées au hasard par le jeu de démo : aucune ne survit à un nouveau semis. L'outil de fidélité
 * a besoin d'une adresse stable, d'où ce seeder ciblé, rejouable sans `migrate:fresh`.
 */
class DemoTenantSeederTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = Agency::factory()->create(['kind' => AgencyKind::Standard]);
    }

    private function bailActifSansCompte(): Lease
    {
        return Lease::factory()->active()->create([
            'agency_id' => $this->agence->id,
            'property_id' => Property::factory()->create(['agency_id' => $this->agence->id])->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => null])->id,
        ]);
    }

    private function email(): string
    {
        return "locataire@agency{$this->agence->id}.demo.takussan.sn";
    }

    public function test_il_rattache_un_compte_stable_a_un_bail_actif_et_le_profil_actif_est_locataire(): void
    {
        $bail = $this->bailActifSansCompte();

        $this->seed(DemoTenantSeeder::class);

        $user = User::where('email', $this->email())->sole();
        $this->assertSame($user->id, $bail->tenant->fresh()->user_id);
        $this->assertTrue($user->hasActiveTenantLease());
        // Aucun profil d'agence : la coque résout `locataire` (`resoudrePersona`, défaut → isTenant).
        $this->assertSame(['customer', 'tenant'], $user->profileTypes()->all());
    }

    public function test_il_est_idempotent(): void
    {
        $this->bailActifSansCompte();
        $this->bailActifSansCompte();

        $this->seed(DemoTenantSeeder::class);
        $premier = User::where('email', $this->email())->sole();
        $this->seed(DemoTenantSeeder::class);

        $this->assertSame(1, User::where('email', $this->email())->count());
        // Le second passage n'adopte pas un deuxième bail.
        $this->assertSame(1, Customer::where('user_id', $premier->id)->count());
    }

    public function test_sans_bail_eligible_il_ne_cree_rien(): void
    {
        $this->seed(DemoTenantSeeder::class);

        $this->assertSame(0, User::where('email', $this->email())->count());
    }

    public function test_un_bail_dont_le_locataire_a_deja_un_compte_n_est_pas_adopte(): void
    {
        $autre = User::factory()->create();
        Lease::factory()->active()->create([
            'agency_id' => $this->agence->id,
            'property_id' => Property::factory()->create(['agency_id' => $this->agence->id])->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => $autre->id])->id,
        ]);

        $this->seed(DemoTenantSeeder::class);

        $this->assertSame(0, User::where('email', $this->email())->count());
    }
}
