<?php

namespace Tests\Feature\Database;

use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-2372 (P250.02) — un compte n'a qu'un profil de prestataire VIVANT, et c'est la base qui le
 * tient : index unique partiel `(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL`.
 *
 * Avant : la règle (TCK-2280, ADR-0016 amendé le 2026-10-25) ne tenait que par un `exists()` lu
 * avant d'écrire, dans `InvitationService::assertDraftDoesNotDuplicateAProfile`, sans verrou ; la
 * contrainte de la création avait été retirée par `2026_05_10_170000`.
 */
class ServiceProviderProfileUserUniqueTest extends TestCase
{
    use RefreshDatabase;

    private const INDEX = 'service_provider_profiles_user_live_unique';

    private function migration(): object
    {
        return require database_path('migrations/2026_10_25_223720_add_live_user_unique_to_service_provider_profiles.php');
    }

    private function indexPresent(): bool
    {
        return collect(Schema::getIndexes('service_provider_profiles'))->contains('name', self::INDEX);
    }

    public function test_un_second_profil_vivant_du_meme_compte_est_refuse_par_la_base(): void
    {
        $user = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $user->id]);

        try {
            // Un point de sauvegarde : l'erreur SQL abandonnerait sinon la transaction du test.
            DB::transaction(fn () => ServiceProviderProfile::factory()->create(['user_id' => $user->id]));
            $this->fail('un second profil vivant a été accepté');
        } catch (QueryException $e) {
            $this->assertSame('23505', $e->getCode());
            $this->assertStringContainsString(self::INDEX, $e->getMessage());
        }

        $this->assertSame(1, ServiceProviderProfile::query()->where('user_id', $user->id)->count());
    }

    public function test_un_profil_supprime_et_les_brouillons_sans_compte_ne_comptent_pas(): void
    {
        $user = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $user->id])->delete();
        ServiceProviderProfile::factory()->create(['user_id' => $user->id]);
        ServiceProviderProfile::factory()->draft()->count(2)->create();

        $this->assertSame(2, ServiceProviderProfile::withTrashed()->where('user_id', $user->id)->count());
        $this->assertSame(2, ServiceProviderProfile::query()->whereNull('user_id')->count());
    }

    public function test_la_migration_echoue_en_nommant_les_doublons_et_ne_corrige_rien(): void
    {
        $this->migration()->down();
        $this->assertFalse($this->indexPresent());

        $double = User::factory()->create();
        $a = ServiceProviderProfile::factory()->create(['user_id' => $double->id]);
        $b = ServiceProviderProfile::factory()->create(['user_id' => $double->id]);
        // Un profil supprimé ne fait pas un doublon.
        $seul = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $seul->id])->delete();
        ServiceProviderProfile::factory()->create(['user_id' => $seul->id]);

        try {
            $this->migration()->up();
            $this->fail('la migration a abouti malgré un doublon');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('profil de prestataire vivant : 1 (', $e->getMessage());
            $this->assertStringContainsString("user_id {$double->id} : profils {$a->id}, {$b->id}", $e->getMessage());
            $this->assertStringNotContainsString("user_id {$seul->id}", $e->getMessage());
        }

        $this->assertFalse($this->indexPresent());
        $this->assertSame(2, ServiceProviderProfile::query()->where('user_id', $double->id)->count());
    }

    public function test_down_retire_l_index_et_up_le_repose(): void
    {
        $this->assertTrue($this->indexPresent());

        $this->migration()->down();
        $this->assertFalse($this->indexPresent());

        $this->migration()->up();
        $this->assertTrue($this->indexPresent());
    }
}
