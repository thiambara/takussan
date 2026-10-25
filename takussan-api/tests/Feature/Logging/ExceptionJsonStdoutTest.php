<?php

namespace Tests\Feature\Logging;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Monolog\Formatter\JsonFormatter;
use Monolog\Handler\StreamHandler;
use PDOException;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-2356 (P14.07) — une exception rapportée part en UNE ligne JSON sur la sortie standard du
 * conteneur (canal `exceptions`), quel que soit `LOG_CHANNEL`, dans la forme sûre de
 * `SafeExceptionContext` (ADR-0044 §2) : ni message, ni corps de requête, ni en-tête
 * `Authorization`, ni cookie, ni l'URL réelle, qui porte des jetons.
 *
 * Le canal écrit ici dans un fichier temporaire : `phpunit.xml` le détourne de `php://stdout`, et
 * le test le redirige à son tour pour le relire.
 */
class ExceptionJsonStdoutTest extends TestCase
{
    use RefreshDatabase;

    private const TEMOIN_MESSAGE = 'temoin-message-2356@exemple.sn';

    private const TEMOIN_CORPS = 'temoin-corps-2356';

    private const TEMOIN_JETON = 'temoin-jeton-2356';

    private const TEMOIN_COOKIE = 'temoin-cookie-2356';

    private const TEMOIN_URL = 'temoin-url-2356';

    private string $fichier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fichier = (string) tempnam(sys_get_temp_dir(), 'exceptions-json');
        config(['logging.channels.exceptions.handler_with.stream' => $this->fichier]);
        Log::forgetChannel('exceptions');

        Route::middleware('api')->post('api/_test/tck-2356/{jeton}', function (): never {
            throw new RuntimeException('échec pour '.self::TEMOIN_MESSAGE);
        });
    }

    protected function tearDown(): void
    {
        @unlink($this->fichier);
        parent::tearDown();
    }

    /** @return list<array<string, mixed>> */
    private function lignes(): array
    {
        $lignes = array_values(array_filter(explode("\n", (string) file_get_contents($this->fichier))));

        return array_map(function (string $ligne): array {
            $decode = json_decode($ligne, true);
            $this->assertIsArray($decode, "Ligne non JSON : {$ligne}");

            return $decode;
        }, $lignes);
    }

    public function test_le_canal_ecrit_du_json_sur_la_sortie_standard(): void
    {
        $canal = config('logging.channels.exceptions');

        $this->assertSame('monolog', $canal['driver']);
        $this->assertSame(StreamHandler::class, $canal['handler']);
        $this->assertSame(JsonFormatter::class, $canal['formatter']);
        // `phpunit.xml` le détourne ; le défaut, lui, est la sortie standard.
        $this->assertStringContainsString("env('LOG_EXCEPTIONS_STREAM', 'php://stdout')", (string) file_get_contents(config_path('logging.php')));
    }

    public function test_une_exception_non_rattrapee_part_en_une_ligne_json_sans_donnee_de_la_requete(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->withHeader('Authorization', 'Bearer '.self::TEMOIN_JETON)
            ->withUnencryptedCookie('session_temoin', self::TEMOIN_COOKIE)
            ->postJson('api/_test/tck-2356/'.self::TEMOIN_URL.'?q='.self::TEMOIN_URL, ['password' => self::TEMOIN_CORPS])
            ->assertStatus(500);

        $lignes = $this->lignes();
        $this->assertCount(1, $lignes);
        $ligne = $lignes[0];

        $this->assertSame('exception', $ligne['message']);
        $this->assertSame('ERROR', $ligne['level_name']);
        $this->assertSame(RuntimeException::class, $ligne['context']['exception']);
        $this->assertNotEmpty($ligne['context']['at']);
        $this->assertIsArray($ligne['context']['trace']);
        $this->assertSame('POST', $ligne['context']['method']);
        $this->assertSame('api/_test/tck-2356/{jeton}', $ligne['context']['route']);
        $this->assertSame($user->id, $ligne['context']['user_id']);

        $brut = (string) file_get_contents($this->fichier);
        foreach ([self::TEMOIN_MESSAGE, self::TEMOIN_CORPS, self::TEMOIN_JETON, self::TEMOIN_COOKIE, self::TEMOIN_URL, 'Bearer', 'password'] as $temoin) {
            $this->assertStringNotContainsString($temoin, $brut, "Le journal porte « {$temoin} ».");
        }
    }

    public function test_une_query_exception_y_part_aussi_malgre_son_rapporteur_qui_s_arrete(): void
    {
        $pdo = new PDOException('SQLSTATE[23505]: Unique violation DETAIL: Key (email)=('.self::TEMOIN_MESSAGE.') already exists.');
        $pdo->errorInfo = ['23505', 7, 'duplicate key'];

        report(new QueryException('pgsql', 'update "users" set "email" = ? where "id" = ?', [self::TEMOIN_MESSAGE, 1], $pdo));

        $lignes = $this->lignes();
        $this->assertCount(1, $lignes);
        $this->assertSame(QueryException::class, $lignes[0]['context']['exception']);
        $this->assertSame('23505', $lignes[0]['context']['sqlstate']);
        $this->assertStringNotContainsString(self::TEMOIN_MESSAGE, (string) file_get_contents($this->fichier));
    }

    public function test_une_exception_que_le_framework_ne_rapporte_pas_n_y_part_pas(): void
    {
        $this->getJson('api/_test/route-qui-n-existe-pas-2356')->assertNotFound();

        $this->assertSame([], $this->lignes());
    }
}
