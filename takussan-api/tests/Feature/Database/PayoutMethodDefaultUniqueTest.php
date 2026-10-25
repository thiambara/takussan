<?php

namespace Tests\Feature\Database;

use App\Models\PayoutMethod;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2372 (P250.03, décision du porteur du 2026-10-25) — un compte n'a qu'une destination de
 * reversement VIVANTE par défaut, et c'est la base qui le tient : index unique partiel
 * `(user_id) WHERE is_default AND deleted_at IS NULL`.
 *
 * Avant : `PayoutMethodService` lisait puis écrivait, sans verrou (deux ajouts simultanés pouvaient
 * laisser deux `is_default`), et `PayoutService::defaultVerifiedDestination` en prenait une par
 * `->first()` sans ordre.
 *
 * `deleted_at IS NULL` n'est pas dans la lettre de la décision : `payout_methods` est en
 * `SoftDeletes` et une destination supprimée garde son `is_default`. Sans la clause, ajouter une
 * destination après avoir supprimé celle par défaut heurtait l'index (23505, rendu 500).
 */
class PayoutMethodDefaultUniqueTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const INDEX = 'payout_methods_user_default_unique';

    private function migration(): object
    {
        return require database_path('migrations/2026_10_25_223721_add_default_unique_to_payout_methods.php');
    }

    private function indexPresent(): bool
    {
        return collect(Schema::getIndexes('payout_methods'))->contains('name', self::INDEX);
    }

    private function defaultsOf(User $user): int
    {
        return PayoutMethod::query()->where('user_id', $user->id)->where('is_default', true)->count();
    }

    public function test_une_seconde_destination_vivante_par_defaut_est_refusee_par_la_base(): void
    {
        $user = User::factory()->create();
        PayoutMethod::factory()->create(['user_id' => $user->id, 'is_default' => true]);

        try {
            // Un point de sauvegarde : l'erreur SQL abandonnerait sinon la transaction du test.
            DB::transaction(fn () => PayoutMethod::factory()->create(['user_id' => $user->id, 'is_default' => true]));
            $this->fail('une seconde destination par défaut a été acceptée');
        } catch (QueryException $e) {
            $this->assertSame('23505', $e->getCode());
            $this->assertStringContainsString(self::INDEX, $e->getMessage());
        }

        $this->assertSame(1, $this->defaultsOf($user));
    }

    public function test_une_destination_supprimee_et_les_autres_destinations_ne_comptent_pas(): void
    {
        $user = User::factory()->create();
        PayoutMethod::factory()->create(['user_id' => $user->id, 'is_default' => true])->delete();
        PayoutMethod::factory()->create(['user_id' => $user->id, 'is_default' => true]);
        PayoutMethod::factory()->count(2)->create(['user_id' => $user->id, 'is_default' => false]);

        $this->assertSame(1, $this->defaultsOf($user));
        $this->assertSame(4, PayoutMethod::withTrashed()->where('user_id', $user->id)->count());
    }

    public function test_la_migration_echoue_en_nommant_les_doublons_et_ne_corrige_rien(): void
    {
        $this->migration()->down();
        $this->assertFalse($this->indexPresent());

        $double = User::factory()->create();
        $a = PayoutMethod::factory()->create(['user_id' => $double->id, 'is_default' => true]);
        $b = PayoutMethod::factory()->create(['user_id' => $double->id, 'is_default' => true]);
        // Une destination supprimée ne fait pas un doublon.
        $seul = User::factory()->create();
        PayoutMethod::factory()->create(['user_id' => $seul->id, 'is_default' => true])->delete();
        PayoutMethod::factory()->create(['user_id' => $seul->id, 'is_default' => true]);

        try {
            $this->migration()->up();
            $this->fail('la migration a abouti malgré un doublon');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('destination vivante par défaut : 1 (', $e->getMessage());
            $this->assertStringContainsString("user_id {$double->id} : destinations {$a->id}, {$b->id}", $e->getMessage());
            $this->assertStringNotContainsString("user_id {$seul->id}", $e->getMessage());
        }

        $this->assertFalse($this->indexPresent());
        $this->assertSame(2, $this->defaultsOf($double));
    }

    public function test_down_retire_l_index_et_up_le_repose(): void
    {
        $this->assertTrue($this->indexPresent());

        $this->migration()->down();
        $this->assertFalse($this->indexPresent());

        $this->migration()->up();
        $this->assertTrue($this->indexPresent());
    }

    public function test_ajouter_puis_promouvoir_une_destination_par_defaut_n_en_laisse_qu_une(): void
    {
        Notification::fake();
        $landlord = $this->landlordOf($this->moneyAgency());
        $this->actingWithStepUp($landlord);

        $premiere = $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => '+221 77 111 11 11'])
            ->assertCreated()->assertJsonPath('data.is_default', true)->json('data.id');
        $seconde = $this->postJson('/api/me/payout-methods', [
            'kind' => 'orange_money', 'account_identifier' => '+221 77 222 22 22', 'is_default' => true,
        ])->assertCreated()->assertJsonPath('data.is_default', true)->json('data.id');

        $this->assertFalse(PayoutMethod::query()->findOrFail($premiere)->is_default);
        $this->assertSame(1, $this->defaultsOf($landlord));

        $this->patchJson("/api/me/payout-methods/{$premiere}", ['is_default' => true])->assertOk();
        $this->assertFalse(PayoutMethod::query()->findOrFail($seconde)->is_default);
        $this->assertSame(1, $this->defaultsOf($landlord));
    }

    public function test_ajouter_une_destination_apres_avoir_supprime_celle_par_defaut(): void
    {
        Notification::fake();
        $landlord = $this->landlordOf($this->moneyAgency());
        $this->actingWithStepUp($landlord);

        $premiere = $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => '+221 77 111 11 11'])
            ->assertCreated()->json('data.id');
        $this->deleteJson("/api/me/payout-methods/{$premiere}")->assertNoContent();

        $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => '+221 77 333 33 33'])
            ->assertCreated()->assertJsonPath('data.is_default', true);

        $this->assertSame(1, $this->defaultsOf($landlord));
    }
}
