<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\RadarAmountParser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2386 (ADR-0077 §5, AC4) — le prix tel qu'écrit dans une annonce, lu par du code : le modèle
 * recopie « 1M5 », le parseur rend 1 500 000 XOF.
 */
class RadarAmountParserTest extends TestCase
{
    /** @return array<string, array{string, int, ?string}> */
    public static function montants(): array
    {
        return [
            '1M5' => ['1M5', 1_500_000, null],
            '1m5 minuscule' => ['1m5', 1_500_000, null],
            '2M250' => ['2M250', 2_250_000, null],
            '1,5M' => ['1,5M', 1_500_000, null],
            '1.5 million' => ['1.5 million', 1_500_000, null],
            '1.5 millions' => ['1.5 millions', 1_500_000, null],
            '45 millions' => ['45 millions', 45_000_000, null],
            '350K' => ['350K', 350_000, null],
            '350 mille' => ['350 mille', 350_000, null],
            '2 milliards' => ['2 milliards', 2_000_000_000, null],
            '450.000f/mois' => ['450.000f/mois', 450_000, 'monthly'],
            '450 000 FCFA par mois' => ['450 000 FCFA par mois', 450_000, 'monthly'],
            'espace insécable' => ["450\u{00A0}000 F CFA / mois", 450_000, 'monthly'],
            '25.000.000' => ['25.000.000', 25_000_000, null],
            '25 000 000 F' => ['25 000 000 F', 25_000_000, null],
            '35 000/jour' => ['35 000/jour', 35_000, 'daily'],
            'la nuitée' => ['25 000 la nuitée', 25_000, 'daily'],
            'par semaine' => ['100 000 par semaine', 100_000, 'weekly'],
            '/an' => ['3 000 000/an', 3_000_000, 'yearly'],
            'par année' => ['3 000 000 F par année', 3_000_000, 'yearly'],
            'nombre nu' => ['5000', 5_000, null],
            'chiffres arabes' => ['٤٥٠٠٠٠ ف / mois', 450_000, 'monthly'],
            'chiffres pleine chasse' => ['４５０ ０００ F', 450_000, null],
            'séparateur décimal arabe' => ['١٫٥ M', 1_500_000, null],
        ];
    }

    #[DataProvider('montants')]
    public function test_un_montant_ecrit_devient_des_xof(string $text, int $amount, ?string $period): void
    {
        $this->assertSame(['amount' => $amount, 'period' => $period], RadarAmountParser::parse($text));
    }

    /** @return array<string, array{string}> */
    public static function illisibles(): array
    {
        return [
            'vide' => [''],
            'blancs' => ['   '],
            'à débattre' => ['Prix à débattre'],
            'période seule' => ['la nuitée'],
            'zéro' => ['0 F'],
            'déraisonnablement long' => ['99999999999999999999 F'],
            'multiplicateur qui déborde' => ['999999999999 milliards'],
            'bruit' => ['%%%--///'],
        ];
    }

    #[DataProvider('illisibles')]
    public function test_rien_de_lisible_rend_null(string $text): void
    {
        $this->assertNull(RadarAmountParser::parse($text));
    }

    public function test_un_m2_n_est_pas_un_million(): void
    {
        $this->assertSame(['amount' => 15, 'period' => null], RadarAmountParser::parse('15 m²'));
    }

    public function test_sejour_n_est_pas_une_periode_journaliere(): void
    {
        $this->assertSame(['amount' => 200_000, 'period' => null], RadarAmountParser::parse('200 000 F le séjour'));
    }
}
