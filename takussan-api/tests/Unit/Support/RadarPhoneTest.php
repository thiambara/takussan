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
        $this->assertSame($attendu, RadarPhone::contactsFromText("Appelez le {$forme} ce soir"));
    }

    /** TCK-2412 (AC3) — un prix, une date, une liste, une version ou le fictif `+221 74 …` ne sont pas un contact. */
    #[DataProvider('pasDesNumeros')]
    public function test_un_non_cas_du_fixture_ne_donne_aucun_contact(string $texte): void
    {
        $this->assertSame([], RadarPhone::fromText($texte));
        $this->assertSame([], RadarPhone::contactsFromText($texte));
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

    public function test_un_plus_devant_un_numero_national_n_en_fait_pas_un_contact_d_office(): void
    {
        // TCK-2412 : le masqueur lit `+33 820 12 34` et `+30 123 45 67` comme des numéros étrangers ; la plateforme
        // refuse déjà ces saisies comme un indicatif manquant (`TelephoneSaisiTest`), `+77 …` et `00 77 …` compris.
        // Aucun n'est un contact d'office : tout préfixe sénégalais commence par un indicatif (3x, 7, 93).
        foreach (['Tel +33 820 12 34', 'Tel +30 123 45 67', 'Tel +77 123 45 67', 'Tel 00 77 123 45 67'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }
        // Contre-vérification C1 : le refus STOP et l'opérateur, eux, les lisent (`fromText()`).
        $this->assertSame(['+221771234567'], RadarPhone::fromText('Tel +77 123 45 67'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('Tel 00 77 123 45 67'));
        // L'indicatif sénégalais, même écarté du `+` de trois espaces, reste un contact.
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Tel +   221 77 123 45 67'));
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Tel +2 2 1 7 7 1 2 3 4 5 6 7'));
        // Une décimale ou un millier devant n'est pas un `00` d'indicatif.
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Note 1.00 7 77 123 45 67'));
    }

    /** Contre-vérification C1 — un `+` qui joint deux numéros, ou qui suit un mot, ne cache pas le second au refus STOP. */
    public function test_un_plus_entre_deux_numeros_ne_cache_pas_le_second_a_la_lecture_large(): void
    {
        $this->assertSame(['+221771234567', '+221787654321'], RadarPhone::fromText('Contact : 77 123 45 67 + 78 765 43 21'));
        $this->assertSame(['+221771234567', '+221787654321'], RadarPhone::fromText('Tel 77 123 45 67 +78 765 43 21'));
        $this->assertSame(['+221771234567'], RadarPhone::fromText('WhatsApp + 77 123 45 67'));
    }

    /**
     * Vérification adverse B1 — un numéro étranger écrit chiffre à chiffre ne devient pas un contact d'office. La lecture
     * large (`fromText()`) peut en tirer un numéro recollé : il ne coûte au pire qu'un refus STOP par excès (C1).
     */
    public function test_un_numero_etranger_ecrit_chiffre_a_chiffre_ne_devient_pas_un_contact(): void
    {
        foreach (['+33 7 7 1 2 3 4 5 6 7', 'Tel +33 7 7 1 2 3 4 5 6 7 villa à louer 450 000', '00 33 7 7 1 2 3 4 5 6 7',
            '+39 3 3 3 1 2 3 4 5 6 7', '+32 4 7 0 1 2 3 4 5 6', '+30 6 9 1 2 3 4 5 6 7 8', '+36 2 0 1 2 3 4 5 6 7',
            '+93 7 0 1 2 3 4 5 6 7', '+   33 77 123 45 67', 'Tel+33 7 7 1 2 3 4 5 6 7', '+3 3 7 7 1 2 3 4 5 6 7'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }
    }

    /**
     * B1 — balayage : `+`, `+ `, `00`, `00 ` devant tout indicatif de 1 à 999 (ceux du masqueur compris), puis un
     * numéro sénégalais en groupes, collé, à espaces doubles ou chiffre à chiffre : jamais un contact d'office.
     * `221` seul l'est.
     */
    public function test_aucun_indicatif_devant_un_numero_n_en_fait_un_contact_senegalais(): void
    {
        $suites = ['77 123 45 67', '7 7 1 2 3 4 5 6 7', '77  123  45  67', '771234567'];
        foreach (['+', '+ ', '00', '00 '] as $avant) {
            foreach ($suites as $suite) {
                $this->assertSame(['+221771234567'], RadarPhone::contactsFromText("Tel {$avant}221 {$suite} villa"), "{$avant}221 {$suite}");
            }
            for ($indicatif = 1; $indicatif <= 999; $indicatif++) {
                if ($indicatif === 221) {
                    continue;
                }
                foreach ([...array_map(fn (string $suite): string => "{$indicatif} {$suite}", $suites), "{$indicatif}771234567"] as $numero) {
                    $this->assertSame([], RadarPhone::contactsFromText("Tel {$avant}{$numero} villa"), "{$avant}{$numero}");
                }
            }
        }
    }

    /** Vérification adverse I1 — `R+1` (rez-de-chaussée plus un) devant le numéro n'est pas un indicatif. */
    public function test_un_etage_r_plus_un_devant_le_numero_ne_le_fait_pas_perdre(): void
    {
        foreach (['Villa (R+1) 77 123 45 67', "Villa (R+1)\n77 123 45 67", 'Villa R+1,77 123 45 67', 'Villa R+1_77 123 45 67',
            'Immeuble R+3,77 123 45 67', 'Villa R+1 77 123 45 67', "Villa R+2\n77 123 45 67", 'Immeuble R+10 77 123 45 67',
            'Appartement F3+1 77 123 45 67', 'Villa R+1+terrasse 77 123 45 67'] as $texte) {
            $this->assertSame(['+221771234567'], RadarPhone::fromText($texte), $texte);
        }
    }

    /** TCK-2435 — `RDC+1` et `R + 1` (espacé) devant le numéro ne sont pas un indicatif non plus ; `R + 33 …` en reste un. */
    public function test_un_etage_rdc_ou_espace_devant_le_numero_ne_le_fait_pas_perdre(): void
    {
        foreach (['Villa RDC+1 77 123 45 67', 'Villa Rdc+2 77 123 45 67', 'Villa R + 1 77 123 45 67', 'Villa R +1 77 123 45 67',
            'Villa R+ 1 77 123 45 67', 'Immeuble RDC + 10 77 123 45 67', 'Villa (RDC+1) 77 123 45 67'] as $texte) {
            $this->assertSame(['+221771234567'], RadarPhone::fromText($texte), $texte);
            $this->assertSame(['+221771234567'], RadarPhone::contactsFromText($texte), $texte);
        }

        // Un vrai numéro étranger derrière ces écritures n'est ni lu comme un étage, ni comme un contact sénégalais.
        foreach (['Villa RDC+33 6 12 34 56 78', 'Villa R + 33 6 12 34 56 78', 'Villa R +33 6 12 34 56 78', 'Villa RDC+33612345678'] as $texte) {
            $this->assertSame([], RadarPhone::fromText($texte), $texte);
        }

        // Vérification 2 : un `+1` / `+7` suivi d'un numéro complet garde son `+`, la fin n'est pas un contact sénégalais.
        foreach (['RDC +1 70 123 45 67 8', 'RDC +1 77 012 34 56 7', 'R+1 70 123 45 67 8'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }
        // `R+17`, `RDC+17` : l'étage 17, pas `+1` suivi de dix chiffres.
        foreach (['Immeuble R+17 77 012 34 56', 'Immeuble RDC+17 77 012 34 56'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }
    }

    /** TCK-2445 — un `+7` à zone entre parenthèses derrière un étage garde son `+` : ni contact, ni refus sénégalais. */
    public function test_un_numero_sept_a_zone_entre_parentheses_derriere_un_etage_n_est_pas_un_contact(): void
    {
        foreach (['RDC +7 (495) 123-45-67 F', 'R + 7 (495) 123-45-67 F', 'R +7 (812) 123-45-67 XOF', 'RDC +7 (912) 345-67-89 F',
            'RDC+7 (495)1234567 F', 'RDC +7 (770) 123 45 67 F', 'RDC +7 (701) 234 56 78 F', 'R + 7 (770) 123-45-67 F',
            'RDC+7 (770)1234567 F', 'RDC +7 (295) 770-12-34 F', 'Contact +7 (7701) 23-45-67', 'Contact +7 (77012) 3-45-67'] as $texte) {
            $this->assertSame([], RadarPhone::fromText($texte), $texte);
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }
        // Le `+` de ces numéros n'est pas neutralisé comme celui d'un étage.
        $this->assertSame('RDC +7 (495) 123-45-67 F', RadarPhone::withoutFloorPlus('RDC +7 (495) 123-45-67 F'));
        $this->assertSame('R+7 (495) 123-45-67 F', RadarPhone::withoutFloorPlus('R+7 (495) 123-45-67 F'));
    }

    /**
     * TCK-2441 — derrière un `R` collé, un numéro étranger complet garde son `+` : `Villa R+33 6 12 34 56 78` se lisait
     * `33 6 12 34 56`, un fixe sénégalais. Les étages de 0 à 19 gardent leur contact (tests ci-dessus).
     */
    public function test_un_numero_etranger_colle_derriere_r_n_est_pas_un_contact_senegalais(): void
    {
        foreach (['Villa R+33 6 12 34 56 78', 'villa r+33 7 12 34 56 78', 'Villa (R+33 6 12 34 56 78)', 'Villa R+44 77 123 45 67',
            'Villa R+32 470 12 34 56', 'Villa R+33 6 12 34 56 78 3 chambres', 'Villa R+33 6 12 34 56 78 F'] as $texte) {
            $this->assertSame([], RadarPhone::fromText($texte), $texte);
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
            $this->assertSame($texte, RadarPhone::withoutFloorPlus($texte), $texte);
        }
        // Chiffre à chiffre, comme sans `R` (B1) : jamais un contact d'office ; la lecture large le garde pour le refus STOP.
        $this->assertSame([], RadarPhone::contactsFromText('Villa R+33 7 7 1 2 3 4 5 6 7'));

        // Un étage de 20 ou plus qui n'est pas un indicatif garde son contact. Décision : `R+20` (l'Égypte) suivi d'un
        // numéro est lu comme un numéro égyptien, et le contact est perdu plutôt qu'un faux inventé.
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Immeuble R+25 77 123 45 67'));
        $this->assertSame([], RadarPhone::contactsFromText('Immeuble R+20 77 123 45 67'));
    }

    /**
     * TCK-2447 — derrière l'étage `1` ou `7`, `(221)` suivi d'un numéro sénégalais est l'indicatif, pas une zone : le
     * `+` reste celui de l'étage, et le contact n'est plus perdu.
     */
    public function test_l_indicatif_221_entre_parentheses_derriere_un_etage_garde_le_contact(): void
    {
        foreach (['Villa R+1 (221) 77 012 34 56', 'Villa R+7 (221) 77 012 34 56', 'Villa RDC +1 (221) 77 012 34 56',
            'Villa R + 1 (221)77 012 34 56', 'Villa R+1 (221)-77-012-34-56', 'Villa (R+1) (221) 77 012 34 56'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::fromText($texte), $texte);
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }
        $this->assertSame(['+221338210000'], RadarPhone::contactsFromText('Villa R+1 (221) 33 821 00 00'));
    }

    /**
     * TCK-2451 — derrière l'étage `1` ou `7`, l'indicatif `00221` ou `221` nu, et `(221)` devant un numéro groupé 2-2-3-2, ne
     * sont pas la suite d'un numéro `+1` / `+7` : le `+` reste celui de l'étage, et le contact n'est plus perdu.
     */
    public function test_un_chiffre_seul_derriere_un_numero_chiffre_a_chiffre_n_entre_pas_dans_le_contact(): void
    {
        // TCK-2454 : le chiffre à chiffre se lisait décalé d'un chiffre (`+221701234562`), un numéro écrit nulle part.
        foreach (['Villa 7 7 0 1 2 3 4 5 6 2 salons', 'Villa 7 7 0 1 2 3 4 5 6 1 salon', 'Villa 7 7 0 1 2 3 4 5 6 3 villas',
            'Villa 7 7 0 1 2 3 4 5 6 2', 'Villa R+1 (221) 7 7 0 1 2 3 4 5 6 2 salons', 'Villa R+1 221 7 7 0 1 2 3 4 5 6 1 salon',
            'Villa 221 7 7 0 1 2 3 4 5 6 3 villas', 'Villa (221) 7 7 0 1 2 3 4 5 6 2 salons'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }

        // Le chiffre de l'étage n'est pas le premier du numéro.
        $this->assertSame(['+221770123456'], RadarPhone::contactsFromText('Villa R+7 7 7 0 1 2 3 4 5 6'));
        // Derrière l'étage, ces neuf chiffres sont bien écrits à la suite.
        $this->assertSame(['+221701234562'], RadarPhone::contactsFromText('Villa R+7 7 0 1 2 3 4 5 6 2 salons'));

        // Une liste que le décalage ne lit pas reste une liste.
        $this->assertSame([], RadarPhone::contactsFromText('7 1 2 3 4 5 6 7 8 9'));

        // Limite : groupé derrière un chiffre seul, qui peut être un compte.
        $this->assertSame(['+221701234562'], RadarPhone::contactsFromText('Villa 7 70 12 34 56 2 salons'));
    }

    public function test_une_barre_entre_deux_groupes_ecrits_autrement_ne_recolle_pas_un_contact(): void
    {
        // TCK-2454 : deux numéros englobés par le masque, pas un seul. `fromText` les lit encore, pour le refus STOP.
        foreach (['Villa R+1 00221 77 012 34/78 1', 'Villa R+1 00221 77 012 34/78', 'Tel 00221 77 012 34 / 33 821 00 00 F',
            'Tel 30/221 77 01 234 56 000 F', 'Tel 30 0022177 012 34 56 000 F'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }
        $this->assertSame(['+221770123478'], RadarPhone::fromText('Villa R+1 00221 77 012 34/78 1'));

        foreach (['Tel 77/012/34/56', 'Tel 00221 77/012/34/56', 'Tel 221/77 012 34 56', 'Tel +221/77 012 34 56'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }
    }

    public function test_neuf_chiffres_derriere_221_nu_ou_entre_parentheses_sont_le_contact(): void
    {
        // TCK-2454 : les groupements que le masque ne lisait pas, et le chiffre à chiffre suivi d'un petit nombre.
        foreach (['Villa R+1 221 770 123 456', 'Villa R+1 (221) 770 123 456', 'Villa R+1 (221) 7 7 0 1 2 3 4 56',
            'Villa R+1 221 77 012 34 56 F', 'Villa R+1 221 770123456 F', 'Villa R+1 221 77 01 23 456 F',
            'Villa R+1 (221) 7 7 0 1 2 3 4 5 6 3 chambres', 'Villa R+1 (221) 7 7 0 1 2 3 4 5 6 2 salons',
            'Villa 221 77 012 34 56 F'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }

        // Limite : `(221)` suivi d'une marque reste masqué sans contact.
        foreach (['Villa R+1 (221) 770123456 F', 'Villa R+1 (221) 77 01 23 456 F'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }

        // Un nombre qui finit par 000 derrière 221 n'est pas un contact.
        $this->assertSame([], RadarPhone::contactsFromText('Lot 221 300 000 000 F'));
    }

    public function test_l_indicatif_00221_ou_221_nu_derriere_un_etage_garde_le_contact(): void
    {
        foreach (['Villa R+1 00221 77 012 34 56', 'Villa R+7 00221 77 012 34 56', 'Villa RDC +1 00221 77 012 34 56',
            'Villa R+1  00221 77 012 34 56', 'Villa R+1 00221 77 012 34 56 F', 'Villa R+1 221 77 012 34 56',
            'Villa R+7 221 77 012 34 56', 'Villa R+1 (221) 77 01 234 56', 'Villa R+7 (221) 77 01 234 56',
            // Un petit nombre suivi d'un mot, ou une ligne suivante qui commence par un chiffre, n'est pas au numéro.
            'Villa R+1 00221 77 012 34 56 3 chambres', "Villa R+1 00221 77 012 34 56\n2 salons",
            'Villa R+7 221 77 012 34 56 3 chambres', 'Villa R+1 (221) 77 01 234 56 3 chambres'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::fromText($texte), $texte);
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }

        // Décisions : un `221` nu devant un autre groupement, ou devant un numéro que suit une marque, et un étage de 20 ou
        // plus qui est un indicatif, restent lus comme un numéro étranger qui englobe le numéro sénégalais : contact perdu,
        // plutôt qu'inventé, et rien en clair (fixture partagé). TCK-2454 : neuf chiffres suivis de `000` sont un numéro tronqué
        // suivi d'un montant (`… 34 56 000 F`), et un numéro tronqué n'est pas un contact.
        foreach (['Villa R+1 221 77 01 234 56', 'Immeuble R+20 00221 77 123 45 67',
            'Immeuble R+30 221 77 123 45 67', 'Villa R+1 00221 77 012 34 56 000 F', 'Villa R+1 00221 77 012 3 / 450 000 F'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }

        // Là où l'indicatif étranger ne lisait pas déjà un numéro, rien ne change : le contact reste.
        $this->assertSame(['+221770123456'], RadarPhone::contactsFromText('Contact +1 (221) 770123456'));
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Immeuble R+20 221 7 7 1 2 3 4 5 6 7'));
    }

    /**
     * TCK-2454 — neuf chiffres écrits par groupes derrière un indicatif sont un numéro entier, quoi qui les suive : le contact n'est
     * plus perdu derrière l'étage. Sauf s'ils se coupent sur un autre numéro : le premier est tronqué, et le contact est le second.
     */
    public function test_un_numero_a_indicatif_suivi_d_un_groupe_de_chiffres_garde_son_contact(): void
    {
        foreach (['Villa R+1 00221 77 012 34 56 78 90', 'Villa R+1 00221 77 012 34 56 12 500 F', 'Villa R+1 00221 77 012 34 56 1234 m2',
            'Villa R+1 00221 77 012 34 56 450 000 F', 'Villa R+1 00221 77 012 34 56 3,5 pièces', 'Villa R+1 00221 77 012 34 56 3 /mois',
            'Villa R+1 00221 77 012 34 56 0 frais', "Villa R+1 00221 77 012 34 56\n3", 'Villa R+7 00221 77 012 34 56 12 500 F',
            'Villa RDC +1 00221 77 012 34 56 78 90', 'Villa R+1 221 77 012 34 56 78 90', 'Villa R+1 (221) 77 01 234 56 78 90'] as $texte) {
            $this->assertSame(['+221770123456'], RadarPhone::fromText($texte), $texte);
            $this->assertSame(['+221770123456'], RadarPhone::contactsFromText($texte), $texte);
        }

        // Les deux numéros entiers sont lus ; plus de numéro recollé (`+221770123478`) à cheval sur un numéro tronqué et le suivant.
        $this->assertSame(['+221770123456', '+221781234567'], RadarPhone::contactsFromText('Villa R+1 00221 77 012 34 56 / 78 123 45 67'));
        foreach (['Villa R+1 00221 77 012 34 / 78 123 45 67', 'Villa R+1 00221 77 012 34 78 123 45 67', 'Villa R+1 (221) 77 012 34 78 123 45 67',
            'Tel 00221 77 012 34 / 78 123 45 67', 'Tel +221 77 012 34 / 78 123 45 67', 'Villa R+2 00221 77 012 34 / 78 123 45 67'] as $texte) {
            $this->assertSame(['+221781234567'], RadarPhone::fromText($texte), $texte);
            $this->assertSame(['+221781234567'], RadarPhone::contactsFromText($texte), $texte);
        }
    }

    /**
     * TCK-2455 — un indicatif étranger qui se lit aussi comme un préfixe sénégalais, devant `00221` ou `221` nu : le début du texte
     * se lisait comme un numéro sénégalais (`33 00221 7 7`), que `fromText` rendait (`+221330022177`) et qu'un refus STOP aurait visé.
     */
    public function test_un_indicatif_qui_ressemble_a_un_prefixe_ne_fabrique_pas_de_numero(): void
    {
        foreach (['Tel +33 00221 7 7 0 1 2 3 4 5 6', 'Tel +33 221 7 7 0 1 2 3 4 5 6', 'Tel +30 00221 7 7 0 1 2 3 4 5 6', 'Tel +75 00221 7 7 0 1 2 3 4 5 6',
            'Tel 33 00221 7 7 0 1 2 3 4 5 6', 'Tel 33 221 7 7 0 1 2 3 4 5 6', 'Tel 30 00221 77 012 34 56'] as $texte) {
            $this->assertSame([], RadarPhone::fromText($texte), $texte);
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }

        // Là où seul `221 …` se lit, le contact reste, et un numéro français n'en est pas un.
        $this->assertSame(['+221770123456'], RadarPhone::contactsFromText('Tel 33 221 77 012 34 56'));
        $this->assertSame([], RadarPhone::fromText('Tel +33 6 12 34 56 78 15 chambres'));
    }

    /**
     * Vérification adverse M2 — les limites connues du masqueur sont lues (le refus STOP s'y juge), mais ne désignent
     * pas d'office un contact : une unité derrière, un mot de prix ou de liste devant, des crochets.
     */
    public function test_une_limite_du_masqueur_n_est_pas_un_contact(): void
    {
        foreach (['Horaires 30 20 5 20 10 min', 'Distances 30 20 5 20 10 km', 'Charges 30 20 15 10 5 % par an',
            'Lots 3 0 1 2 3 4 5 6 7', 'Prix (75) 500 00 00', 'Tableau [70,100,25,50]', 'Visites : 30 20 5 20 10 h'] as $texte) {
            $this->assertNotSame([], RadarPhone::fromText($texte), $texte);
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
        }

        // Un vrai contact, à côté d'un prix ou d'une surface, reste un contact.
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Contact 77 123 45 67, loyer 450 000 F par mois'));
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Villa 300 m², Awa 77_123_45_67'));
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Prix 85 000 000 F. Tel : (77) 123 45 67'));
        // L'indicatif explicite n'est jamais filtré : `+221 … F`, le F est une initiale.
        $this->assertSame(['+221771234567'], RadarPhone::contactsFromText('Prix : +221 77 123 45 67 F. Diop'));
    }

    /**
     * Contre-vérification C2 — une unité d'une lettre (`h`, `m`, `f`) ne compte que suivie d'une espace ou d'une fin de
     * phrase : `M. Diallo`, `m. Ndiaye`, `h24`, `H24/7` derrière le numéro le laissent un contact. Un mot de prix ou de
     * liste juste devant, ou un crochet, l'écarte toujours du contact d'office (pas de la lecture large).
     */
    public function test_les_ecritures_banales_de_la_contre_verification(): void
    {
        foreach (['Contact : 77 123 45 67 M. Diallo', 'Tel 77 123 45 67 m. Ndiaye', 'Contact 77 123 45 67 h24',
            'Joignable 77 123 45 67 H24/7', 'Appelez le 77 123 45 67 h, merci'] as $texte) {
            $this->assertSame(['+221771234567'], RadarPhone::contactsFromText($texte), $texte);
        }
        foreach (['Infos et prix : 77 123 45 67', 'Contact pour prix 77 123 45 67', 'Prix : 77 123 45 67',
            'Visite et frais : 77 123 45 67', 'Caution - 77 123 45 67', 'Pour les horaires 77 123 45 67',
            '77 123 45 67 chambres disponibles', '[77 123 45 67]', 'Visite 30 20 5 20 10 h par jour'] as $texte) {
            $this->assertSame([], RadarPhone::contactsFromText($texte), $texte);
            $this->assertNotSame([], RadarPhone::fromText($texte), $texte);
        }
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
