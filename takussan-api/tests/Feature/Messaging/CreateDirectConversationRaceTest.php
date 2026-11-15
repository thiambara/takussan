<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\User;
use App\Services\Messaging\DirectConversationService;
use App\Support\AdvisoryLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PgSql\Connection;
use Tests\TestCase;

/**
 * Contre-vérification de TCK-2632 — deux « Écrire » simultanés entre les deux mêmes personnes ne
 * créent pas deux directes. B, sur une seconde connexion, tient le verrou de la paire, crée la
 * directe et commite une seconde plus tard ; A doit ATTENDRE ce verrou, puis TROUVER la directe de B.
 * Sans le verrou, A ne voit pas la ligne non commitée de B et en crée une seconde.
 *
 * Même patron que `CreditConcurrentSpendTest` : aucune transaction enveloppante, pour que B voie et
 * verrouille ; le `tearDown()` efface ce que le test a commité.
 */
class CreateDirectConversationRaceTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<int> */
    private array $userIds = [];

    /** Aucune transaction enveloppante : la connexion B doit voir ce que A commite, et l'inverse. */
    protected function connectionsToTransact(): array
    {
        return [];
    }

    protected function tearDown(): void
    {
        if ($this->userIds !== []) {
            $conversations = DB::table('conversation_participants')->whereIn('user_id', $this->userIds)->pluck('conversation_id')->unique()->all();
            DB::table('conversations')->whereIn('id', $conversations)->delete();
            DB::table('users')->whereIn('id', $this->userIds)->delete();
        }
        parent::tearDown();
    }

    public function test_un_second_ecrire_simultane_attend_le_premier_et_rend_sa_directe(): void
    {
        $this->assertTrue(function_exists('pg_send_query'), 'ext-pgsql requise (installée en CI).');

        [$moi, $autre] = [$this->compte(), $this->compte()];
        $paire = [$moi->id, $autre->id];
        sort($paire);
        $cle = AdvisoryLock::key('conversation_directe', (string) $paire[0], (string) $paire[1], '0');

        $b = $this->secondeConnexion();
        pg_query($b, 'BEGIN');
        pg_query_params($b, 'SELECT pg_advisory_xact_lock($1::bigint)', [$cle]);
        $ligne = pg_fetch_row(pg_query_params(
            $b,
            "INSERT INTO conversations (type, status, created_by, created_at, updated_at) VALUES ('direct', 'active', $1, now(), now()) RETURNING id",
            [$autre->id],
        ));
        $deB = (int) $ligne[0];
        foreach ([$moi->id, $autre->id] as $userId) {
            pg_query_params($b, 'INSERT INTO conversation_participants (conversation_id, user_id, joined_at, created_at, updated_at) VALUES ($1, $2, now(), now(), now())', [$deB, $userId]);
        }
        pg_send_query($b, 'SELECT pg_sleep(1); COMMIT');

        $debut = microtime(true);
        try {
            [$conversation, $creee] = DB::transaction(fn () => app(DirectConversationService::class)->firstOrCreate($moi, $autre->id, null));
        } finally {
            while (pg_get_result($b) !== false) {
                // vider les résultats de `pg_sleep` puis du COMMIT
            }
            pg_close($b);
        }
        $attente = microtime(true) - $debut;

        $this->assertGreaterThan(0.5, $attente, 'A n’a pas attendu le verrou de B : la recherche se fait hors du verrou de la paire.');
        $this->assertFalse($creee, 'A a créé une seconde directe au lieu de rendre celle de B.');
        $this->assertSame($deB, (int) $conversation->id);
        $this->assertSame(1, Conversation::query()->whereIn('created_by', $paire)->count());
    }

    /** Le test précédent a commité ; `tearDown()` ne doit rien avoir laissé aux classes suivantes. */
    public function test_le_test_de_course_ne_laisse_aucune_ligne(): void
    {
        $this->assertSame(0, Conversation::query()->withTrashed()->count());
        $this->assertSame(0, User::query()->withTrashed()->count());
    }

    private function compte(): User
    {
        $user = User::withoutEvents(fn () => User::factory()->create());
        $this->userIds[] = $user->id;

        return $user;
    }

    /** @return Connection */
    private function secondeConnexion()
    {
        $cfg = DB::connection()->getConfig();
        $parts = array_filter([
            'host' => $cfg['host'] ?? '127.0.0.1',
            'port' => $cfg['port'] ?? '5432',
            'dbname' => $cfg['database'],
            'user' => $cfg['username'] ?? null,
            'password' => $cfg['password'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');
        $dsn = implode(' ', array_map(
            fn (string $k, $v) => $k."='".addcslashes((string) $v, "'\\")."'",
            array_keys($parts),
            $parts,
        ));

        $connexion = pg_connect($dsn, PGSQL_CONNECT_FORCE_NEW);
        $this->assertNotFalse($connexion, 'seconde connexion PostgreSQL impossible');

        return $connexion;
    }
}
