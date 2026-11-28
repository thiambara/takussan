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
            // Tout le repli, caractère par caractère : un invisible ou une série de chiffres qu'il cesserait de replier change
            // l'empreinte d'une annonce déjà connue (contre-vérification de TCK-3004 : sans U+00AD, ce test restait vert).
            'trait d\'union conditionnel' => ["Villa Fann 77\u{00AD}123\u{00AD}45\u{00AD}67 jar\u{00AD}din",
                '6710c39890dad60373ecbf2e1067f6e9891c1b97d416b7520f1c3342c51f5096', ['+221771234567' => $fictif]],
            'joints et espace insécable' => ["Studio\u{00A0}Ouakam 78\u{2060}012\u{200B}34\u{FEFF}56\u{00A0}\u{00A0}cuisine\u{200C}\u{200D}",
                'b8310a5e2d436d0b75a6f399b3cb6e25ad066a823b8fd1b1396c0890ab7c62f0', [
                    '+221780123456' => 'cc523a81fb899287bf6cb789833cb27ade601a2985b96b5bbb18e82da44c809b',
                ]],
            'chiffres persans' => ['Appartement Point E ۷۰ ۱۲۳ ۴۵ ۶۷ loyer ۲۵۰ ۰۰۰',
                '67237e4aa995c8c57e3bc5e7b3fc6b1a5d58f6b5d5988addc54a4dcf80660688', [
                    '+221701234567' => '7dfa54474d91429919bd556d2468554b2da6e7cf19d648ba14a9223196e84c3e',
                ]],
            'chiffres devanagari' => ['Chambre Yoff ७६ ०१२ ३४ ५६ calme',
                '3d8340b691fcf51c81795d5d42eba05249f9331a6a1cfd4897e6400c300e3311', [
                    '+221760123456' => '26391d6eee91e5acb7ae54a28b65cd448d7e5571f5da11a56e53a15b7f25a42d',
                ]],
            '+221 collé' => ['Magasin Sandaga +221771234567 ou +22133 821 00 00',
                '8893c5506322c0af13299a3d379db9b4787efb67a67c4ebfddea53cfcfd74079', [
                    '+221771234567' => $fictif,
                    '+221338210000' => 'b9405e27ebafa3d839a42bbece115a1ccf8653e1a81354457024b788d8b42334',
                ]],
            '+ et chiffres pleine chasse' => ["Bureau ＋２２１ ７５ ０１２ ３４ ５６\u{202F}libre",
                '728ea8d10d7e93310debb9757eaae2df09132a0ae8c18ee3821634729b076512', [
                    '+221750123456' => '440795d61d05ecdf0af6ae54e2502bdd2863f7db186af5d87bbdccbf058729f9',
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

    /**
     * La clé de `phone_hmac` est `RadarPhone::canonical()` : chaque écriture isolée qu'il reconnaissait avant TCK-3004 (valeurs
     * relevées sur `dev` 4e3a929f7) donne la même forme E.164, sinon le refus STOP qu'elle porte n'est plus retrouvé.
     *
     * @return array<string, array{string, ?string}>
     */
    public static function ecritures(): array
    {
        return [
            'trait d\'union conditionnel' => ["77\u{00AD}123\u{00AD}45\u{00AD}67", '+221771234567'],
            'espace de largeur nulle' => ["+221\u{200B}78 012 34 56", '+221780123456'],
            'BOM et joint de mots' => ["\u{FEFF}00221\u{2060}70 123 45 67", '+221701234567'],
            'chiffres persans' => ['۷۶ ۱۲۳ ۴۵ ۶۷', '+221761234567'],
            'chiffres arabes-indiens' => ['٣٣ ٨٢١ ٠٠ ٠٠', '+221338210000'],
            'chiffres devanagari collés' => ['७७१२३४५६७', '+221771234567'],
            'espaces insécables' => ["77\u{00A0}123\u{00A0}45\u{00A0}67", '+221771234567'],
            '+221 collé' => ['+221771234567', '+221771234567'],
            '(0) de trunk' => ['+221(0)77 123 45 67', '+221771234567'],
            '+ et chiffres pleine chasse' => ['＋２２１７７１２３４５６７', '+221771234567'],
            'étranger' => ['+33 6 12 34 56 78', null],
            'préfixe 74 non attribué' => ['74 123 45 67', null],
        ];
    }

    #[DataProvider('ecritures')]
    public function test_une_ecriture_isolee_garde_sa_forme_canonique(string $ecriture, ?string $e164): void
    {
        $this->assertSame($e164, RadarPhone::canonical($ecriture));
    }

    /** Un texte qui n'est pas de l'UTF-8 se replie en rien, comme avant : son empreinte est celle du texte vide. */
    public function test_un_texte_invalide_se_replie_en_rien(): void
    {
        $this->assertSame('', RadarListingIntake::foldText("Tel 77 123 45 67 \xff"));
        $this->assertSame([], RadarPhone::fromText("Tel 77 123 45 67 \xff"));
    }
}
