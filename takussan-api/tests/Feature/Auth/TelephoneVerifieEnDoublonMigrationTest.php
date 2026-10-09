<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-589 — une base peuplée qui porte un numéro vérifié sur plusieurs comptes migre quand même.
 *
 * Le déploiement de la préproduction du 2026-10-08 est mort sur `users_phone_verified_unique` :
 * la suite part d'une base vide et ne voyait pas les doublons. Le test rejoue la séquence sur un
 * parc construit SANS l'index — le rattrapage, puis l'index lui-même. Le DDL de PostgreSQL est
 * transactionnel : `RefreshDatabase` remet tout en place.
 */
class TelephoneVerifieEnDoublonMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const RATTRAPAGE = 'database/migrations/2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon.php';

    private const INDEX = 'database/migrations/2026_10_07_150200_make_email_nullable_and_phone_unique_on_users_table.php';

    private function migration(string $chemin): Migration
    {
        return require base_path($chemin);
    }

    private function compte(string $telephone, ?string $verifieLe): User
    {
        return User::factory()->create(['phone' => $telephone, 'phone_verified_at' => $verifieLe]);
    }

    private function indexExiste(): bool
    {
        return DB::selectOne("SELECT count(*) AS n FROM pg_indexes WHERE indexname = 'users_phone_verified_unique'")->n === 1;
    }

    public function test_le_rattrapage_garde_la_verification_la_plus_recente_et_l_index_se_pose(): void
    {
        DB::statement('DROP INDEX users_phone_verified_unique');

        // Le même numéro sous trois formes : E.164, national espacé, international sans « + ».
        $ancien = $this->compte('+221771234567', '2026-01-01 09:00:00');
        $recent = $this->compte('77 123 45 67', '2026-03-01 09:00:00');
        $milieu = $this->compte('221771234567', '2026-02-01 09:00:00');
        // Égalité de date : l'id le plus grand l'emporte.
        $egalA = $this->compte('+221781111111', '2026-04-01 09:00:00');
        $egalB = $this->compte('78 111 11 11', '2026-04-01 09:00:00');
        // Hors de l'index : un numéro seul, un doublon non vérifié, un doublon supprimé.
        $seul = $this->compte('+221702222222', '2026-01-01 09:00:00');
        $nonVerifie = $this->compte('+221771234567', null);
        $supprime = $this->compte('+221771234567', '2026-05-01 09:00:00');
        $supprime->delete();

        $this->migration(self::RATTRAPAGE)->up();

        $verifie = fn (User $u): bool => DB::table('users')->where('id', $u->id)->value('phone_verified_at') !== null;
        $this->assertTrue($verifie($recent), 'la vérification la plus récente reste');
        $this->assertFalse($verifie($ancien));
        $this->assertFalse($verifie($milieu));
        $this->assertTrue($verifie($egalB), 'à date égale, l’id le plus grand reste');
        $this->assertFalse($verifie($egalA));
        $this->assertTrue($verifie($seul));
        $this->assertFalse($verifie($nonVerifie));
        $this->assertTrue($verifie($supprime), 'un compte supprimé est hors de l’index : on n’y touche pas');
        $this->assertSame('77 123 45 67', DB::table('users')->where('id', $recent->id)->value('phone'), 'le numéro n’est pas réécrit');
        $this->assertSame('+221771234567', DB::table('users')->where('id', $ancien->id)->value('phone'));

        $this->migration(self::INDEX)->up();

        $this->assertTrue($this->indexExiste());
    }

    public function test_sans_doublon_le_rattrapage_ne_touche_rien(): void
    {
        $a = $this->compte('+221771234567', '2026-01-01 09:00:00');
        $b = $this->compte('+221781111111', '2026-02-01 09:00:00');
        $avant = DB::table('users')->orderBy('id')->get(['id', 'phone', 'phone_verified_at', 'updated_at'])->toArray();

        $this->migration(self::RATTRAPAGE)->up();

        $this->assertEquals($avant, DB::table('users')->orderBy('id')->get(['id', 'phone', 'phone_verified_at', 'updated_at'])->toArray());
        $this->assertTrue($this->indexExiste());
    }
}
