<?php

namespace Tests\Unit\Support\Telephone;

use App\Services\Radar\RadarListingIntake;
use App\Support\RadarPhone;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-3004 (AC4) — les empreintes stockées ne bougent pas quand la lecture des numéros change de place.
 *
 * `radar_listings.content_fingerprint` (unique) se calcule sur le texte replié de `RadarListingIntake::foldText()` : un octet
 * de différence, et une annonce déjà connue rentre une seconde fois. `radar_advertisers.phone_hmac` se calcule sur le numéro
 * que `RadarPhone::fromText()` lit : une écriture qui ne se lit plus, et un refus STOP n'est plus retrouvé (ADR-0081, ADR-0082).
 * Les valeurs ci-dessous ont été relevées sur le code d'AVANT TCK-3004 (`dev` 4e3a929f7), sous une clé posée ici.
 */
class EmpreintesFigeesTest extends TestCase
{
    /** @return array<string, array{string, string, array<string, string>}> */
    public static function textes(): array
    {
        $fictif = '26bb3a0db2fd5d911e50e21b70ae4ff9810e7480d5ba6d0ec05d4f33b7d78406';

        return [
            'chiffres latins' => ['Villa à louer Mermoz, 3 chambres, 450.000F/mois. Tel 77 123 45 67',
                '2cab0e3dae67a914f6bed72f9956d5eafe02cd55aa55d93a6f8dd464b0d1b2ed', ['+221771234567' => $fictif]],
            'indicatifs et étage' => ["Appartement F4 R+1 Ngor\u{00A0}: +221 78 123 45 67 ou 00221 70 123 45 67",
                '5f77b5b8261a87ecabdb24794cf936c0b754dfbcb3a0aa6c1cb19b147eec61a4', [
                    '+221781234567' => '10637e9b3574263234e6080dc289b7e10a00290f255a3b059ad41f7e52c58530',
                    '+221701234567' => '7dfa54474d91429919bd556d2468554b2da6e7cf19d648ba14a9223196e84c3e',
                ]],
            'chiffres arabes-indiens' => ['Studio meublé ٧٧ ١٢٣ ٤٥ ٦٧ — 150 000 FCFA',
                '5a3f51d4b8a2793e903d1de3b3487b9292c044909f1807f99360e52bee62772e', ['+221771234567' => $fictif]],
            'invisibles' => ["Chambre 77\u{200B}123\u{FEFF}45 67 Liberté 6",
                '1cc24b71156a5fac4da431db21e21c1d4e967210182d9773e0b86b86c4753354', ['+221771234567' => $fictif]],
            'pleine chasse et blancs' => ['Terrain ７７ １２３ ４５ ６７  Almadies   300 m²',
                '3fa1a6cf5d18fa6447c6bb2906a79f56b0c961db1d4426e530c511e4f699928e', ['+221771234567' => $fictif]],
            'fixe et étranger' => ["Bureau\tPlateau\n\n33 821 00 00 (fixe) ou +33 6 12 34 56 78",
                '134ca62fc28c7eb801d810871c09ae7f54f0b67d8329edfdf1edf71ba78dd381', [
                    '+221338210000' => 'b9405e27ebafa3d839a42bbece115a1ccf8653e1a81354457024b788d8b42334',
                ]],
            'lien WhatsApp' => ['Duplex VDN wa.me/221771234567 prix 2M5',
                '79d117ee8b93dec75f2abc109bab8ef4311852c7b919e2c56aaf7a45b37ebe48', ['+221771234567' => $fictif]],
            'parenthèses et tirets' => ['Maison R+2 Sacré-Cœur (77) 123 45 67 / 76-123-45-67',
                'ed65e29e2ded9dc5b94d01cf4f14852c66a1a4f04164c0bc45141fac6c04cb1c', [
                    '+221771234567' => $fictif,
                    '+221761234567' => '2ff29f77215c0440936ddc4697fa2a2038937d336b502eb7eb4ed1524ade6258',
                ]],
        ];
    }

    /** @param  array<string, string>  $hmacs */
    #[DataProvider('textes')]
    public function test_les_empreintes_d_un_texte_fige_ne_changent_pas(string $texte, string $empreinte, array $hmacs): void
    {
        config(['radar.phone_hmac_key' => 'cle-des-empreintes-figees']);

        $this->assertSame($empreinte, hash('sha256', 'text|'.RadarListingIntake::foldText($texte)));
        $this->assertSame($hmacs, array_combine(
            $lus = RadarPhone::fromText($texte),
            array_map(RadarPhone::hmac(...), $lus),
        ));
    }

    /** Un texte qui n'est pas de l'UTF-8 se replie en rien, comme avant : son empreinte est celle du texte vide. */
    public function test_un_texte_invalide_se_replie_en_rien(): void
    {
        $this->assertSame('', RadarListingIntake::foldText("Tel 77 123 45 67 \xff"));
        $this->assertSame([], RadarPhone::fromText("Tel 77 123 45 67 \xff"));
    }
}
