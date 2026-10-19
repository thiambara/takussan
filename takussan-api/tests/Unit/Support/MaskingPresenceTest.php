<?php

namespace Tests\Unit\Support;

use App\Support\Masking;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-954 (ADR-0070 § 3) — `Masking::presence()` dit qu'un montant est saisi, sans rien en garder.
 */
class MaskingPresenceTest extends TestCase
{
    /** @return array<string, array{mixed}> */
    public static function valeursSaisies(): array
    {
        return ['chaîne' => ['800000.00'], 'entier' => [800000], 'zéro' => ['0'], 'flottant' => [12.5]];
    }

    #[DataProvider('valeursSaisies')]
    public function test_une_valeur_saisie_rend_quatre_points_sans_chiffre(mixed $valeur): void
    {
        $this->assertSame('••••', Masking::presence($valeur));
    }

    public function test_une_valeur_absente_rend_null(): void
    {
        $this->assertNull(Masking::presence(null));
        $this->assertNull(Masking::presence(''));
        $this->assertNull(Masking::presence('  '));
    }
}
