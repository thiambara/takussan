<?php

namespace Tests\Feature\Auth;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** TCK-633 (lot C) — les six colonnes du contrat, `GET /api/auth/me` pour soi seul, les cases WhatsApp. */
class ContactPreferencesTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_schema(): void
    {
        foreach (['phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at', 'secondary_phone_whatsapp', 'terms_accepted_at', 'terms_version'] as $colonne) {
            $this->assertTrue(Schema::hasColumn('users', $colonne), $colonne);
        }
        $this->assertTrue(DB::table('pg_indexes')
            ->where('tablename', 'users')
            ->where('indexname', 'users_secondary_phone_verified_unique')
            ->exists());
    }

    public function test_me_rend_les_preferences_de_contact(): void
    {
        // `fresh()` : relue en base, sinon le modèle en mémoire ignore les défauts de colonne.
        Sanctum::actingAs(User::factory()->create()->fresh());

        // Vérification adverse du lot C — `null` : la question WhatsApp n'a JAMAIS reçu de
        // réponse, ce qu'un booléen à défaut faux confondait avec « non ». L'écran de publication
        // la pose tant qu'elle est nulle.
        $this->getJson('/api/auth/me')->assertOk()
            ->assertJsonPath('phone_whatsapp', null)
            ->assertJsonPath('secondary_phone', null)
            ->assertJsonPath('secondary_phone_verified_at', null)
            ->assertJsonPath('secondary_phone_whatsapp', false)
            ->assertJsonPath('terms_accepted_at', null);
    }

    public function test_les_cases_whatsapp_passent_par_le_profil(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile', ['phone_whatsapp' => true, 'secondary_phone_whatsapp' => true])
            ->assertOk()
            ->assertJsonPath('phone_whatsapp', true)
            ->assertJsonPath('secondary_phone_whatsapp', true);
        $this->assertTrue($user->fresh()->phone_whatsapp);

        // Le profil envoie du FormData : « 0 » décoche.
        $this->put('/api/auth/profile', ['phone_whatsapp' => '0'], ['Accept' => 'application/json'])->assertOk();
        // « Non » est une réponse : `false`, jamais ramené à `null`.
        $this->assertFalse($user->fresh()->phone_whatsapp);
        $this->getJson('/api/auth/me')->assertJsonPath('phone_whatsapp', false);
        $this->assertTrue($user->fresh()->secondary_phone_whatsapp);

        $this->putJson('/api/auth/profile', ['phone_whatsapp' => 'peut-être'])
            ->assertUnprocessable()->assertJsonValidationErrors(['phone_whatsapp']);
    }

    /** `UserResource` sert aussi les membres d'une agence : le second numéro d'autrui ne sort pas. */
    public function test_les_preferences_ne_sortent_pas_pour_un_autre(): void
    {
        $autre = User::factory()->create();
        $autre->forceFill(['secondary_phone' => '+221770000777', 'secondary_phone_verified_at' => now()])->save();
        $moi = User::factory()->create();
        $requete = Request::create('/');
        $requete->setUserResolver(fn () => $moi);

        $tableau = (new UserResource($autre))->resolve($requete);

        foreach (['phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at', 'secondary_phone_whatsapp', 'terms_accepted_at'] as $cle) {
            $this->assertArrayNotHasKey($cle, $tableau);
        }
        $this->assertStringNotContainsString('770000777', (string) json_encode($tableau));
    }

    /**
     * `AgencyController` et `OAuthSessionOpener` appellent `toArray()` DIRECTEMENT : un `mergeWhen()`
     * y sortait un `MergeValue` non résolu sous une clé `0`. Les clés doivent y être à plat, pour
     * soi, et absentes pour un autre — par `toArray()` comme par `resolve()`.
     */
    public function test_to_array_direct_rend_des_cles_a_plat(): void
    {
        $moi = User::factory()->create(['phone_whatsapp' => true]);
        $moi->forceFill(['terms_accepted_at' => '2026-10-12 08:00:00'])->save();
        $autre = User::factory()->create();
        $requete = Request::create('/');
        $requete->setUserResolver(fn () => $moi);

        $pourSoi = (new UserResource($moi->fresh()))->toArray($requete);
        $this->assertArrayNotHasKey(0, $pourSoi);
        $this->assertTrue($pourSoi['phone_whatsapp']);
        $this->assertSame('2026-10-12T08:00:00+00:00', $pourSoi['terms_accepted_at']);

        $pourAutrui = (new UserResource($autre))->toArray($requete);
        $this->assertArrayNotHasKey(0, $pourAutrui);
        $this->assertArrayNotHasKey('phone_whatsapp', $pourAutrui);
    }

    /** Le second numéro et les CGU n'ont qu'un écrivain chacun : pas d'assignation de masse. */
    public function test_le_second_numero_ne_s_ecrit_pas_par_le_profil(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile', [
            'secondary_phone' => '+221770000778',
            'secondary_phone_verified_at' => now()->toIso8601String(),
            'terms_accepted_at' => now()->toIso8601String(),
        ])->assertOk();

        $frais = $user->fresh();
        $this->assertNull($frais->secondary_phone);
        $this->assertNull($frais->secondary_phone_verified_at);
        $this->assertNull($frais->terms_accepted_at);
    }

    /**
     * Correction du lot C, tour 2 — la réponse WhatsApp suit le NUMÉRO. Changer de numéro la remet
     * à « jamais répondu » (`null`), quel que soit le chemin : sinon le bouton WhatsApp de
     * l'annonce visait un numéro que personne n'a déclaré WhatsApp, et la question, ayant déjà une
     * réponse, n'était plus posée.
     */
    public function test_changer_de_numero_remet_la_reponse_whatsapp_a_jamais_repondu(): void
    {
        $user = User::factory()->create(['phone' => '+221770000711', 'phone_verified_at' => null, 'phone_whatsapp' => true]);
        Sanctum::actingAs($user);

        // `PUT /api/auth/profile`
        $this->putJson('/api/auth/profile', ['phone' => '+221770000712'])->assertOk()
            ->assertJsonPath('phone_whatsapp', null);
        $this->assertNull($user->fresh()->phone_whatsapp);

        // `PATCH /api/me`
        $user->forceFill(['phone_whatsapp' => false])->save();
        $this->patchJson('/api/me', ['phone' => '+221770000713'])->assertOk();
        $this->assertSame('+221770000713', $user->fresh()->phone);
        $this->assertNull($user->fresh()->phone_whatsapp);

        // Tout autre écrivain (`PhoneVerificationController` passe par `forceFill`).
        $user->forceFill(['phone_whatsapp' => true])->save();
        $user->fresh()->forceFill(['phone' => '+221770000714', 'phone_verified_at' => null])->save();
        $this->assertNull($user->fresh()->phone_whatsapp);

        // Une écriture qui ne change PAS le numéro ne touche pas la réponse. (`refresh()` : le
        // compte authentifié est cette instance, restée sur l'avant-dernier numéro.)
        $user->refresh()->forceFill(['phone_whatsapp' => true])->save();
        $this->putJson('/api/auth/profile', ['first_name' => 'Awa', 'phone' => '+221770000714'])->assertOk();
        $this->assertTrue($user->fresh()->phone_whatsapp);
    }

    /** Une réponse donnée DANS la même requête que le nouveau numéro vaut pour lui. */
    public function test_une_reponse_donnee_avec_le_nouveau_numero_est_gardee(): void
    {
        $user = User::factory()->create(['phone' => '+221770000721', 'phone_verified_at' => null, 'phone_whatsapp' => false]);
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile', ['phone' => '+221770000722', 'phone_whatsapp' => true])->assertOk()
            ->assertJsonPath('phone_whatsapp', true);
        $this->assertTrue($user->fresh()->phone_whatsapp);
    }

    /**
     * Correction du lot C, tour 3 — la réponse redonnée IDENTIQUE à l'ancienne, avec le nouveau
     * numéro, vaut aussi pour lui. Égale à l'ancienne, elle n'est pas « dirty », et le hook de
     * `User` la remettait à `null` (revérification 2, sonde H2) ; le test du tour 2 ne passait
     * que par une valeur différente.
     *
     * @return array<string, array{bool}>
     */
    public static function reponsesIdentiques(): array
    {
        return ['oui redonné' => [true], 'non redonné' => [false]];
    }

    #[DataProvider('reponsesIdentiques')]
    public function test_une_reponse_identique_donnee_avec_le_nouveau_numero_est_gardee(bool $reponse): void
    {
        $user = User::factory()->create(['phone' => '+221770000731', 'phone_verified_at' => null, 'phone_whatsapp' => $reponse]);
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/profile', ['phone' => '+221770000732', 'phone_whatsapp' => $reponse])->assertOk()
            ->assertJsonPath('phone', '+221770000732')
            ->assertJsonPath('phone_whatsapp', $reponse);
        $this->assertSame($reponse, $user->fresh()->phone_whatsapp);
    }

    /**
     * Correction du lot C, tour 2 — l'inscription ouvre une session : sa réponse porte les clés
     * « pour soi » comme `/api/auth/me`. Elles manquaient (`$request->user()` est nul à
     * l'inscription), et l'écran lisait `undefined` : la question WhatsApp n'était pas posée.
     */
    public function test_l_inscription_rend_les_preferences_pour_soi(): void
    {
        $reponse = $this->postJson('/api/auth/register', [
            'first_name' => 'Awa', 'last_name' => 'Ndiaye', 'email' => 'awa.tck633@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertCreated();

        $user = $reponse->json('user');
        foreach (['phone_whatsapp', 'secondary_phone', 'secondary_phone_verified_at', 'secondary_phone_whatsapp', 'terms_accepted_at'] as $cle) {
            $this->assertArrayHasKey($cle, $user, $cle);
        }
        $this->assertNull($user['phone_whatsapp']);
        $this->assertNull($user['terms_accepted_at']);
        $this->assertFalse($user['secondary_phone_whatsapp']);
    }
}
