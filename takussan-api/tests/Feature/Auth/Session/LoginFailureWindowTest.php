<?php

namespace Tests\Feature\Auth\Session;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse passe 2 (p2-3) — une série d'échecs vit 24 h depuis son PREMIER
 * échec, sur un compte comme sur le leurre d'une adresse inconnue. Sans cette fenêtre, le compteur
 * du compte durait toujours (`metadata.failed_login_attempts`) quand celui du leurre tombait avec
 * sa clé de cache : neuf échecs anciens suffisaient à verrouiller `connu@` au premier essai suivant,
 * et pas `inconnu@` — le verrou énumérait de nouveau les adresses.
 *
 * Rouge sur 104589df : `connu@` → 423 dès le deuxième essai après 25 h.
 */
class LoginFailureWindowTest extends TestCase
{
    use RefreshDatabase;

    private const CONNU = 'connu@example.com';

    private const INCONNU = 'inconnu@example.com';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        User::factory()->create(['email' => self::CONNU, 'password' => 'bon-mot-de-passe']);
    }

    public function test_des_echecs_vieux_de_25_heures_ne_comptent_plus(): void
    {
        $this->echouer(self::CONNU, 9);
        $this->echouer(self::INCONNU, 9);

        $this->travel(25)->hours();

        $connu = $this->statuts(self::CONNU, 11);
        $inconnu = $this->statuts(self::INCONNU, 11);

        // Une série neuve : dix 401, puis le verrou — exactement comme une première série.
        $attendu = [...array_fill(0, 10, 401), 423];
        $this->assertSame($attendu, $connu);
        $this->assertSame($attendu, $inconnu);
    }

    public function test_dans_les_24_heures_la_serie_continue(): void
    {
        $this->echouer(self::CONNU, 9);
        $this->echouer(self::INCONNU, 9);

        $this->travel(23)->hours();

        // Le dixième échec de la série pose le verrou : le onzième essai le rencontre.
        $this->assertSame([401, 423], $this->statuts(self::CONNU, 2));
        $this->assertSame([401, 423], $this->statuts(self::INCONNU, 2));
    }

    private function echouer(string $email, int $fois): void
    {
        foreach ($this->statuts($email, $fois) as $statut) {
            $this->assertSame(401, $statut);
        }
    }

    /** @return list<int> */
    private function statuts(string $email, int $fois): array
    {
        $statuts = [];
        for ($i = 0; $i < $fois; $i++) {
            $statuts[] = $this->tenter($email)->status();
        }

        return $statuts;
    }

    private function tenter(string $email): TestResponse
    {
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'mauvais']);
    }
}
