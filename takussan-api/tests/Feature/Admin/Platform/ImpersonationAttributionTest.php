<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use App\Support\ImpersonationContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0055 §5) — AC5f : toute activité écrite pendant une session porte l'opérateur.
 *
 * Une session n'écrit rien par les routes de l'application (lecture seule) ; une activité peut
 * pourtant naître d'une lecture (consultation journalisée, TCK-601). La sonde est une route `GET`
 * du groupe `api` qui journalise, comme le ferait une telle lecture.
 */
class ImpersonationAttributionTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        Route::middleware(['api', 'auth:sanctum'])->get('api/__sonde-attribution-tck-600', function () {
            activity('User')->event('sonde_attribution')->log('sonde_attribution');

            return response()->json(['ok' => true]);
        });
    }

    /** AC5f. */
    public function test_l_activite_ecrite_pendant_la_session_porte_l_operateur(): void
    {
        ['operateur' => $operateur, 'cible' => $cible, 'jeton' => $jeton] = $this->ouvrirUneSession();

        $this->avecLeJeton($jeton)->getJson('/api/__sonde-attribution-tck-600')->assertOk();

        $activite = Activity::query()->where('event', 'sonde_attribution')->sole();
        $this->assertSame($operateur->id, (int) $activite->impersonator_id);
        $this->assertSame($cible->id, (int) $activite->causer_id);
    }

    public function test_hors_session_l_activite_ne_porte_aucun_operateur(): void
    {
        ['cible' => $cible] = $this->ouvrirUneSession();
        $propre = $cible->createToken('mobile')->plainTextToken;

        $this->avecLeJeton($propre)->getJson('/api/__sonde-attribution-tck-600')->assertOk();

        $this->assertNull(Activity::query()->where('event', 'sonde_attribution')->sole()->impersonator_id);
    }

    /** Le contexte ne survit pas à sa requête : un singleton de portée n'est pas vidé entre deux. */
    public function test_le_contexte_ne_deborde_pas_de_la_requete(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession();
        $this->avecLeJeton($jeton)->getJson('/api/__sonde-attribution-tck-600')->assertOk();

        $this->assertFalse(app(ImpersonationContext::class)->active());
        activity('User')->event('apres_la_requete')->log('apres_la_requete');
        $this->assertNull(Activity::query()->where('event', 'apres_la_requete')->sole()->impersonator_id);

        $this->avecLeJeton(User::factory()->create()->createToken('mobile')->plainTextToken)
            ->getJson('/api/__sonde-attribution-tck-600')->assertOk();
        $this->assertSame(1, Activity::query()->where('event', 'sonde_attribution')->whereNotNull('impersonator_id')->count());
    }

    /** AC5f — la console expose « via impersonation par X ». */
    public function test_l_activite_de_l_utilisateur_dans_la_console_expose_l_operateur(): void
    {
        ['operateur' => $operateur, 'cible' => $cible, 'jeton' => $jeton] = $this->ouvrirUneSession(
            $this->operateur(PlatformProfileLevel::SuperAdmin, ['first_name' => 'Ibrahima', 'last_name' => 'Fall']),
        );
        $this->avecLeJeton($jeton)->getJson('/api/__sonde-attribution-tck-600')->assertOk();

        $entrees = collect($this->commeOperateur($operateur)
            ->getJson("/api/admin/users/{$cible->id}/activity?per_page=50")
            ->assertOk()
            ->json('data'));

        $sonde = $entrees->firstWhere('event', 'sonde_attribution');
        $this->assertSame(['id' => $operateur->id, 'name' => 'Ibrahima Fall'], $sonde['impersonator']);
        $this->assertNull($entrees->firstWhere('event', 'super_admin_impersonation_started')['impersonator']);
    }
}
