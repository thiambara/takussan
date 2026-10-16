<?php

namespace Tests\Feature\Authorization;

use App\Models\Lease;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-711 (piste P02.03) — le profil plateforme se lit UNE fois par requête HTTP, dans
 * `ResolveActiveProfile`, et non à chaque `can()` (`Gate::before` → `isSuperAdmin()`), à chaque
 * ligne de `LeaseResource` et dans chaque middleware 2FA. Décision du porteur : « platformProfile
 * chargé une fois par requête ; une révocation prend effet à la requête suivante ».
 */
class PlatformProfileLuUneFoisParRequeteTest extends TestCase
{
    use RefreshDatabase;

    public function test_une_liste_de_baux_lue_par_un_super_admin_ne_relit_pas_le_profil_plateforme(): void
    {
        $this->actingAsRole('super_admin');
        Lease::factory()->count(3)->create();

        $lectures = $this->compterLecturesDuProfilPlateforme(
            fn () => $this->getJson('/api/leases')->assertOk()->assertJsonCount(3, 'data'),
        );

        $this->assertSame(1, $lectures, 'Le profil plateforme doit être lu une seule fois par requête.');
    }

    public function test_une_revocation_prend_effet_a_la_requete_suivante_meme_sur_la_meme_instance(): void
    {
        $user = $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/system/metrics')->assertOk();

        // Même instance `User` d'une requête à l'autre, comme le garde la laisse en test : un
        // préchargement « s'il manque » servirait encore le profil d'avant la révocation.
        $user->platformProfile()->update(['revoked_at' => now()]);

        $this->getJson('/api/admin/system/metrics')->assertForbidden();
    }

    private function compterLecturesDuProfilPlateforme(callable $requete): int
    {
        $lectures = 0;
        DB::listen(function (QueryExecuted $query) use (&$lectures): void {
            if (str_contains($query->sql, '"platform_profiles"')) {
                $lectures++;
            }
        });

        $requete();

        return $lectures;
    }
}
