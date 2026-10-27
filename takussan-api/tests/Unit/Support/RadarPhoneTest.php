<?php

namespace Tests\Unit\Support;

use App\Support\RadarPhone;
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
