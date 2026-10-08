<?php

namespace Tests\Feature\Support;

use App\Support\CanonicalPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-589, vérification adverse m5 — `fold()` et `sql()` replient de la même façon, et
 * `sql('phone')` est l'expression de l'index `users_phone_verified_unique` : sans quoi les
 * recherches par numéro vérifié ne l'emprunteraient pas.
 */
class CanonicalPhoneTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string, 1: string}> */
    public static function formes(): array
    {
        return [
            'E.164' => ['+221780143710', '+221780143710'],
            'indicatif après le numéro (TCK-566)' => ['780143710+221', '+221780143710'],
            'espaces' => ['+221 78 014 37 10', '+221780143710'],
            'points et tirets' => ['+221.78-014-37-10', '+221780143710'],
            'préfixe 00' => ['00221780143710', '+221780143710'],
            'douze chiffres sans +' => ['221780143710', '+221780143710'],
            'neuf chiffres nus' => ['780143710', '+221780143710'],
            'étranger inchangé' => ['+33612345678', '+33612345678'],
        ];
    }

    #[DataProvider('formes')]
    public function test_php_et_sql_replient_de_la_meme_facon(string $brut, string $attendu): void
    {
        $this->assertSame($attendu, CanonicalPhone::fold($brut));

        $sql = DB::selectOne('SELECT '.str_replace('phone', '?::text', CanonicalPhone::sql('phone')).' AS f', [$brut]);
        $this->assertSame($attendu, $sql->f);
    }

    public function test_la_recherche_emprunte_l_index_d_unicite(): void
    {
        DB::statement('SET LOCAL enable_seqscan = off');

        $plan = collect(DB::select(
            'EXPLAIN SELECT id FROM users WHERE '.CanonicalPhone::sql('phone').' = ? '
            .'AND phone_verified_at IS NOT NULL AND deleted_at IS NULL',
            ['+221780143710'],
        ))->map(fn ($row) => (array) $row)->flatten()->implode("\n");

        $this->assertStringContainsString('users_phone_verified_unique', $plan);
        // Une condition D'INDEX, pas un filtre : seqscan coupé, le planificateur parcourt
        // l'index partiel même s'il ne sait pas s'en servir pour l'égalité.
        $this->assertStringContainsString('Index Cond', $plan, $plan);
    }
}
