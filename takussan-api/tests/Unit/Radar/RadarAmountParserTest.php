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

    public function test_un_etage_r_plus_un_devant_un_prix_n_en_fait_pas_un_numero(): void
    {
        // Vérification adverse M1 : `+1` suivi de dix chiffres se lit comme un numéro nord-américain, sauf collé à `R`.
        $this->assertSame(['amount' => 1_250_500_750, 'period' => null], RadarAmountParser::parse('Immeuble R+1 1 250 500 750 F'));
        $this->assertSame(['amount' => 1_250_500_750, 'period' => null], RadarAmountParser::parse('Immeuble R+7 1 250 500 750 F'));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Tel +1 202 555 0123, loyer 450 000 F'));
    }

    public function test_un_etage_rdc_ou_espace_devant_un_prix_n_en_fait_pas_un_numero(): void
    {
        // TCK-2435 : `RDC+1` et `R + 1` sont des étages comme `R+1`, le prix qui suit est lu. Ces cas gardent
        // `PhoneMasker::NOT_A_FLOOR` ; `RadarPhone::FLOOR_PLUS` est gardé par le test suivant et par `RadarPhoneTest`.
        foreach (['Immeuble RDC+1 1 250 500 750 F', 'Immeuble R + 1 1 250 500 750 F', 'Immeuble R +1 1 250 500 750 F',
            'Immeuble R+ 1 1 250 500 750 F', 'Immeuble Rdc + 2 1 250 500 750 F'] as $texte) {
            $this->assertSame(['amount' => 1_250_500_750, 'period' => null], RadarAmountParser::parse($texte), $texte);
        }
    }

    public function test_un_numero_un_ou_sept_complet_derriere_un_etage_n_est_pas_un_prix(): void
    {
        // TCK-2435 (vérification 2) : derrière `RDC +1`, `R+1`, `RDC+7`, un numéro complet de l'indicatif garde son `+`.
        // Revérification : un `+1` nord-américain ou un mobile `+7`, même suivi d'une marque, n'est pas un prix.
        foreach (['RDC +1 5145550199', 'RDC+7 7701234567', 'Appartement au RDC +1 514 555 0199', 'R+1 5145550199',
            'R+1 514 555 0199 F', 'R+7 912 345 67 89 FCFA'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }
    }

    public function test_un_numero_etranger_colle_derriere_r_n_est_pas_un_prix(): void
    {
        // TCK-2441 : le `+` neutralisé faisait de `33612345678` un nombre nu, et laissait le dernier groupe devant `F`.
        $this->assertNull(RadarAmountParser::parse('Villa R+33 612345678'));
        $this->assertNull(RadarAmountParser::parse('Villa R+33 6 12 34 56 78 F'));
        // Un étage de 20 ou plus qui n'est pas un indicatif reste un étage devant son prix.
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Immeuble R+25 450 000 F'));
        // Limite assumée (décision 3) : derrière un étage qui est un indicatif, un prix qui a la forme d'un numéro de ce plan
        // est perdu, comme le masquage le lit déjà (`Immeuble R[TELEPHONE] F`) ; 2 500 000 sur `dev`.
        $this->assertNull(RadarAmountParser::parse('Immeuble R+30 2 500 000 F'));
    }

    public function test_l_indicatif_221_devant_un_numero_n_est_pas_un_prix(): void
    {
        // TCK-2447 : la plage d'un numéro sénégalais s'étend au `(221)` ou au `221` écrit devant, comme au `+` d'un indicatif.
        foreach (['Villa R+1 (221) 77 012 34 56', 'Villa R+2 (221) 77 012 34 56', 'Villa (221) 77 012 34 56',
            'Villa RDC +1 (221) 77 012 34 56', 'Villa 221 / 77 012 34 56', 'Villa (221)77 012 34 56', 'Villa R+1(221) 77 012 34 56'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }
        $this->assertSame(['amount' => 450_000, 'period' => 'monthly'], RadarAmountParser::parse('Villa R+1 (221) 33 821 00 00, 450 000 F/mois'));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Villa (221) 77 012 34 56 loyer 450 000 F'));
    }

    public function test_un_numero_a_indicatif_derriere_un_etage_n_est_pas_un_prix(): void
    {
        // TCK-2451 : derrière `R+1`, la fin du numéro restée hors du masque (`34 56`, `56`) devenait le prix devant `F`.
        foreach (['Villa R+1 00221 77 012 34 56 F', 'Villa R+1 221 77 012 34 56 F', 'Villa R+1 (221) 77 012 34 56 F',
            'Villa R+1 (221) 77 01 234 56', 'Villa R+1 00221 77 012 34 56'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }
        $this->assertSame(['amount' => 450_000, 'period' => 'monthly'], RadarAmountParser::parse('Villa R+1 00221 77 012 34 56, 450 000 F/mois'));
    }

    public function test_un_montant_derriere_un_numero_garde_ses_groupes(): void
    {
        // TCK-2454 : les candidats se lisent hors des numéros : `56 450 000` chevauchait le numéro et le prix se perdait.
        foreach (['Tel 77 123 45 67 450 000 F', 'Villa R+1 00221 77 012 34 56 450 000 F', 'Tel +33 6 12 34 56 78 450 000 F',
            'Villa R+1 00221 77 012 3 / 450 000 F', 'Villa R+1 00221 77 012 3 450 000 F', 'Tel +33 00221 7 7 0 1 2 3 4 5 6 450 000 F'] as $texte) {
            $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse($texte), $texte);
        }
        foreach (['Villa R+1 00221 77 012 34 56 12 500 F', 'Contact +1 00221 77 012 34 56 12 500 F', 'Immeuble R+20 00221 77 123 45 67 12 500 F',
            'Villa R+1 221 77 012 34 56 12 500 F'] as $texte) {
            $this->assertSame(['amount' => 12_500, 'period' => null], RadarAmountParser::parse($texte), $texte);
        }

        // Neuf chiffres puis `000` : un numéro tronqué et un montant.
        $this->assertSame(['amount' => 56_000, 'period' => null], RadarAmountParser::parse('Villa R+1 00221 77 012 34 56 000 F'));
        $this->assertSame(['amount' => 56_000, 'period' => null], RadarAmountParser::parse('Villa R+1 221 77 012 34 56 000 F'));

        // Un reste du numéro ne devient pas un prix : plus de fragment, et `0221` est un indicatif.
        foreach (['Villa R+1 00221 77 012 34 56 78 90', 'Villa R+1 00221 77 012 34 56 1234 m2', 'Villa R+20 0221 77 012 34 56 F',
            'Villa R+1 0221 77 012 34 56', 'Villa R+0 0221 77 012 34 56', 'Tel 00221 77 012 34 / 33 821 00 00 F', '0221-77 012 34 56'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }
    }

    public function test_neuf_chiffres_derriere_221_ne_sont_pas_un_prix(): void
    {
        // TCK-2454 : ils se lisaient 770 123 456, 23 456, ou 221 770 123 456.
        foreach (['Villa R+1 221 770123456 F', 'Villa R+1 (221) 770123456 F', 'Villa R+1 221 77 01 23 456 F', 'Villa R+1 221 770 123 456',
            'Villa R+1 (221) 7 7 0 1 2 3 4 5 6 3 chambres', 'Villa 221 77 012 34 56 F'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }

        // Un compte derrière le prix ne le fait pas prendre pour un reste de numéro.
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Tel 77 123 45 67 450000 3 chambres'));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Tel 77 123 45 67 450000 2 mois'));

        // Sans indicatif, ou un nombre qui finit par 000 : un prix.
        $this->assertSame(['amount' => 770_123_456, 'period' => null], RadarAmountParser::parse('Villa 770123456 F'));
        $this->assertSame(['amount' => 300_000_000, 'period' => null], RadarAmountParser::parse('Lot (221) 300 000 000 F'));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Villa R+1 221 77 012 3 / 450 000 F'));
    }

    public function test_un_numero_sept_a_zone_entre_parentheses_derriere_un_etage_n_est_pas_un_prix(): void
    {
        // TCK-2445 : sans la zone entre parenthèses dans `PhoneMasker::CC7_REST`, le `7` était lu comme un étage et un bout
        // du numéro devenait le prix (`1234567`, `495`, `67`, `34567`).
        foreach (['RDC +7 (495) 123-45-67 F', 'R + 7 (495) 123-45-67 F', 'R +7 (812) 123-45-67 XOF', 'RDC +7 (912) 345-67-89 F',
            'RDC+7 (495)1234567 F', 'R+7 (495) 123-45-67 F', 'RDC +7 (495).123.45.67 F', 'RDC +7 (495)/123/45/67 F',
            "RDC\u{00A0}+7\u{00A0}(495)\u{00A0}123\u{00A0}45\u{00A0}67\u{00A0}FCFA", 'RDC +7 (770) 12 34 567 F',
            'RDC +7 (295).123.45.67 F', 'RDC +1 (495).123.45.67 F', 'RDC +7 (3452) 12 34 56 F', 'Contact +7 (34922) 1 23 45 F'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }
    }

    public function test_un_etage_espace_de_son_plus_ne_se_colle_pas_au_prix(): void
    {
        // TCK-2445 (m11) : `R+ 2 450 000 F` rendait 2 450 000, le chiffre de l'étage lu comme le premier groupe du prix.
        // La forme collée (`R+2 450 000 F`) rendait déjà 450 000. Défaut antérieur à TCK-2435.
        foreach (['Villa R+ 2 450 000 F', 'Villa RDC + 2 450 000 F', 'Villa R + 2 450 000 F', 'Villa Rdc+ 2 450 000 F',
            'Villa R+2 450 000 F', 'Villa R+ 12 450 000 F', 'Villa R  +  2 450 000 F'] as $texte) {
            $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse($texte), $texte);
        }
        // Sans étage derrière le `+`, ou un étage suivi d'un prix qui commence par 1, le prix est lu en entier.
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('Villa R+ 450 000 F'));
        $this->assertSame(['amount' => 1_250_500_750, 'period' => null], RadarAmountParser::parse('Immeuble R+ 1 1 250 500 750 F'));
        $this->assertSame(['amount' => 2_450_000, 'period' => null], RadarAmountParser::parse('Villa T4 2 450 000 F'));
        // Vérification M2 : l'étage n'en est un que suivi d'un chiffre de 1 à 9 (aucun prix ne commence par 0), comme sur `dev`.
        $this->assertSame(['amount' => 15_000_000, 'period' => null], RadarAmountParser::parse('Villa R+ 15 000 000 F'));
        $this->assertSame(['amount' => 2_000_000, 'period' => null], RadarAmountParser::parse('Villa R+ 2 000 000 F'));
        $this->assertSame(['amount' => 1_500_000, 'period' => null], RadarAmountParser::parse('Villa R+ 1M5'));
        $this->assertNull(RadarAmountParser::parse('Villa R + 2 (221) 77 012 34 56'));
    }

    public function test_une_annee_entre_parentheses_derriere_r_plus_sept_n_est_pas_une_zone(): void
    {
        // TCK-2445 (vérification I1) : la zone longue de `+7` commence par 3 à 9 ; une année n'en est pas une.
        $this->assertSame(['amount' => 450_000_000, 'period' => null], RadarAmountParser::parse('Immeuble R+7 (2024) 450 000 000 F'));
        $this->assertSame(['amount' => 850_000_000, 'period' => null], RadarAmountParser::parse('Immeuble R+7 (2019) 850 000 000 FCFA'));
        $this->assertSame(['amount' => 450_000, 'period' => 'monthly'], RadarAmountParser::parse('Appartement R+7 (2023) 450 000 F/mois'));
        // Une vraie zone longue reste un numéro.
        $this->assertNull(RadarAmountParser::parse('RDC +7 (7172) 12-34-56 F'));
    }

    /**
     * TCK-2428 (contre-vérification C3 de TCK-2412) — la plage du masqueur s'arrête avant un dernier groupe isolé :
     * ce reste, ou un horaire `H24/7`, n'est pas un candidat. Un nombre nu de moins de 100 n'est jamais choisi.
     *
     * @return array<string, array{string}>
     */
    public static function restesDeNumero(): array
    {
        return [
            'dernier chiffre isolé, +33' => ['+33 7 7 12 34 56 7'],
            'dernier groupe au-delà de onze chiffres, +44' => ['+44 (0)77 123 45 67 89 12'],
            'reste derrière une zone à deux chiffres, +1' => ['+1 (77) 123 45 67 89'],
            'horaire derrière un numéro' => ['Joignable 77 123 45 67 H24/7'],
        ];
    }

    #[DataProvider('restesDeNumero')]
    public function test_le_reste_d_un_numero_n_est_pas_un_prix(string $texte): void
    {
        $this->assertNull(RadarAmountParser::parse($texte));
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse("{$texte}, loyer 450 000"));
    }

    public function test_un_petit_nombre_marque_reste_un_montant(): void
    {
        // TCK-2428 : seul le nombre nu, sans monnaie, période ni multiplicateur, est écarté sous 100.
        $this->assertSame(['amount' => 85_000_000, 'period' => null], RadarAmountParser::parse('85 millions'));
        $this->assertSame(['amount' => 50, 'period' => null], RadarAmountParser::parse('50 F'));
        $this->assertSame(['amount' => 100, 'period' => null], RadarAmountParser::parse('100'));
    }

    /**
     * TCK-2428 (vérification I1, I2) — le petit nombre nu n'est jamais choisi, mais il reste un candidat : la fourchette,
     * la caution et l'ambiguïté le voient, et l'humain tranche (`null`).
     *
     * @return array<string, array{string}>
     */
    public static function petitsNombresAmbigus(): array
    {
        return [
            'seul' => ['Prix 85'],
            'borne basse d\'une fourchette' => ['Prix 85 à 90 millions'],
            'borne basse d\'une fourchette au tiret' => ['Prix 85-90 millions'],
            'à côté d\'une caution' => ['Loyer 75, caution 150 000'],
            'à côté d\'une référence' => ['Prix 85, réf 4521'],
            'à côté d\'une année' => ['Prix 85, année 2023'],
            'horaire sans numéro, à côté d\'un prix nu' => ['Joignable 7j/7, 450 000'],
        ];
    }

    #[DataProvider('petitsNombresAmbigus')]
    public function test_un_petit_nombre_nu_n_est_jamais_choisi_mais_reste_un_candidat(string $texte): void
    {
        $this->assertNull(RadarAmountParser::parse($texte));
    }

    public function test_l_indicatif_devant_un_numero_ne_laisse_pas_un_prix(): void
    {
        // TCK-2412 : la plage du numéro s'étend à l'indicatif écrit devant elle.
        foreach (['0033 7 7 1 2 3 4 5 6 7', '+3 3 7 7 1 2 3 4 5 6 7', '0033 (77) 123 45 67', '+33 7 7 1 2 3 4 5 6 7'] as $texte) {
            $this->assertNull(RadarAmountParser::parse($texte), $texte);
        }
        $this->assertSame(['amount' => 450_000, 'period' => null], RadarAmountParser::parse('0033 7 7 1 2 3 4 5 6 7, loyer 450 000 F'));
    }

    public function test_sejour_n_est_pas_une_periode_journaliere(): void
    {
        $this->assertSame(['amount' => 200_000, 'period' => null], RadarAmountParser::parse('200 000 F le séjour'));
    }
}
