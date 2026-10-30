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

    public function test_ac1_sans_cle_dediee_l_empreinte_reste_celle_d_avant_tck_2414(): void
    {
        $appKey = 'base64:'.base64_encode(str_repeat('k', 32));
        $avant = hash_hmac('sha256', '+221771234567', 'radar-phone|'.$appKey);

        foreach ([null, ''] as $vide) {
            config(['app.key' => $appKey, 'radar.phone_hmac_key' => $vide]);
            $this->assertSame($avant, RadarPhone::hmac('+221771234567'));
            $this->assertFalse(RadarPhone::hasDedicatedKey());
        }

        config(['radar.phone_hmac_key' => 'cle-dediee']);
        $this->assertTrue(RadarPhone::hasDedicatedKey());
    }

    public function test_les_empreintes_reconnues_couvrent_la_cle_courante_les_anciennes_et_le_repli_sur_app_key(): void
    {
        config([
            'radar.phone_hmac_key' => 'cle-deux',
            'radar.phone_hmac_previous_keys' => ['cle-une'],
            'app.key' => 'base64:courante',
            'app.previous_keys' => ['base64:ancienne'],
        ]);
        $h = fn (string $key): string => hash_hmac('sha256', '+221771234567', $key);

        $this->assertSame(
            [$h('cle-deux'), $h('cle-une'), $h('radar-phone|base64:courante'), $h('radar-phone|base64:ancienne')],
            RadarPhone::hmacs('+221771234567'),
        );
        $this->assertSame(RadarPhone::hmac('+221771234567'), RadarPhone::hmacs('+221771234567')[0], 'la clé courante d\'abord');
    }

    public function test_sans_cle_dediee_l_empreinte_courante_n_est_pas_doublee(): void
    {
        config(['radar.phone_hmac_key' => null, 'radar.phone_hmac_previous_keys' => [], 'app.key' => 'base64:courante', 'app.previous_keys' => []]);

        $this->assertSame([RadarPhone::hmac('+221771234567')], RadarPhone::hmacs('+221771234567'));
    }

    public function test_la_configuration_lit_la_cle_et_les_anciennes_cles_dans_l_environnement(): void
    {
        $variables = ['RADAR_PHONE_HMAC_KEY' => 'cle-deux', 'RADAR_PHONE_HMAC_PREVIOUS_KEYS' => 'cle-une, cle-zero,'];
        $avant = [];
        foreach ($variables as $nom => $valeur) {
            $avant[$nom] = [$_SERVER[$nom] ?? null, $_ENV[$nom] ?? null];
            $_SERVER[$nom] = $_ENV[$nom] = $valeur;
        }

        try {
            $radar = require config_path('radar.php');
        } finally {
            foreach ($avant as $nom => [$server, $env]) {
                unset($_SERVER[$nom], $_ENV[$nom]);
                if ($server !== null) {
                    $_SERVER[$nom] = $server;
                }
                if ($env !== null) {
                    $_ENV[$nom] = $env;
                }
            }
        }

        $this->assertSame('cle-deux', $radar['phone_hmac_key']);
        $this->assertSame(['cle-une', 'cle-zero'], $radar['phone_hmac_previous_keys']);
    }
}
