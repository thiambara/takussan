<?php

namespace Tests\Unit\Support;

use App\Support\PhoneMasker;
use App\Support\RadarPhone;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** TCK-2386 (ADR-0077 §1, §9) — les numéros d'une annonce en E.164, et l'empreinte à clé qui survit au STOP. */
class RadarPhoneTest extends TestCase
{
    public function test_les_formes_d_un_meme_numero_donnent_le_meme_e164(): void
    {
        foreach ([
            '77 123 45 67', '+221 77 123 45 67', '00221771234567', '221771234567', '77/123/45/67',
            '77.123.45.67', "77\u{00A0}123\u{00A0}45\u{00A0}67", "77\u{200B}123 45 67", '77-12-34-567',
        ] as $forme) {
            $this->assertSame(['+221771234567'], RadarPhone::fromText("Appelez le {$forme} svp"), $forme);
        }
    }

    public function test_le_prefixe_71_est_lu_comme_par_le_masquage(): void
    {
        $this->assertSame(['+221711234567'], RadarPhone::fromText('Tel : 71 123 45 67'));
    }

    public function test_les_chiffres_arabes_et_pleine_chasse_sont_lus(): void
    {
        $this->assertSame(['+221771234567'], RadarPhone::fromText('٧٧ ١٢٣ ٤٥ ٦٧'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('７７ １２３ ４５ ６７'));
    }

    public function test_deux_numeros_donnent_deux_entrees_dans_l_ordre_et_sans_doublon(): void
    {
        $texte = 'Moi 78 765 43 21, ou 77 123 45 67. Encore 78 765 43 21 et fixe 33 821 00 00.';

        $this->assertSame(['+221787654321', '+221771234567', '+221338210000'], RadarPhone::fromText($texte));
    }

    public function test_la_fin_d_un_numero_etranger_n_est_pas_un_numero_senegalais(): void
    {
        // T1 (revue finale) : le motif trouvait `77 123 45 67` au milieu de ces numéros.
        $this->assertSame([], RadarPhone::fromText('WhatsApp +1 77 123 45 67 89'));
        $this->assertSame([], RadarPhone::fromText('Appelez le 0033 771234567'));
        $this->assertSame([], RadarPhone::fromText('Tel : +33 6 77 12 34 56 7'));

        // L'indicatif sénégalais, et deux numéros côte à côte, restent lus.
        $this->assertSame(['+221771234567'], RadarPhone::fromText('Tel +221 77 123 45 67'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('Tel 00221 771234567'));
        $this->assertSame(['+221771234567', '+221781234567'], RadarPhone::fromText('771234567 781234567'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('+33 6 12 34 56 78 ou 77 123 45 67'));

        // Un groupe de milliers n'est pas un indicatif : `00` suivi de `0` n'en est jamais un (aucun pays ne commence par 0).
        $this->assertSame(['+221771234567'], RadarPhone::fromText('Loyer 450 000 77 123 45 67'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('Prix 25.000.000 77 123 45 67'));
    }

    public function test_un_prix_ou_un_texte_sans_numero_ne_donne_rien(): void
    {
        $this->assertSame([], RadarPhone::fromText('Loyer 450.000f par mois, caution 900 000 FCFA'));
        $this->assertSame([], RadarPhone::fromText('Aucun contact ici, 300 000 000 de vues'));
        $this->assertSame([], RadarPhone::fromText(''));
    }

    public function test_canonical_d_un_numero_isole(): void
    {
        $this->assertSame('+221771234567', RadarPhone::canonical(' 77 123 45 67 '));
        $this->assertSame('+221771234567', RadarPhone::canonical('+221771234567'));
        $this->assertSame('+221771234567', RadarPhone::canonical('00221 77 123 45 67'));
        $this->assertSame('+221338210000', RadarPhone::canonical('33 821 00 00'));
        $this->assertNull(RadarPhone::canonical('450.000f'));
        $this->assertNull(RadarPhone::canonical('+33612345678'));
        $this->assertNull(RadarPhone::canonical('12345'));
        $this->assertNull(RadarPhone::canonical('55 123 45 67'));
        $this->assertNull(RadarPhone::canonical('+221 551234567'));
        $this->assertNull(RadarPhone::canonical(''));
        $this->assertNull(RadarPhone::canonical('77 123 45 67 et 78 765 43 21'));
    }

    /**
     * TCK-2412 — les formes du fixture partagé avec le masqueur (`tests/fixtures/ai/donnees-personnelles.json`).
     *
     * @return array<string, mixed>
     */
    private static function fixture(string $genre): array
    {
        $formes = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/fixtures/ai/donnees-personnelles.json'), true, flags: JSON_THROW_ON_ERROR);

        return $formes[$genre];
    }

    /** @return array<string, array{string}> */
    public static function telephones(): array
    {
        return array_map(fn (string $forme): array => [$forme], self::fixture('telephones'));
    }

    /** @return array<string, array{string}> */
    public static function pasDesNumeros(): array
    {
        return array_map(fn (string $texte): array => [$texte], self::fixture('pas_personnel'));
    }

    /**
     * TCK-2412 (AC2) — ce que le masqueur voit, le Radar le lit : chaque forme sénégalaise du fixture donne son
     * E.164, chaque forme étrangère rien. Sénégalaise = ses chiffres sont neuf chiffres d'un préfixe du plan,
     * précédés au plus de `221` / `00221` et du `0` d'un `(0)`.
     */
    #[DataProvider('telephones')]
    public function test_une_forme_du_fixture_donne_son_numero_senegalais_ou_rien(string $forme): void
    {
        $chiffres = (string) preg_replace('/[^0-9]/', '', PhoneMasker::normalizeDigits($forme));
        $attendu = preg_match('/^(?:(?:00)?2210?)?((?:3[02369]|7[0-25-9]|93)[0-9]{7})$/', $chiffres, $m) === 1 ? ['+221'.$m[1]] : [];

        $this->assertSame($attendu, RadarPhone::fromText("Appelez le {$forme} ce soir"));
    }

    /** TCK-2412 (AC3) — un prix, une date, une liste, une version ou le fictif `+221 74 …` ne sont pas un contact. */
    #[DataProvider('pasDesNumeros')]
    public function test_un_non_cas_du_fixture_ne_donne_aucun_contact(string $texte): void
    {
        $this->assertSame([], RadarPhone::fromText($texte));
    }

    public function test_les_ecritures_libres_du_masqueur_sont_lues_dans_leur_contexte(): void
    {
        // TCK-2412 : `_`, `,`, préfixe entre parenthèses, espaces doubles, groupement libre derrière `+221`.
        foreach (['Awa 77_123_45_67', '77,123,45,67 Awa', '(77)1234567 Awa', 'Tel (77) 123 45 67.', 'Tel 77  123  45  67',
            'Tel +221 771 234 567', 'Tel +221 - 77 - 123 - 45 - 67', 'Tel 7 7 1 2 3 4 5 6 7', '(+221) 77 123 45 67',
            'wa.me/221771234567', '+221 (0)77 123 45 67'] as $texte) {
            $this->assertSame(['+221771234567'], RadarPhone::fromText($texte), $texte);
        }

        // Un lien WhatsApp ou un numéro étranger que le masqueur voit ne devient pas un contact.
        $this->assertSame([], RadarPhone::fromText('wa.me/33612345678'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('77 123 45 67 +33 6 12 34 56 78'));
        $this->assertSame([], RadarPhone::fromText('Tel 07 71 23 45 67'));
    }

    public function test_un_indicatif_etranger_au_demi_cadratin_ecarte_encore_la_suite(): void
    {
        // TCK-2412 : `PATTERN` lit les tirets Unicode depuis TCK-2410 ; l'indicatif qui les précède aussi.
        $this->assertSame([], RadarPhone::fromText("WhatsApp +1\u{2013}77 123 45 67 89"));
        $this->assertSame([], RadarPhone::fromText("WhatsApp +1\u{2212}77 123 45 67 89"));
        $this->assertSame([], RadarPhone::fromText('WhatsApp (+1) 77 123 45 67 89'));
    }

    public function test_un_plus_devant_un_numero_national_qui_forme_un_indicatif_n_est_pas_lu(): void
    {
        // TCK-2412 : le masqueur lit `+33 820 12 34` et `+30 123 45 67` comme des numéros étrangers ; la plateforme
        // les refuse déjà comme un indicatif manquant (`TelephoneSaisiTest`). Le Radar ne les lit plus comme sénégalais.
        $this->assertSame([], RadarPhone::fromText('Tel +33 820 12 34'));
        $this->assertSame([], RadarPhone::fromText('Tel +30 123 45 67'));
    }

    public function test_canonical_lit_les_separateurs_du_masqueur(): void
    {
        // TCK-2412 (AC4) : demi-cadratin, moins, `_`, `,`, parenthèses, `(0)` de trunk derrière `221`.
        foreach (["77\u{2013}123\u{2013}45\u{2013}67", "77\u{2212}123\u{2212}45\u{2212}67", "77\u{2010}12\u{2010}34\u{2010}567",
            '77_123_45_67', '77,123,45,67', '(77) 123 45 67', '+221 (0)77 123 45 67', '00221(0)771234567'] as $forme) {
            $this->assertSame('+221771234567', RadarPhone::canonical($forme), $forme);
        }
        $this->assertNull(RadarPhone::canonical('+33 (0)6 12 34 56 78'));
        $this->assertNull(RadarPhone::canonical('(0)771234567'));
        $this->assertNull(RadarPhone::canonical('77,123,45,67,89'));
    }

    /**
     * TCK-2412 (AC4) — tout séparateur avec lequel le masqueur lit `77?123?45?67` est lu par le Radar : balayage
     * des code points, pour que `canonical()` ne retarde plus sur `MASK_PATTERN`.
     */
    public function test_chaque_separateur_que_le_masqueur_lit_est_lu_par_le_radar(): void
    {
        $lus = [];
        foreach ([[0x20, 0x33FF], [0xFE00, 0xFFFF]] as [$from, $to]) {
            for ($code = $from; $code <= $to; $code++) {
                if (($code >= 0x30 && $code <= 0x39) || ($code >= 0xD800 && $code <= 0xDFFF)) {
                    continue;
                }
                $c = mb_chr($code, 'UTF-8');
                $texte = "77{$c}123{$c}45{$c}67";
                $normalise = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $texte));
                if (preg_match(PhoneMasker::MASK_PATTERN, $normalise, $m) !== 1 || $m[0] !== $normalise) {
                    continue;
                }
                $lus[] = $code;
                $this->assertSame(['+221771234567'], RadarPhone::fromText($texte), sprintf('U+%04X', $code));
            }
        }

        $this->assertContains(0x2013, $lus);
        $this->assertContains(0x2212, $lus);
        $this->assertContains(0x5F, $lus);
    }

    public function test_hmac_est_stable_hexadecimal_et_depend_de_la_cle(): void
    {
        $a = RadarPhone::hmac('+221771234567');

        $this->assertSame($a, RadarPhone::hmac('+221771234567'));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $a);
        $this->assertNotSame($a, RadarPhone::hmac('+221771234568'));

        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);
        $this->assertNotSame($a, RadarPhone::hmac('+221771234567'));
    }

    public function test_une_cle_dediee_l_emporte_sur_celle_de_l_application(): void
    {
        $derivee = RadarPhone::hmac('+221771234567');

        config(['radar.phone_hmac_key' => 'cle-dediee']);

        $this->assertSame(hash_hmac('sha256', '+221771234567', 'cle-dediee'), RadarPhone::hmac('+221771234567'));
        $this->assertNotSame($derivee, RadarPhone::hmac('+221771234567'));
    }
}
