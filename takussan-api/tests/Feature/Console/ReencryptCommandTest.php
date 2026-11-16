<?php

namespace Tests\Feature\Console;

use App\Models\PayoutMethod;
use App\Support\Security\ColonnesChiffrees;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Support\ModelesChiffres\FicheChiffree;
use Tests\Support\RotationDAppKey;
use Tests\TestCase;

/**
 * TCK-614 (ADR-0084, amendement du 2026-11-16) — `security:reencrypt` : après une rotation d'`APP_KEY`, chaque valeur
 * chiffrée se relit SANS `APP_PREVIOUS_KEYS` (AC4) ; un modèle neuf y entre par ses casts (AC5) ; une valeur
 * indéchiffrable fait échouer la commande, se nomme sans sa valeur, et laisse son lot intact (AC6).
 */
class ReencryptCommandTest extends TestCase
{
    use RefreshDatabase;
    use RotationDAppKey;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('tck614_fiches_chiffrees', function ($table): void {
            $table->id();
            $table->text('secret')->nullable();
            $table->text('details')->nullable();
            $table->string('libelle')->nullable();
        });
        $this->app->instance(ColonnesChiffrees::class, new ColonnesChiffrees([
            app_path('Models') => 'App\\Models\\',
            base_path('tests/Support/ModelesChiffres') => 'Tests\\Support\\ModelesChiffres\\',
        ]));
    }

    /** L'ancienne clé retirée, comme le fera l'exploitant après la commande. */
    private function retirerLesAnciennesCles(): void
    {
        config(['app.previous_keys' => []]);
        $this->app->forgetInstance('encrypter');
        Crypt::clearResolvedInstance('encrypter');
    }

    public function test_ac4_apres_la_commande_tout_se_relit_sans_les_anciennes_cles(): void
    {
        $methode = PayoutMethod::factory()->create(['account_identifier' => '+221771234567']);
        $fiche = FicheChiffree::query()->create(['secret' => 'pièce 42', 'details' => ['iban' => 'SN08…34'], 'libelle' => 'clair']);
        $this->tournerAppKey();

        $this->artisan('security:reencrypt')->expectsOutputToContain('FicheChiffree : 2 valeur(s) lue(s), 0 déjà sous la clé courante, 2 ré-chiffrée(s), 0 illisible(s)')
            ->assertExitCode(0);
        $this->retirerLesAnciennesCles();

        $this->assertSame('+221771234567', $methode->fresh()->account_identifier);
        $this->assertSame('pièce 42', $fiche->fresh()->secret);
        $this->assertSame('SN08…34', $fiche->fresh()->details['iban']);
        $this->assertSame('clair', $fiche->fresh()->libelle, 'une colonne sans cast chiffré n\'est pas touchée');
    }

    public function test_ac4_sans_la_commande_le_retrait_rend_les_valeurs_illisibles(): void
    {
        $fiche = FicheChiffree::query()->create(['secret' => 'pièce 42']);
        $this->tournerAppKey();
        $this->retirerLesAnciennesCles();

        $this->expectException(DecryptException::class);
        $fiche->fresh()->secret;
    }

    public function test_ac4_a_blanc_rien_n_est_ecrit_et_tout_est_compte(): void
    {
        $fiche = FicheChiffree::query()->create(['secret' => 'pièce 42']);
        $brut = DB::table('tck614_fiches_chiffrees')->value('secret');
        $this->tournerAppKey();

        $this->artisan('security:reencrypt', ['--dry-run' => true])
            ->expectsOutputToContain('FicheChiffree : 1 valeur(s) lue(s), 0 déjà sous la clé courante, 1 à ré-chiffrer, 0 illisible(s)')
            ->assertExitCode(0);

        $this->assertSame($brut, DB::table('tck614_fiches_chiffrees')->where('id', $fiche->id)->value('secret'));
    }

    public function test_ac4_une_seconde_execution_n_ecrit_rien(): void
    {
        FicheChiffree::query()->create(['secret' => 'pièce 42', 'details' => ['a' => 1]]);
        $this->tournerAppKey();
        $this->artisan('security:reencrypt')->assertExitCode(0);
        $apres = DB::table('tck614_fiches_chiffrees')->first();

        $this->artisan('security:reencrypt')
            ->expectsOutputToContain('FicheChiffree : 2 valeur(s) lue(s), 2 déjà sous la clé courante, 0 ré-chiffrée(s), 0 illisible(s)')
            ->assertExitCode(0);

        $this->assertEquals($apres, DB::table('tck614_fiches_chiffrees')->first());
    }

    public function test_elle_refuse_de_tourner_sans_ancienne_cle(): void
    {
        config(['app.previous_keys' => []]);
        $this->app->forgetInstance('encrypter');

        $this->artisan('security:reencrypt')->expectsOutputToContain('APP_PREVIOUS_KEYS est vide')->assertExitCode(1);
    }

    /** AC5 — la liste se dérive des casts : `encrypted` et `AsEncrypted…`, dans un modèle que la commande ne nomme pas. */
    public function test_ac5_un_modele_neuf_entre_par_ses_casts(): void
    {
        $modeles = app(ColonnesChiffrees::class)->parModele();

        $this->assertSame(['details', 'secret'], $modeles[FicheChiffree::class]);
        $this->assertContains('account_identifier', $modeles[PayoutMethod::class]);
    }

    public function test_ac5_model_restreint_la_commande(): void
    {
        PayoutMethod::factory()->create();
        FicheChiffree::query()->create(['secret' => 's']);
        $this->tournerAppKey();

        $this->artisan('security:reencrypt', ['--model' => ['FicheChiffree']])
            ->expectsOutputToContain('FicheChiffree :')
            ->doesntExpectOutputToContain('PayoutMethod :')
            ->assertExitCode(0);
    }

    public function test_ac6_une_valeur_indechiffrable_nomme_la_ligne_et_laisse_son_lot_intact(): void
    {
        $saine = FicheChiffree::query()->create(['secret' => 'saine']);
        $abimee = FicheChiffree::query()->create(['secret' => 'valeur-secrete']);
        $this->tournerAppKey();
        DB::table('tck614_fiches_chiffrees')->where('id', $abimee->id)->update(['secret' => Crypt::encryptString('x').'abîmée']);
        $brutSaine = DB::table('tck614_fiches_chiffrees')->where('id', $saine->id)->value('secret');

        $this->artisan('security:reencrypt')
            ->expectsOutputToContain("Illisible : FicheChiffree #{$abimee->id}, colonne secret.")
            ->doesntExpectOutputToContain('valeur-secrete')
            ->assertExitCode(1);

        $this->assertSame($brutSaine, DB::table('tck614_fiches_chiffrees')->where('id', $saine->id)->value('secret'), 'aucune ligne du lot réécrite');
    }
}
