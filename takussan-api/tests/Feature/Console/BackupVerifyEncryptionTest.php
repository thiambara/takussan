<?php

namespace Tests\Feature\Console;

use App\Models\PayoutMethod;
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
