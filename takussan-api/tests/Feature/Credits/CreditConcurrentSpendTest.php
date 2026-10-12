<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\CreditLot;
use App\Models\CreditMovement;
use App\Models\Enums\CreditLotOrigin;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Credits\InsufficientCredits;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PgSql\Connection;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §2) — deux dépenses concurrentes ne découvrent jamais le solde. Voir le
 * plan `docs/plans/2026-10-12-tck-633-lot-f-credits-boost.md`, tâche 5, pour ce que ce test prouve
 * et ne prouve pas.
 */
class CreditConcurrentSpendTest extends TestCase
{
    use RefreshDatabase;

    private ?int $agencyId = null;

    private ?int $userId = null;

    /** Aucune transaction enveloppante : la connexion B doit VOIR et VERROUILLER ces lignes. */
    protected function connectionsToTransact(): array
    {
        return [];
    }

    protected function tearDown(): void
    {
        DB::statement('TRUNCATE TABLE credit_movements, credit_welcome_grants, credit_lots');
        if ($this->agencyId !== null) {
            DB::table('agencies')->where('id', $this->agencyId)->delete();
        }
        if ($this->userId !== null) {
            DB::table('users')->where('id', $this->userId)->delete();
        }
        parent::tearDown();
    }

    public function test_une_depense_attend_le_verrou_de_l_espace_et_relit_apres_lui(): void
    {
        $this->courseContre(fn (Agency $agency) => app(CreditLedger::class)->spend($agency, 20));
    }

    /** Le débit manuel du super-admin passe par le même verrou que l'achat (ADR-0061 §2). */
    public function test_un_debit_manuel_du_super_admin_attend_le_meme_verrou(): void
    {
        $operateur = User::withoutEvents(fn () => User::factory()->create());
        $this->userId = $operateur->id;

        $this->courseContre(fn (Agency $agency) => app(CreditLedger::class)->adminAdjust($agency, -20, $operateur, 'Correction', 180));
    }

    /**
     * B tient le verrou de l'espace en `FOR SHARE` — le mode le plus faible qu'une dépense CORRECTE
     * doit encore exclure — consomme le lot, et commite une seconde plus tard. Une dépense qui
     * verrouille en `FOR UPDATE` (ou `FOR NO KEY UPDATE`) attend B, puis relit un lot vide ; une
     * dépense qui ne prendrait qu'un `FOR SHARE` / `FOR KEY SHARE` passerait à côté de B — ces
     * modes ne s'excluent pas entre eux — et dépenserait les crédits que B consomme. Avec un
     * `FOR UPDATE` posé par B, la garde restait verte sous cette régression (vérif. adverse du lot F).
     *
     * @param  callable(Agency): mixed  $depense
     */
    private function courseContre(callable $depense): void
    {
        $this->assertTrue(function_exists('pg_send_query'), 'ext-pgsql requise (installée en CI, api-ci.yml:117).');

        // Sans événements : ni rôles système, ni indexation — rien d'autre à nettoyer.
        $agency = Agency::withoutEvents(fn () => Agency::factory()->create());
        $this->agencyId = $agency->id;
        $lot = app(CreditLedger::class)->grant($agency, CreditLotOrigin::AdminGrant, 30, null);

        $b = $this->secondeConnexion();
        pg_query($b, 'BEGIN');
        pg_query_params($b, 'SELECT id FROM agencies WHERE id = $1 FOR SHARE', [$agency->id]);
        pg_query_params($b, 'UPDATE credit_lots SET remaining_amount = 0, updated_at = now() WHERE id = $1', [$lot->id]);
        pg_query_params($b, "INSERT INTO credit_movements (agency_id, credit_lot_id, type, amount, created_at) VALUES ($1, $2, 'spend', -30, now())", [$agency->id, $lot->id]);
        pg_send_query($b, 'SELECT pg_sleep(1); COMMIT');

        $debut = microtime(true);
        try {
            $depense($agency);
            $this->fail('A a dépensé des crédits que B venait de consommer : les lots sont lus avant le verrou, sans lui, ou sous un verrou partagé.');
        } catch (InsufficientCredits $e) {
            $this->assertSame(0, $e->balance);
        } finally {
            while (pg_get_result($b) !== false) {
                // vider les résultats de `pg_sleep` puis du COMMIT
            }
            pg_close($b);
        }
        $attente = microtime(true) - $debut;

        $this->assertGreaterThan(0.5, $attente, 'A n’a pas attendu le verrou de B : la ligne d’agence n’est pas le point de sérialisation.');
        $this->assertSame(0, CreditLot::query()->findOrFail($lot->id)->remaining_amount);
        $this->assertSame(-30, (int) CreditMovement::query()->where('credit_lot_id', $lot->id)->where('amount', '<', 0)->sum('amount'));
        $this->assertSame([], app(CreditLedger::class)->invariantViolations($agency->id));
    }

    /** @return Connection */
    private function secondeConnexion()
    {
        $cfg = DB::connection()->getConfig();
        $parts = [
            'host' => $cfg['host'] ?? '127.0.0.1',
            'port' => $cfg['port'] ?? '5432',
            'dbname' => $cfg['database'],
            'user' => $cfg['username'] ?? null,
            'password' => $cfg['password'] ?? null,
        ];
        $dsn = implode(' ', array_map(
            fn (string $k, $v) => $k."='".addcslashes((string) $v, "'\\")."'",
            array_keys(array_filter($parts, fn ($v) => $v !== null && $v !== '')),
            array_filter($parts, fn ($v) => $v !== null && $v !== ''),
        ));

        $connexion = pg_connect($dsn, PGSQL_CONNECT_FORCE_NEW);
        $this->assertNotFalse($connexion, 'seconde connexion PostgreSQL impossible');

        return $connexion;
    }

    /** Le test précédent a commité ; `tearDown()` doit n'avoir rien laissé aux classes suivantes. */
    public function test_le_test_de_course_ne_laisse_aucune_ligne(): void
    {
        $this->assertSame(0, CreditLot::query()->count());
        $this->assertSame(0, CreditMovement::query()->count());
        $this->assertSame(0, Agency::query()->withTrashed()->count());
        $this->assertSame(0, User::query()->withTrashed()->count());
    }
}
