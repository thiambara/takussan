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
            'chiffres arabes' => ['٤٥٠٠٠٠ F / mois', 450_000, 'monthly'],
            'chiffres pleine chasse' => ['４５０ ０００ F', 450_000, null],
            'séparateur décimal arabe' => ['١٫٥ M', 1_500_000, null],
            '1 M 5 espacé' => ['1 M 5', 1_500_000, null],
            '1 000 K groupé' => ['1 000 K', 1_000_000, null],
            // Revue : une surface n'est pas un million abrégé, et n'est pas un prix.
            '300m2 puis le prix' => ['300m2 450 000 F', 450_000, null],
            'villa 300m2 à 75 000 000' => ['villa 300m2 à 75 000 000', 75_000_000, null],
            '300 m² puis le prix' => ['300 m² 450 000', 450_000, null],
            // Revue : le premier nombre n'est pas forcément le prix.
            'chambres puis le prix' => ['3 chambres 450 000 F', 450_000, null],
            'R+1 collé' => ['Villa R+1 à 85 millions', 85_000_000, null],
            'T3 collé' => ['T3 450 000', 450_000, null],
            'R+1 sans marque' => ['R+1 450 000', 450_000, null],
            'numéro collé puis prix sans marque' => ['Appeler le 771234567, 450 000', 450_000, null],
            'âge du bien' => ['Villa 5 ans, 450 000', 450_000, null],
            'téléphone puis prix' => ['77 123 45 67 — 450 000 F', 450_000, null],
            'deux montants marqués : le premier' => ['450 000 F, caution 900 000 F', 450_000, null],
            // Revue : la période est celle qui suit le montant retenu, pas la première du texte.
            'caution en mois sans période' => ['45M, caution 2 mois', 45_000_000, null],
            'mois entre parenthèses' => ['45 000 000 F (négociable, 2 mois)', 45_000_000, null],
            'caution puis loyer journalier' => ['caution 2 mois, 450 000 F/jour', 450_000, 'daily'],
            "l'an" => ["1 200 000 F l'an", 1_200_000, 'yearly'],
            // Revue : la période attachée l'emporte ; une caution, une avance ne sont pas le prix.
            'caution puis loyer mensuel' => ['Caution 900 000 F, loyer 450 000 F/mois', 450_000, 'monthly'],
            'avance puis loyer mensuel' => ['Avance 3 mois: 1 350 000 F, loyer 450 000 F/mois', 450_000, 'monthly'],
            'frais puis loyer mensuel' => ['Frais de dossier 100 000 F, loyer 450 000 F/mois', 450_000, 'monthly'],
            'caution sans période écartée' => ['Caution 900 000 F, prix 450 000 F', 450_000, null],
            'dépôt de garantie écarté' => ['Dépôt de garantie : 900 000 F. Loyer 450 000 F', 450_000, null],
            'caution seule reste un montant' => ['Caution 900 000 F', 900_000, null],
            'tiret qui n\'est pas une fourchette' => ['3-4 chambres, 450 000 F', 450_000, null],
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
            'surface seule' => ['120 m2'],
            'surface collée' => ['15m2'],
            'surface en exposant' => ['15 m²'],
            'téléphone seul' => ['77 123 45 67'],
            'téléphone collé seul' => ['Tél 771234567'],
            'décimale nue' => ['1.5'],
            'durée seule' => ['2 ans'],
            'plusieurs nombres sans marque' => ['450 000 ou 500 000'],
            'fourchette au tiret' => ['350 000 - 400 000 F'],
            'fourchette collée' => ['350 000-400 000 F'],
            'fourchette en toutes lettres' => ['de 350 000 à 400 000 F'],
            'fourchette au' => ['350 000 au 400 000 F/mois'],
        ];
    }

    #[DataProvider('illisibles')]
    public function test_rien_de_lisible_rend_null(string $text): void
    {
        $this->assertNull(RadarAmountParser::parse($text));
    }

    /** @return array<string, array{string}> */
    public static function telephones(): array
    {
        $formes = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/fixtures/ai/donnees-personnelles.json'), true, flags: JSON_THROW_ON_ERROR);

        return array_map(fn (string $forme): array => [$forme], $formes['telephones']);
    }

    /**
     * TCK-2412 (AC1) — un nombre que le masqueur lit comme un numéro (sénégalais, étranger) n'est pas un montant,
     * et le prix voisin reste lu.
     */
    #[DataProvider('telephones')]
    public function test_un_numero_du_fixture_n_est_jamais_un_prix(string $forme): void
    {
        $this->assertNull(RadarAmountParser::parse("Appelez le {$forme} pour la villa"));
        $this->assertSame(['amount' => 450_000, 'period' => 'monthly'], RadarAmountParser::parse("Appelez le {$forme}, loyer 450 000 F/mois"));
    }

    public function test_un_numero_etranger_ou_un_lien_whatsapp_n_est_pas_un_prix(): void
    {
        // TCK-2412 : le « prix » de onze chiffres d'un numéro étranger collé.
        $this->assertNull(RadarAmountParser::parse('Appelez le 0033612345678 pour la villa'));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Appelez le +44 7700 900123, loyer 450 000'));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('wa.me/33612345678 loyer 450 000'));
    }

    public function test_sejour_n_est_pas_une_periode_journaliere(): void
    {
        $this->assertSame(['amount' => 200_000, 'period' => null], RadarAmountParser::parse('200 000 F le séjour'));
    }
}
