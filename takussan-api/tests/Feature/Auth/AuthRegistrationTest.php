<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AuthRegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register_with_valid_data(): void
    {
        Event::fake();

        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        // TCK-589 (4.2, AC5) — inversé : l'inscription rend un jeton et sa fin de
        // validité. `a4c01808` l'avait retiré (« user must verify email first »),
        // mais aucune route n'exige `email_verified_at` : le même compte se
        // connectait aussitôt par `/auth/login`, et le front ouvrait la session
        // avec un jeton `undefined` qui effaçait le cookie.
        $response->assertStatus(201)
            ->assertJsonStructure(['message', 'token', 'expires_at', 'user']);

        $this->assertDatabaseHas('users', ['email' => 'amine@example.com']);
        Event::assertDispatched(Registered::class);
    }

    public function test_le_jeton_rendu_par_l_inscription_ouvre_la_session(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'email' => 'awa@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated();

        $this->assertTrue(now()->addDays(29)->lt($response->json('expires_at')));
        $this->withToken($response->json('token'))
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonFragment(['email' => 'awa@example.com']);
    }

    public function test_registration_fails_with_duplicate_email(): void
    {
        User::factory()->create(['email' => 'amine@example.com']);

        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_registration_fails_with_weak_password(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'short',
            'password_confirmation' => 'short',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    /**
     * TCK-624 — la règle de l'API est celle du formulaire : une lettre ET un chiffre. Huit
     * caractères suffisaient, et un client qui contournait le front posait « aaaaaaaa ».
     */
    #[DataProvider('motsDePasseRefuses')]
    public function test_le_mot_de_passe_suit_la_regle_du_formulaire(string $motDePasse): void
    {
        $this->postJson('/api/auth/register', [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => 'awa@example.com',
            'password' => $motDePasse,
            'password_confirmation' => $motDePasse,
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    /** @return array<string, array{string}> */
    public static function motsDePasseRefuses(): array
    {
        return [
            'lettres seules' => ['aaaaaaaa'],
            'chiffres seuls' => ['12345678'],
            'plus de 72 caractères' => [str_repeat('a1', 37)],
        ];
    }

    public function test_registration_fails_with_missing_fields(): void
    {
        $response = $this->postJson('/api/auth/register', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['first_name', 'last_name', 'email', 'password']);
    }

    public function test_registration_fails_when_password_confirmation_does_not_match(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'different456',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }
}
