<?php

namespace Tests\Feature\Console;

use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\PayoutMethod;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * P42.03 (TCK-882) — `backup:verify-encryption` juge une restauration à ce qu'elle se lit : une
 * copie dont les comptes de lignes sont justes mais que la clé de l'application ne déchiffre pas
 * est une restauration ratée (ADR-0044).
 */
class BackupVerifyEncryptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_valeurs_chiffrees_se_dechiffrent_avec_la_cle_de_l_application(): void
    {
        PayoutMethod::factory()->count(2)->create();

        $this->artisan('backup:verify-encryption')
            ->expectsOutputToContain('payout_methods.account_identifier : 2 lue(s), 0 illisible(s)')
            ->expectsOutputToContain('toutes se déchiffrent')
            ->assertExitCode(0);
    }

    /** TCK-953 (ADR-0070 § 9) — la pièce du client entre dans la vérification par son cast `encrypted`. */
    public function test_la_piece_du_client_est_verifiee(): void
    {
        Customer::factory()->create(['id_number' => 'SN-998877']);
        Customer::factory()->create(['id_number' => null]);

        $this->artisan('backup:verify-encryption')
            ->expectsOutputToContain('customers.id_number : 1 lue(s), 0 illisible(s)')
            ->assertExitCode(0);
    }

    /** TCK-954 (ADR-0070 § 9) — la pièce et le revenu de la caution entrent par leur cast `encrypted`. */
    public function test_la_piece_et_le_revenu_de_la_caution_sont_verifies(): void
    {
        Guarantor::factory()->create(['id_number' => 'CNI-445566', 'monthly_income' => '800000.00']);

        $this->artisan('backup:verify-encryption')
            ->expectsOutputToContain('guarantors.id_number : 1 lue(s), 0 illisible(s)')
            ->expectsOutputToContain('guarantors.monthly_income : 1 lue(s), 0 illisible(s)')
            ->assertExitCode(0);
    }

    /**
     * TCK-956 (ADR-0070 § 9) — le revenu du bailleur entre par son cast `encrypted`. Avec la pièce
     * du client et la pièce et le revenu de la caution, les quatre colonnes d'ADR-0070 sont
     * vérifiées.
     */
    public function test_les_quatre_colonnes_d_adr_0070_sont_verifiees(): void
    {
        OwnerProfile::factory()->create(['monthly_income' => '350000.00']);
        Customer::factory()->create(['id_number' => 'SN-998877']);
        Guarantor::factory()->create(['id_number' => 'CNI-445566', 'monthly_income' => '800000.00']);

        $this->artisan('backup:verify-encryption')
            ->expectsOutputToContain('owner_profiles.monthly_income : 1 lue(s), 0 illisible(s)')
            ->expectsOutputToContain('customers.id_number : 1 lue(s), 0 illisible(s)')
            ->expectsOutputToContain('guarantors.id_number : 1 lue(s), 0 illisible(s)')
            ->expectsOutputToContain('guarantors.monthly_income : 1 lue(s), 0 illisible(s)')
            ->assertExitCode(0);
    }

    public function test_une_cle_fausse_rend_les_valeurs_illisibles(): void
    {
        PayoutMethod::factory()->count(2)->create();

        $this->artisan('backup:verify-encryption', ['--cle-fausse' => true])
            ->expectsOutputToContain('payout_methods.account_identifier : 2 lue(s), 2 illisible(s)')
            ->assertExitCode(1);
    }

    public function test_une_valeur_abimee_est_comptee_illisible(): void
    {
        $methode = PayoutMethod::factory()->create();
        DB::table('payout_methods')->where('id', $methode->id)->update(['account_holder_name' => 'pas-un-chiffre']);

        $this->artisan('backup:verify-encryption')
            ->expectsOutputToContain('payout_methods.account_holder_name : 1 lue(s), 1 illisible(s)')
            ->assertExitCode(1);
    }

    public function test_une_base_sans_valeur_chiffree_ne_conclut_pas(): void
    {
        $this->artisan('backup:verify-encryption')
            ->expectsOutputToContain("rien n'a été vérifié")
            ->assertExitCode(2);
    }
}
