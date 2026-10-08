<?php

namespace Tests\Feature\Auth\Session;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m3 — le verrou n'énumère pas les e-mails : une adresse
 * inconnue a son compteur LEURRE (en cache), au même seuil, avec le même 423 que
 * `account_locked`. Le croisement e-mail ↔ numéro est fermé par les verrous par canal (M1).
 *
 * Rouge sur d03d5729 : `connu@` → 401 ×10 puis 423, `inconnu@` → 401 ×11.
 */
class UnknownEmailDecoyLockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        User::factory()->create(['email' => 'connu@example.com', 'password' => 'bon-mot-de-passe']);
    }

    public function test_un_email_inconnu_se_verrouille_au_meme_seuil_et_de_la_meme_facon(): void
    {
        $connu = $this->serie('connu@example.com');
        $inconnu = $this->serie('inconnu@example.com');

        $this->assertSame(array_fill(0, 10, 401), array_slice($inconnu['statuts'], 0, 10));
        $this->assertSame($connu['statuts'], $inconnu['statuts']);
        $this->assertSame($connu['dernier'], $inconnu['dernier']);
    }

    public function test_le_leurre_ne_touche_que_son_adresse_et_tombe_au_bout_de_quinze_minutes(): void
    {
        $this->serie('inconnu@example.com');

        $this->tenter('autre-inconnu@example.com')->assertUnauthorized();
        $this->tenter('INCONNU@example.com ')->assertStatus(423);

        $this->travel(15)->minutes();
        $this->travel(1)->seconds();
        $this->tenter('inconnu@example.com')->assertUnauthorized();
    }

    /** @return array{statuts: list<int>, dernier: array<string, mixed>} */
    private function serie(string $email): array
    {
        $statuts = [];
        for ($i = 0; $i < 11; $i++) {
            $reponse = $this->tenter($email);
            $statuts[] = $reponse->status();
        }

        return ['statuts' => $statuts, 'dernier' => $reponse->json()];
    }

    private function tenter(string $email): TestResponse
    {
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => 'mauvais']);
    }
}
