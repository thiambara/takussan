<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\AssertionFailedError;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-285 — Le pipeline de rapprochement bancaire, DÉROULÉ POUR DE VRAI.
 *
 * `BankReconciliationTest` couvre les huit surfaces HTTP du rapprochement,
 * mais il ouvre par `Queue::fake()` : `ParseBankStatementJob::handle`,
 * `MatchBankStatementJob::handle` et les cinq méthodes de
 * `ReconciliationMatcher` n'y sont jamais exécutés. Mesuré le 2026-08-15 :
 * 0/52, 0/18 et 0/85 lignes — 155 lignes de logique d'argent qui tournent en
 * production à CHAQUE dépôt de relevé et que rien ne garde.
 *
 * Ce fichier est délibérément SÉPARÉ de `BankReconciliationTest` : y retirer
 * le `Queue::fake()` ferait créer aux jobs des lignes en plus de celles des
 * factories, et casserait ses huit cas actuels.
 *
 * `QUEUE_CONNECTION=sync` est forcé par `phpunit.xml` : ne pas faker la file
 * suffit à exécuter le job en ligne, et le chaînage `Parse → Match` avec.
 *
 * TCK-539 — le relevé vit sur un disque DISTANT simulé nommé comme en production
 * (`r2-private`, {@see RemoteDiskFake}) : le parseur ne reçoit plus `$media->getPath()`, qui y
 * rend un chemin inexistant, mais une copie temporaire supprimée après lecture.
 */
class BankStatementPipelineTest extends ApiTestCase
{
    use RefreshDatabase;

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

    // ─── Parse ───────────────────────────────────────────────────

    public function test_upload_parses_every_line_and_flips_the_statement_to_ready_for_review(): void
    {
        $statement = $this->upload($this->fixture());

        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->status);
        $this->assertSame(10, $statement->lines_count);
        $this->assertSame(10, $statement->lines()->count());

        // Les bornes de période sont dérivées des dates PARSÉES, pas du fichier.
        $this->assertSame('2026-04-01', $statement->period_start->toDateString());
        $this->assertSame('2026-04-20', $statement->period_end->toDateString());
    }

    public function test_a_negative_amount_becomes_a_debit_line_stored_positive(): void
    {
        $statement = $this->upload($this->fixture());

        // « 03/04/2026,-5000,Frais bancaires » — le signe porte la DIRECTION,
        // le montant est stocké en valeur absolue. Une régression qui garde le
        // signe rendrait tous les soldes faux.
        $fees = $statement->lines()->where('label', 'Frais bancaires')->sole();

        $this->assertSame(BankStatementLineDirection::Debit, $fees->direction);
        $this->assertSame('5000.00', (string) $fees->amount);

        $rent = $statement->lines()->where('reference', 'LP-2026-001')->sole();
        $this->assertSame(BankStatementLineDirection::Credit, $rent->direction);
        $this->assertSame('15000.00', (string) $rent->amount);

        // Deux débits dans le fichier, huit crédits.
        $this->assertSame(2, $statement->lines()->where('direction', BankStatementLineDirection::Debit)->count());
        $this->assertSame(8, $statement->lines()->where('direction', BankStatementLineDirection::Credit)->count());
    }

    public function test_reparsing_a_statement_past_processing_is_a_no_op(): void
    {
        $statement = $this->upload($this->fixture());

        // Rejouer le job sur un relevé déjà parsé ne doit pas doubler les lignes.
        ParseBankStatementJob::dispatch($statement->id);

        $this->assertSame(10, $statement->lines()->count());
    }

    // ─── Match ───────────────────────────────────────────────────

    public function test_an_exact_reference_wins_at_confidence_95(): void
    {
        $payment = $this->leasePayment($this->agency, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame(LeasePayment::class, $line->matched_payment_type);
        $this->assertSame($payment->id, $line->matched_payment_id);
        $this->assertSame(95, $line->match_confidence);
    }

    public function test_a_date_within_two_days_scores_70_and_beyond_scores_60(): void
    {
        // Ligne « 20/04/2026,12000,Virement entrant,, » — sans référence, donc
        // la règle 1 ne peut pas s'appliquer : c'est la date qui tranche.
        $close = $this->leasePayment($this->agency, [
            'reference_number' => 'NO-MATCH-A',
            'amount' => 12000,
            'paid_at' => '2026-04-19',   // 1 jour → 70
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('label', 'Virement entrant')->sole();

        $this->assertSame($close->id, $line->matched_payment_id);
        $this->assertSame(70, $line->match_confidence);

        // Le même montant à 6 jours ne vaut plus que 60.
        $statement->lines()->delete();
        $far = $this->leasePayment($this->agency, [
            'reference_number' => 'NO-MATCH-B',
            'amount' => 21000,
            'paid_at' => '2026-04-14',
        ]);
        $farLine = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'posted_at' => '2026-04-20',
            'amount' => 21000,
            'currency' => 'XOF',
            'direction' => BankStatementLineDirection::Credit,
            'reference' => null,
            'counterparty' => null,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);

        (new MatchBankStatementJob($statement->id))
            ->handle(app(ReconciliationMatcher::class));

        $farLine->refresh();
        $this->assertSame($far->id, $farLine->matched_payment_id);
        $this->assertSame(60, $farLine->match_confidence);
    }

    public function test_a_different_reference_does_not_earn_the_95(): void
    {
        // Ligne « 02/04/2026,25000,…,LP-2026-002 ». Le paiement colle par le
        // montant mais porte une AUTRE référence : la règle 1 exige l'égalité
        // des valeurs, pas la seule présence des deux champs. Sans ce cas, un
        // comparateur qui vérifierait la forme et non la valeur resterait vert.
        $payment = $this->leasePayment($this->agency, [
            'reference_number' => 'SOMETHING-ELSE',
            'amount' => 25000,
            'paid_at' => '2026-04-08',   // 6 jours → hors règle 3
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-002')->sole();

        $this->assertSame($payment->id, $line->matched_payment_id);
        $this->assertSame(60, $line->match_confidence);
    }

    public function test_a_debit_line_is_never_matched(): void
    {
        // Un paiement de 5000 existe et colle par la date, mais la ligne
        // « Frais bancaires » est un DÉBIT : de l'argent qui sort ne rapproche
        // pas un encaissement.
        $this->leasePayment($this->agency, [
            'reference_number' => 'LP-FEES',
            'amount' => 5000,
            'paid_at' => '2026-04-03',
        ]);

        $statement = $this->upload($this->fixture());
        $fees = $statement->lines()->where('label', 'Frais bancaires')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $fees->match_status);
        $this->assertNull($fees->matched_payment_id);
    }

    public function test_two_equally_plausible_candidates_produce_no_suggestion(): void
    {
        // Deux paiements au même montant, tous deux hors de la fenêtre ±2 jours
        // et sans référence commune → score 60 ex æquo. Suggérer l'un des deux
        // au hasard ferait rapprocher de l'argent sur le mauvais paiement.
        foreach (['AMB-A', 'AMB-B'] as $reference) {
            $this->leasePayment($this->agency, [
                'reference_number' => $reference,
                'amount' => 12000,
                'paid_at' => '2026-04-14',
            ]);
        }

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('label', 'Virement entrant')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    public function test_a_payment_of_another_agency_is_never_suggested(): void
    {
        // Fuite inter-tenant : la référence est EXACTE et le montant colle,
        // mais le paiement appartient à une autre agence.
        $other = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->leasePayment($other, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    public function test_an_already_reconciled_payment_is_never_suggested_twice(): void
    {
        $this->leasePayment($this->agency, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
            'bank_reconciled_at' => now(),
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    public function test_a_payment_in_another_currency_is_never_suggested(): void
    {
        $this->leasePayment($this->agency, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
            'currency' => Currency::EUR,
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    // ─── TCK-593 — aucune perte silencieuse, aucun relevé dans le journal ─

    public function test_dix_lignes_dont_deux_illisibles_finit_a_huit_lues_et_deux_comptees(): void
    {
        // AC16.
        $rows = [];
        for ($i = 1; $i <= 8; $i++) {
            $rows[] = sprintf('%02d/04/2026,%d,Ligne %d,,', $i, 1000 * $i, $i);
        }
        $rows[] = '09/04/2026,abc,Illisible,,';
        $rows[] = '31/13/2026,1000,Debordante,,';

        $statement = $this->upload("date,amount,label,reference,counterparty\n".implode("\n", $rows)."\n");

        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->status);
        $this->assertSame(8, $statement->lines_count);
        $this->assertSame(2, $statement->skipped_lines_count);
        $this->assertSame(8, $statement->lines()->count());
        // La ligne `31/13/2026` n'est pas entrée au 2027-01-31 : la période reste en avril.
        $this->assertSame('2026-04-08', $statement->period_end->toDateString());

        $this->actingAs($this->admin)->getJson("/api/bank-statements/{$statement->id}")
            ->assertOk()
            ->assertJsonPath('data.skipped_lines_count', 2);
    }

    public function test_aucune_ligne_lue_passe_le_releve_en_failed(): void
    {
        // AC16 — les colonnes ne portent pas les noms du mapping : le code d'avant rendait
        // `ready_for_review` à ZÉRO ligne, sans un mot.
        $csv = "Date,Montant,Libelle\n";
        for ($i = 1; $i <= 5; $i++) {
            $csv .= sprintf("%02d/04/2026,%d,L%d\n", $i, 1000 * $i, $i);
        }

        $statement = $this->upload($csv);

        $this->assertSame(BankStatementStatus::Failed, $statement->status);
        $this->assertSame(5, $statement->skipped_lines_count);
        $this->assertSame(0, $statement->lines()->count());

        $this->actingAs($this->admin)->getJson("/api/bank-statements/{$statement->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'failed')
            ->assertJsonPath('data.skipped_lines_count', 5);
    }

    public function test_echec_d_analyse_passe_le_releve_en_failed(): void
    {
        // AC16 — un en-tête aux noms dupliqués fait lever le lecteur CSV lui-même, hors de la
        // boucle des lignes. Avant : le relevé restait `processing` à vie.
        $statement = $this->uploadQueued("date,date,amount\n01/04/2026,01/04/2026,1000\n");

        $this->runParseJobExpectingFailure($statement);

        $statement->refresh();
        $this->assertSame(BankStatementStatus::Failed, $statement->status);
        $this->assertSame(0, $statement->lines()->count());
    }

    public function test_un_releve_failed_se_reimporte_une_fois_le_mapping_corrige(): void
    {
        // L'index unique `(agency_id, file_hash)` faisait d'un mapping erroné une impasse : le
        // même fichier ne pouvait plus être déposé. Un `failed` n'a aucune ligne ; il est remplacé.
        $csv = "Date,Montant,Libelle\n01/04/2026,1000,A\n02/04/2026,2000,B\n";
        $failed = $this->upload($csv);
        $this->assertSame(BankStatementStatus::Failed, $failed->status);

        $this->actingAs($this->admin)
            ->putJson("/api/agencies/{$this->agency->id}/bank-statements/csv-mapping", [
                'delimiter' => ',',
                'has_header' => true,
                'date_column' => 'Date',
                'date_format' => 'd/m/Y',
                'amount_column' => 'Montant',
                'label_column' => 'Libelle',
                'sign_convention' => 'amount_signed',
                'decimal_separator' => ',',
            ])->assertOk();

        $again = $this->upload($csv);

        $this->assertSame(BankStatementStatus::ReadyForReview, $again->status);
        $this->assertSame(2, $again->lines_count);
        $this->assertNull(BankStatement::find($failed->id));

        // Un relevé LU, lui, bloque toujours le doublon.
        $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('statement.csv', $csv),
                'source_format' => 'csv',
            ])->assertStatus(422);
    }

    public function test_le_journal_ne_porte_aucune_valeur_du_releve(): void
    {
        // AC19 — tout ce que l'analyse journalise, message ET contexte, sérialisé.
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$logged): void {
            $logged[] = ['level' => $e->level, 'message' => $e->message, 'context' => $e->context];
        });

        // 1. Deux lignes sautées : une date non numérique au libellé témoin, une date débordante.
        $statement = $this->upload("date,amount,label,reference,counterparty\n"
            ."01/04/2026,1000,Lisible A,,\n"
            ."JJ/01/2026,2000,LIBELLE-TEMOIN-4417,,\n"
            ."31/13/2026,3000,Debordante,,\n"
            ."02/04/2026,4000,Lisible B,,\n");

        $this->assertSame(2, $statement->skipped_lines_count);
        $skipped = array_values(array_filter($logged, fn ($l) => $l['message'] === 'bank_statement_line_skipped'));
        $this->assertCount(2, $skipped);
        foreach ($skipped as $entry) {
            $this->assertArrayHasKey('line', $entry['context']);
            $this->assertArrayHasKey('columns', $entry['context']);
        }
        $this->assertSame([2, 3], array_column(array_column($skipped, 'context'), 'line'));

        $journal = json_encode($logged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        foreach (['LIBELLE-TEMOIN-4417', 'JJ/01/2026', '31/13/2026'] as $witness) {
            $this->assertStringNotContainsString($witness, $journal, "Le journal recopie « {$witness} ».");
        }

        // 2. L'insertion lève SQLSTATE[22001] : une contrepartie de 300 caractères.
        $logged = [];
        $counterparty = str_pad('CONTREPARTIE-TEMOIN-', 300, 'X');
        $second = $this->uploadQueued("date,amount,label,reference,counterparty\n"
            ."03/04/2026,5000,LIBELLE-TEMOIN-8823,,{$counterparty}\n");

        $this->runParseJobExpectingFailure($second);

        $this->assertSame(BankStatementStatus::Failed, $second->refresh()->status);
        $failures = array_values(array_filter($logged, fn ($l) => $l['message'] === 'bank_statement_parse_failed'));
        $this->assertCount(1, $failures);
        $this->assertSame('22001', $failures[0]['context']['sqlstate']);
        $this->assertSame($second->id, $failures[0]['context']['statement_id']);

        $journal = json_encode($logged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        foreach (['LIBELLE-TEMOIN-8823', 'CONTREPARTIE-TEMOIN-'] as $witness) {
            $this->assertStringNotContainsString($witness, $journal, "Le journal recopie « {$witness} ».");
        }
    }

    public function test_l_exception_relancee_ne_recopie_pas_le_releve(): void
    {
        // Vérification adverse R8 — le worker passe l'exception relancée à `report()` et en écrit
        // le texte dans `failed_jobs.exception` : relancer la `QueryException` y recopiait le SQL
        // et ses valeurs liées. L'exception relancée est assainie, sans `previous`.
        $counterparty = str_pad('CONTREPARTIE-TEMOIN-', 300, 'X');
        $statement = $this->uploadQueued("date,amount,label,reference,counterparty\n"
            ."03/04/2026,5000,LIBELLE-TEMOIN-8823,,{$counterparty}\n");

        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $e) use (&$logged): void {
            $logged[] = ['message' => $e->message, 'context' => array_map(
                fn ($v) => $v instanceof \Throwable ? (string) $v : $v,
                $e->context,
            )];
        });

        $thrown = null;
        try {
            app()->call([new ParseBankStatementJob($statement->id), 'handle']);
        } catch (\Throwable $e) {
            $thrown = $e;
            app(ExceptionHandler::class)->report($e); // ce que fait Illuminate\Queue\Worker
        }

        $this->assertNotNull($thrown);
        $this->assertNull($thrown->getPrevious());
        $this->assertStringContainsString('22001', $thrown->getMessage());

        // `failed_jobs.exception` stocke `(string) $e` : message ET trace.
        $persisted = (string) $thrown;
        $journal = json_encode($logged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        foreach (['LIBELLE-TEMOIN-8823', 'CONTREPARTIE-TEMOIN-', 'CONTREPARTIE-TE'] as $witness) {
            $this->assertStringNotContainsString($witness, $journal, "Le rapport recopie « {$witness} ».");
            $this->assertStringNotContainsString($witness, $persisted, "failed_jobs recopierait « {$witness} ».");
        }
    }

    public function test_un_csv_qui_n_est_pas_en_utf8_est_refuse_a_l_import(): void
    {
        // Vérification adverse R6 — un export latin-1 finissait `failed` sans un mot d'encodage.
        $latin1 = "date,amount,label\n01/04/2026,1000,".mb_convert_encoding('Loyer réglé Médina', 'ISO-8859-1', 'UTF-8')."\n";

        $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('statement.csv', $latin1),
                'source_format' => 'csv',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.file.0', __('reconciliation.validation.file_not_utf8'));

        $this->assertSame(0, BankStatement::query()->where('agency_id', $this->agency->id)->count());

        // Le même texte en UTF-8 passe.
        $statement = $this->upload("date,amount,label\n01/04/2026,1000,Loyer réglé Médina\n");
        $this->assertSame('Loyer réglé Médina', $statement->lines()->sole()->label);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function fixture(): string
    {
        return file_get_contents(base_path('tests/fixtures/bank/sample.csv'));
    }

    /**
     * Dépose un relevé par la vraie route et rend le `BankStatement` frais.
     * La file n'est PAS fakée : `ParseBankStatementJob` puis
     * `MatchBankStatementJob` s'exécutent en ligne (`QUEUE_CONNECTION=sync`).
     */
    private function upload(string $content): BankStatement
    {
        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('statement.csv', $content),
                'source_format' => 'csv',
                'bank_name' => 'BIS',
            ]);

        $response->assertStatus(202);

        return BankStatement::findOrFail($response->json('data.id'));
    }

    /**
     * Dépose un relevé SANS exécuter l'analyse : une levée du job, sous `QUEUE_CONNECTION=sync`,
     * remonterait dans la requête HTTP. Le job est ensuite joué à la main.
     */
    private function uploadQueued(string $content): BankStatement
    {
        Queue::fake();

        $statement = $this->upload($content);

        return $statement;
    }

    private function runParseJobExpectingFailure(BankStatement $statement): void
    {
        try {
            app()->call([new ParseBankStatementJob($statement->id), 'handle']);
            $this->fail('L\'analyse devait lever.');
        } catch (\Throwable $e) {
            $this->assertNotInstanceOf(AssertionFailedError::class, $e);
        }
    }

    /** @param array<string,mixed> $attributes */
    private function leasePayment(Agency $agency, array $attributes): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        return LeasePayment::factory()->create(array_merge([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ], $attributes));
    }
}
