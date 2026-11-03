<?php

namespace Tests\Feature\Auth\Phone;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\RadarAdvertiser;
use App\Models\User;
use App\Services\Credits\CreditLedger;
use App\Services\Property\PublishReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2389 — ADR-0033 §3, amendement du 2026-10-29 : la connexion par code ouvre le compte que le
 * Radar a créé pour ce numéro (jamais vérifié, sans mot de passe ni e-mail), au lieu d'en créer un
 * neuf et vide. Les conditions sont cumulatives : chaque contre-exemple retombe sur la règle
 * générale (compte neuf), le compte du Radar intact.
 */
class PhoneLoginRadarAccountTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private FakeSmsRouter $sms;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
    }

    public function test_le_code_ouvre_le_compte_cree_par_le_radar(): void
    {
        $compte = $this->compteRadar();
        $avant = User::query()->count();

        $reponse = $this->entrer(self::NUMERO)
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $compte->id);

        $this->assertNotEmpty($reponse->json('token'));
        $this->assertSame($avant, User::query()->count());
        $this->assertNotNull($compte->fresh()->phone_verified_at);

        $this->app['auth']->forgetGuards();
        $this->withToken($reponse->json('token'))->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('id', $compte->id);
    }

    public function test_la_connexion_credite_l_espace_du_compte_du_radar(): void
    {
        $compte = $this->compteRadar();
        $agence = Agency::factory()->create(['primary_admin_id' => $compte->id]);

        $this->entrer(self::NUMERO)->assertOk()->assertJsonPath('is_new_account', false);

        $this->assertSame(500, app(CreditLedger::class)->balance($agence));
        $this->assertDatabaseHas('credit_welcome_grants', ['agency_id' => $agence->id, 'user_id' => $compte->id]);
    }

    public function test_le_numero_ecrit_autrement_retrouve_le_meme_compte(): void
    {
        $compte = $this->compteRadar(['phone' => '77 123 45 67']);
        $avant = User::query()->count();

        $this->entrer(self::NUMERO)
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $compte->id);

        $this->assertSame($avant, User::query()->count());
        $this->assertSame(self::NUMERO, $compte->fresh()->phone);
    }

    public function test_un_compte_qui_n_est_designe_par_aucun_annonceur_n_est_pas_ouvert(): void
    {
        $compte = $this->compteRadar(avecAnnonceur: false);

        $this->assertCompteNeuf($compte);
    }

    public function test_un_mot_de_passe_choisi_ferme_l_exception(): void
    {
        $compte = $this->compteRadar(['password_set_at' => now()]);

        $this->assertCompteNeuf($compte);
    }

    public function test_un_e_mail_ferme_l_exception(): void
    {
        $compte = $this->compteRadar(['email' => 'quelqu-un@example.com']);

        $this->assertCompteNeuf($compte);
    }

    public function test_deux_comptes_candidats_n_en_ouvrent_aucun(): void
    {
        $premier = $this->compteRadar();
        $second = $this->compteRadar();

        $this->entrer(self::NUMERO)
            ->assertOk()
            ->assertJsonPath('is_new_account', true);

        $this->assertNull($premier->fresh()->phone_verified_at);
        $this->assertNull($second->fresh()->phone_verified_at);
    }

    public function test_un_autre_compte_qui_a_verifie_le_numero_reste_celui_qu_on_ouvre(): void
    {
        $radar = $this->compteRadar();
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);

        $this->entrer(self::NUMERO)
            ->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $titulaire->id);

        $this->assertNull($radar->fresh()->phone_verified_at);
    }

    public function test_un_compte_du_radar_bloque_ne_s_ouvre_pas(): void
    {
        $compte = $this->compteRadar(['status' => UserStatus::Blocked]);

        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(202);
        $this->postJson('/api/auth/phone/verify-code', [
            'phone' => self::NUMERO,
            'code' => $this->sms->lastCodeFor(self::NUMERO),
        ])->assertStatus(403)->assertJsonPath('code', 'account_blocked')->assertJsonMissingPath('token');

        $this->assertNull($compte->fresh()->phone_verified_at);
    }

    /** Le compte que « Publier pour lui » crée : un numéro, ni mot de passe, ni e-mail, jamais vérifié. */
    private function compteRadar(array $attributs = [], bool $avecAnnonceur = true): User
    {
        $compte = User::factory()->create($attributs + [
            'phone' => self::NUMERO,
            'phone_verified_at' => null,
            'password_set_at' => null,
            'email' => null,
        ]);
        if ($avecAnnonceur) {
            RadarAdvertiser::factory()->create(['user_id' => $compte->id]);
        }

        return $compte;
    }

    /** La règle générale : un compte neuf s'ouvre, celui du Radar reste tel quel. */
    private function assertCompteNeuf(User $compteRadar): void
    {
        $reponse = $this->entrer(self::NUMERO)->assertOk()->assertJsonPath('is_new_account', true);

        $this->assertNotSame($compteRadar->id, $reponse->json('user.id'));
        $this->assertNull($compteRadar->fresh()->phone_verified_at);
    }

    /** Les conditions présentées au compte du Radar sont acceptées (TCK-2404, {@see PhoneLoginRadarTermsTest}) : ici, on juge quel compte s'ouvre. */
    private function entrer(string $numero): TestResponse
    {
        $this->postJson('/api/auth/phone/request-code', ['phone' => $numero])->assertStatus(202);

        return $this->postJson('/api/auth/phone/verify-code', [
            'phone' => $numero,
            'code' => $this->sms->lastCodeFor($numero),
            'terms_version' => PublishReadiness::TERMS_VERSION,
        ]);
    }
}
