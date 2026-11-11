<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * TCK-2605 — l'inscription par e-mail ne demande que l'adresse et le mot de passe, comme la voie
 * téléphone ne demande que le numéro : le prénom est demandé à l'écran suivant (`EtapePrenom`).
 * Le nom absent s'écrit `''`, comme `PhoneLoginService::createAccount()`. La confirmation du mot
 * de passe devient facultative, mais une confirmation ENVOYÉE et différente refuse toujours.
 */
class RegisterWithoutNameTest extends TestCase
{
    use RefreshDatabase;

    /** AC1 — adresse et mot de passe seuls : 201, un jeton qui ouvre la session, prénom vide. */
    public function test_l_adresse_et_le_mot_de_passe_suffisent(): void
    {
        $reponse = $this->postJson('/api/auth/register', [
            'email' => 'awa@example.com',
            'password' => 'password123',
        ])->assertCreated()
            ->assertJsonPath('user.email', 'awa@example.com');

        $jeton = $reponse->json('token');
        $this->assertIsString($jeton);
        $this->assertNotSame('', $jeton);

        $utilisateur = User::query()->where('email', 'awa@example.com')->firstOrFail();
        $this->assertSame('', $utilisateur->first_name);
        $this->assertSame('', $utilisateur->last_name);
        $this->assertTrue(Hash::check('password123', $utilisateur->password));
        $this->assertNotNull($utilisateur->password_set_at, 'le mot de passe a été choisi (TCK-272)');

        $this->app['auth']->forgetGuards();
        $this->withToken($jeton)->getJson('/api/auth/me')->assertOk()->assertJsonFragment(['email' => 'awa@example.com']);
    }

    /** Un prénom ou un nom envoyé vide (« » → null par le middleware) s'écrit aussi `''`. */
    public function test_un_prenom_et_un_nom_vides_s_ecrivent_vides(): void
    {
        $this->postJson('/api/auth/register', [
            'first_name' => '',
            'last_name' => null,
            'email' => 'moussa@example.com',
            'password' => 'password123',
        ])->assertCreated();

        $utilisateur = User::query()->where('email', 'moussa@example.com')->firstOrFail();
        $this->assertSame('', $utilisateur->first_name);
        $this->assertSame('', $utilisateur->last_name);
    }

    /** AC2 — une confirmation présente et différente refuse, sur `password`. */
    public function test_une_confirmation_envoyee_et_differente_refuse(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'awa@example.com',
            'password' => 'password123',
            'password_confirmation' => 'autre',
        ])->assertUnprocessable()->assertJsonValidationErrors(['password']);

        $this->postJson('/api/auth/register', [
            'email' => 'awa@example.com',
            'password' => 'password123',
            'password_confirmation' => '',
        ])->assertUnprocessable()->assertJsonValidationErrors(['password']);

        $this->assertDatabaseMissing('users', ['email' => 'awa@example.com']);
    }

    /** Les autres règles ne bougent pas : mot de passe faible, prénom trop long. */
    public function test_les_autres_regles_tiennent(): void
    {
        $this->postJson('/api/auth/register', ['email' => 'awa@example.com', 'password' => 'short'])
            ->assertUnprocessable()->assertJsonValidationErrors(['password']);
        $this->postJson('/api/auth/register', [
            'first_name' => str_repeat('a', 101),
            'email' => 'awa@example.com',
            'password' => 'password123',
        ])->assertUnprocessable()->assertJsonValidationErrors(['first_name']);
        $this->postJson('/api/auth/register', ['email' => 'awa@example.com'])
            ->assertUnprocessable()->assertJsonValidationErrors(['password']);
    }

    /** Rétrocompatibilité — le corps d'aujourd'hui rend la même réponse. */
    public function test_le_corps_d_aujourd_hui_rend_la_meme_reponse(): void
    {
        $this->postJson('/api/auth/register', [
            'first_name' => 'Amine',
            'last_name' => 'Thiam',
            'email' => 'amine@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated()
            ->assertJsonPath('user.first_name', 'Amine')
            ->assertJsonPath('user.last_name', 'Thiam');
    }
}
