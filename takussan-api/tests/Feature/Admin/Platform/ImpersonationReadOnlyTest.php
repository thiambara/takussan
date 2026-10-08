<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\DataExport;
use App\Services\Auth\SessionTokenIssuer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0055 §3) — AC5c : sous un jeton d'impersonation, on LIT, et rien d'autre.
 */
class ImpersonationReadOnlyTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    /** AC5c. */
    public function test_la_cible_se_lit_et_ne_s_ecrit_pas(): void
    {
        ['cible' => $cible, 'jeton' => $jeton] = $this->ouvrirUneSession();
        $preferences = $cible->preferences;

        $this->avecLeJeton($jeton)->getJson('/api/auth/me')->assertOk()->assertJsonPath('id', $cible->id);

        $this->avecLeJeton($jeton)->patchJson('/api/me', ['city' => 'Ziguinchor'])
            ->assertForbidden()
            ->assertJsonPath('code', 'impersonation.read_only');
        $this->assertSame($preferences, $cible->fresh()->preferences);

        $this->avecLeJeton($jeton)->postJson('/api/me/data-exports')
            ->assertForbidden()
            ->assertJsonPath('code', 'impersonation.read_only');
        $this->assertSame(0, DataExport::query()->count());
    }

    /** Toute méthode non sûre, sur toute famille de routes — pas une liste d'écritures connues. */
    public function test_toute_methode_non_sure_est_refusee(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();

        foreach ([
            ['post', '/api/properties'],
            ['post', '/api/notifications/read-all'],
            ['post', '/api/auth/logout'],
            ['patch', '/api/me'],
            ['put', '/api/me/wizard-drafts/annonce'],
            ['delete', '/api/me/calendar-feed'],
            ['delete', '/api/auth/me/deletion-request'],
        ] as [$methode, $chemin]) {
            $this->avecLeJeton($jeton)->json($methode, $chemin)
                ->assertForbidden()
                ->assertJsonPath('code', 'impersonation.read_only');
        }
    }

    /** Les lectures refusées de l'ADR : la console, les exports, les codes de secours. */
    public function test_les_lectures_nommees_par_l_adr_sont_refusees(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();

        foreach ([
            '/api/admin/users',
            '/api/me/data-exports',
            '/api/export/customers',
            '/api/activity-logs/export',
            '/api/auth/two-factor/recovery-codes',
        ] as $chemin) {
            $this->avecLeJeton($jeton)->getJson($chemin)
                ->assertForbidden()
                ->assertJsonPath('code', 'impersonation.read_only');
        }
    }

    /**
     * Second chemin : le jeton d'impersonation ne porte JAMAIS de confirmation 2FA ni la capacité
     * `*`. Une action sous step-up resterait refusée par `RequireRecentTwoFactor` si ce middleware
     * disparaissait ; une garde qui lirait les capacités du jeton refuserait toute écriture.
     */
    public function test_le_jeton_n_a_ni_step_up_ni_capacite_generale(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();
        $ligne = PersonalAccessToken::findToken($jeton);

        $this->assertNull(SessionTokenIssuer::stepUpValidUntil($ligne));
        $this->assertFalse($ligne->can('*'));
        $this->assertFalse($ligne->can('properties.create'));
        $this->assertTrue($ligne->can('impersonation:read'));
    }

    /** Hors session, rien ne change : le même compte écrit avec son propre jeton. */
    public function test_le_jeton_ordinaire_de_la_cible_ecrit_toujours(): void
    {
        ['cible' => $cible] = $this->ouvrirUneSession();
        $propre = $cible->createToken('mobile')->plainTextToken;

        $this->avecLeJeton($propre)->patchJson('/api/me', ['city' => 'Ziguinchor'])->assertOk();
        $this->assertSame('Ziguinchor', $cible->fresh()->preferences['city'] ?? null);
    }
}
