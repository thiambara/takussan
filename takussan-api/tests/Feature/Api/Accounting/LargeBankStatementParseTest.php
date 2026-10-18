<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-932 (P43.01) — un gros relevé ne tue plus le job, et un job mort ne laisse plus le relevé
 * `processing`.
 *
 * Mesuré avant correctif : un CSV de 10 Mo, accepté par la validation, culminait à 720-781 Mo
 * dans la boucle du job (toutes les lignes et toutes les dates accumulées avant l'insertion), et
 * mourait en erreur fatale sous les 256 Mo de `docker/php.ini`. Une erreur fatale n'exécute pas
 * le `catch` : le relevé restait `processing`, et le ré-import du même fichier était refusé.
 */
class LargeBankStatementParseTest extends ApiTestCase
{
    use RefreshDatabase;

    private const LIGNES = 30_000;

    /** Le surcroît de mémoire toléré pour l'analyse entière, quelle que soit la taille du relevé. */
    private const PLAFOND_OCTETS = 48 * 1024 * 1024;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        RemoteDiskFake::install('r2-private');

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    public function test_un_releve_de_trente_mille_lignes_s_analyse_sans_tout_garder_en_memoire(): void
    {
        $statement = $this->uploadQueued($this->csv(self::LIGNES));

        gc_collect_cycles();
        $avant = memory_get_usage();
        memory_reset_peak_usage();

        app()->call([new ParseBankStatementJob($statement->id), 'handle']);

        $surcroit = memory_get_peak_usage() - $avant;

        $statement->refresh();
        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->status);
        $this->assertSame(self::LIGNES, $statement->lines_count);
        $this->assertSame(self::LIGNES, $statement->lines()->count());
        $this->assertSame('2026-01-01', $statement->period_start->toDateString());
        $this->assertSame('2026-01-28', $statement->period_end->toDateString());
        Queue::assertPushed(MatchBankStatementJob::class);

        $this->assertLessThan(
            self::PLAFOND_OCTETS,
            $surcroit,
            sprintf('L\'analyse de %d lignes a pris %.1f Mo : les lignes sont accumulées avant l\'insertion.', self::LIGNES, $surcroit / 1048576),
        );
    }

    public function test_failed_passe_en_failed_un_releve_encore_processing_et_le_reimport_passe(): void
    {
        // Ce que fait le worker quand le processus est mort (erreur fatale, délai) : le job est
        // marqué en échec sans que `handle()` ait atteint son `catch`, et seul `failed()` court.
        $csv = $this->csv(3);
        $statement = $this->uploadQueued($csv);
        $this->assertSame(BankStatementStatus::Processing, $statement->status);

        (new ParseBankStatementJob($statement->id))->failed(new \RuntimeException('Allowed memory size exhausted'));

        $this->assertSame(BankStatementStatus::Failed, $statement->refresh()->status);

        // Le même fichier se dépose de nouveau : le relevé `failed` est remplacé.
        $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('statement.csv', $csv),
                'source_format' => 'csv',
            ])
            ->assertStatus(202);

        $this->assertNull(BankStatement::find($statement->id));
    }

    public function test_failed_ne_touche_pas_un_releve_deja_lu(): void
    {
        $statement = $this->uploadQueued($this->csv(3));
        app()->call([new ParseBankStatementJob($statement->id), 'handle']);
        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->refresh()->status);

        (new ParseBankStatementJob($statement->id))->failed(new \RuntimeException('après la validation'));

        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->refresh()->status);
        $this->assertSame(3, $statement->lines()->count());
    }

    public function test_failed_sur_un_releve_supprime_ne_leve_pas(): void
    {
        (new ParseBankStatementJob(PHP_INT_MAX))->failed(null);

        $this->assertSame(0, BankStatement::query()->count());
    }

    private function csv(int $lignes): string
    {
        $csv = "date,amount,label,reference,counterparty\n";
        for ($i = 1; $i <= $lignes; $i++) {
            $csv .= sprintf("%02d/01/2026,%d,Loyer ligne %d,REF-%d,Client %d\n", ($i % 28) + 1, 1000 + $i, $i, $i, $i);
        }

        return $csv;
    }

    private function uploadQueued(string $content): BankStatement
    {
        Queue::fake();

        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('statement.csv', $content),
                'source_format' => 'csv',
                'bank_name' => 'BIS',
            ]);

        $response->assertStatus(202);

        return BankStatement::findOrFail($response->json('data.id'));
    }
}
