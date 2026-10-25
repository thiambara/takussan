<?php

namespace Tests\Feature\Console;

use App\Models\Activity;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Actions\CleanActivityLogAction;
use Tests\TestCase;

/**
 * TCK-2342 (P19.04) — décision du porteur : durées par famille de journaux, 12 mois par défaut ;
 * 5 ans pour `PersonalDataAccess`, `Privacy`, `Security`, `UserSupport`, `KYC`, `KycDossier`,
 * `Account`, `Membership`, `AgencyRole`, `Integration` et `export` ; 10 ans pour les pièces
 * comptables (`LeasePayment`, `BookingPayment`, `Invoice`, `Payout`, `PlatformPayout`,
 * `CommissionEntry`, `Billing`) ; un test par famille.
 *
 * Les listes sont écrites ici en toutes lettres, et non lues dans la commande : un nom retiré de la
 * commande fait rougir son cas.
 */
class PruneActivityLogCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-10-25 12:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @return array<string, array{0: string|null}> */
    public static function familleParDefaut(): array
    {
        return [
            'default' => ['default'],
            'Lease' => ['Lease'],
            'Property' => ['Property'],
            'sans log_name' => [null],
        ];
    }

    #[DataProvider('familleParDefaut')]
    public function test_famille_par_defaut_purgee_a_douze_mois(?string $logName): void
    {
        $echue = $this->ligne($logName, now()->subMonths(12)->subDay());
        $vivante = $this->ligne($logName, now()->subMonths(11));

        $this->artisan('audit:prune-activity-log')->assertSuccessful();

        $this->assertManquante($echue);
        $this->assertPresente($vivante);
    }

    /** @return array<string, array{0: string}> */
    public static function famillePreuve(): array
    {
        return array_combine(
            $noms = ['PersonalDataAccess', 'Privacy', 'Security', 'UserSupport', 'KYC', 'KycDossier', 'Account', 'Membership', 'AgencyRole', 'Integration', 'export'],
            array_map(fn (string $nom) => [$nom], $noms),
        );
    }

    #[DataProvider('famillePreuve')]
    public function test_famille_de_preuve_conservee_cinq_ans(string $logName): void
    {
        $quatreCentsJours = $this->ligne($logName, now()->subDays(400));
        $presqueCinqAns = $this->ligne($logName, now()->subYears(5)->addDay());
        $cinqAnsEtUnJour = $this->ligne($logName, now()->subYears(5)->subDay());

        $this->artisan('audit:prune-activity-log')->assertSuccessful();

        $this->assertPresente($quatreCentsJours);
        $this->assertPresente($presqueCinqAns);
        $this->assertManquante($cinqAnsEtUnJour);
    }

    /** @return array<string, array{0: string}> */
    public static function famillePiecesComptables(): array
    {
        return array_combine(
            $noms = ['LeasePayment', 'BookingPayment', 'Invoice', 'Payout', 'PlatformPayout', 'CommissionEntry', 'Billing'],
            array_map(fn (string $nom) => [$nom], $noms),
        );
    }

    #[DataProvider('famillePiecesComptables')]
    public function test_famille_des_pieces_comptables_conservee_dix_ans(string $logName): void
    {
        $cinqAnsEtUnJour = $this->ligne($logName, now()->subYears(5)->subDay());
        $presqueDixAns = $this->ligne($logName, now()->subYears(10)->addDay());
        $dixAnsEtUnJour = $this->ligne($logName, now()->subYears(10)->subDay());

        $this->artisan('audit:prune-activity-log')->assertSuccessful();

        $this->assertPresente($cinqAnsEtUnJour);
        $this->assertPresente($presqueDixAns);
        $this->assertManquante($dixAnsEtUnJour);
    }

    public function test_la_purge_passe_par_lots_et_une_seconde_execution_ne_supprime_rien(): void
    {
        $echues = array_map(fn () => $this->ligne('default', now()->subYears(2)), range(1, 5));
        $vivante = $this->ligne('default', now()->subMonth());

        $this->artisan('audit:prune-activity-log', ['--batch' => 2])
            ->expectsOutputToContain('lignes supprimées : 5')
            ->assertSuccessful();

        foreach ($echues as $id) {
            $this->assertManquante($id);
        }
        $this->assertPresente($vivante);

        $this->artisan('audit:prune-activity-log')
            ->expectsOutputToContain('lignes supprimées : 0')
            ->assertSuccessful();
        $this->assertPresente($vivante);
    }

    public function test_la_purge_est_planifiee_chaque_jour_sans_chevauchement(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->command, 'audit:prune-activity-log'));

        $this->assertNotNull($event, 'audit:prune-activity-log doit être planifiée.');
        $this->assertSame('10 4 * * *', $event->expression);
        $this->assertSame('Africa/Dakar', $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
    }

    /**
     * `activitylog:clean` du paquet reste enregistrée et ne sait rien exclure : lancée à la main sans
     * `--days`, elle purge à `activitylog.clean_after_days`, fixé à la plus longue durée de la purge
     * par famille (10 ans) pour ne jamais effacer une pièce comptable qu'on doit garder.
     */
    public function test_activitylog_clean_lancee_a_la_main_n_efface_pas_une_piece_comptable_de_deux_ans(): void
    {
        $piece = $this->ligne('LeasePayment', now()->subYears(2));
        $preuve = $this->ligne('PersonalDataAccess', now()->subYears(2));

        $this->artisan('activitylog:clean')->assertSuccessful();

        $this->assertPresente($piece);
        $this->assertPresente($preuve);
        $this->assertSame(3653, config('activitylog.clean_after_days'));
    }

    public function test_la_configuration_du_journal_garde_ses_autres_cles(): void
    {
        $this->assertSame(Activity::class, config('activitylog.activity_model'));
        $this->assertSame('default', config('activitylog.default_log_name'));
        $this->assertTrue((bool) config('activitylog.enabled'));
        $this->assertSame(CleanActivityLogAction::class, config('activitylog.actions.clean_log'));
    }

    private function ligne(?string $logName, \DateTimeInterface $at): int
    {
        return (int) DB::table('activity_log')->insertGetId([
            'log_name' => $logName,
            'description' => 'tck-2342',
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }

    private function assertPresente(int $id): void
    {
        $this->assertTrue(DB::table('activity_log')->where('id', $id)->exists(), "La ligne {$id} doit rester.");
    }

    private function assertManquante(int $id): void
    {
        $this->assertFalse(DB::table('activity_log')->where('id', $id)->exists(), "La ligne {$id} doit disparaître.");
    }
}
