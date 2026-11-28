<?php

namespace Tests\Unit\Support\Telephone;

use App\Support\PhoneMasker;
use App\Support\RadarPhone;
use App\Support\Telephone\LectureDesNumeros;
use App\Support\Telephone\NumeroTrouve;
use App\Support\Telephone\Politique;
use App\Support\Telephone\Repli;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-3004 — la lecture des numéros d'un texte, une fois, et les politiques qui en gardent chacune ce qui lui revient.
 * Les cas vivent dans le fichier partagé avec le miroir JS (`tests/fixtures/ai/donnees-personnelles.json`, clé `politiques`) :
 * une colonne d'attendu par politique, pour que la divergence voulue entre elles se lise sur une ligne.
 */
class LectureDesNumerosTest extends TestCase
{
    /** @return array<string, array{string, string, list<string>, list<string>, list<string>}> */
    public static function cas(): array
    {
        $formes = json_decode((string) file_get_contents(dirname(__DIR__, 3).'/fixtures/ai/donnees-personnelles.json'), true, flags: JSON_THROW_ON_ERROR);

        return array_map(fn (array $c): array => [$c['texte'], $c['masquer'], $c['ecarter'], $c['refus_stop'], $c['contact_d_office']], $formes['politiques']);
    }

    /**
     * @param  list<string>  $ecarter
     * @param  list<string>  $refusStop
     * @param  list<string>  $contacts
     */
    #[DataProvider('cas')]
    public function test_chaque_politique_rend_sa_colonne(string $texte, string $masque, array $ecarter, array $refusStop, array $contacts): void
    {
        $this->assertSame($masque, PhoneMasker::mask($texte));
        $this->assertSame($ecarter, self::textes($texte, Politique::Ecarter));
        $this->assertSame($refusStop, self::e164($texte, Politique::RefusStop));
        $this->assertSame($contacts, self::e164($texte, Politique::ContactDOffice));
        // `RadarPhone` ne fait que choisir la politique et dédoublonner.
        $this->assertSame($refusStop, RadarPhone::fromText($texte));
        $this->assertSame($contacts, RadarPhone::contactsFromText($texte));
    }

    /** @return array<string, array{string, string, string, string}> */
    public static function ecritures(): array
    {
        return [
            'chiffres arabes-indiens' => ['Tel ٧٧ ١٢٣ ٤٥ ٦٧ !', 'Tel ', '٧٧ ١٢٣ ٤٥ ٦٧', ' !'],
            'invisibles au bord et au milieu' => ["Tel \u{200B}77\u{200B}123 45 67\u{FEFF} !", "Tel \u{200B}", "77\u{200B}123 45 67", "\u{FEFF} !"],
            'pleine chasse' => ['Tel ７７ １２３ ４５ ６７ !', 'Tel ', '７７ １２３ ４５ ６７', ' !'],
        ];
    }

    /** Les positions sont des octets du texte d'origine : un invisible qui borde le numéro reste dehors, celui qu'il enjambe dedans. */
    #[DataProvider('ecritures')]
    public function test_les_positions_sont_celles_du_texte_d_origine(string $texte, string $avant, string $numero, string $apres): void
    {
        $numeros = LectureDesNumeros::lire($texte, Politique::Masquer);

        $this->assertCount(1, $numeros);
        $this->assertSame($avant, substr($texte, 0, $numeros[0]->debut));
        $this->assertSame($numero, $numeros[0]->texte);
        $this->assertSame($apres, substr($texte, $numeros[0]->fin));
        $this->assertSame('+221771234567', $numeros[0]->e164());
    }

    /**
     * L'indicatif écrit juste devant un numéro dont le motif ne l'a pas pris (`+1 77 123 45 67 89`, `0033 7 7 1 …`) : la lecture
     * `Ecarter` en rend le début, en octets du texte d'origine (`RadarAmountParser` n'y lit pas un « prix » de 33) ; le masquage non.
     */
    public function test_l_indicatif_ecrit_devant_est_rendu_a_qui_ecarte(): void
    {
        foreach (['Tel +1 77 123 45 67 89' => [4, 7], 'prix 0033 7 7 1 2 3 4 5 6 7 8' => [5, 10], 'Tél ＋1 77 123 45 67 89' => [5, 10]] as $texte => [$indicatif, $debut]) {
            [$ecarte] = LectureDesNumeros::lire($texte, Politique::Ecarter);
            [$masque] = LectureDesNumeros::lire($texte, Politique::Masquer);

            $this->assertSame([$indicatif, $debut], [$ecarte->debutIndicatif, $ecarte->debut], $texte);
            $this->assertNull($masque->debutIndicatif, $texte);
        }
    }

    /** Une lecture en échec n'est pas « aucun numéro » : le masquage, qui en dépend pour ne rien laisser passer, doit pouvoir le voir. */
    public function test_un_texte_invalide_n_est_pas_lu_comme_sans_numero(): void
    {
        foreach (Politique::cases() as $politique) {
            $this->assertNull(LectureDesNumeros::lire("Tel 77 123 45 67 \xff", $politique), $politique->name);
        }
        $this->assertSame('Tel [TELEPHONE] ?', PhoneMasker::mask("Tel 77 123 45 67 \xff"));
    }

    /** Le repli, distinct de la lecture : invisibles retirés, chiffres en ASCII, rien d'autre ; un texte invalide se replie en rien. */
    public function test_le_repli_du_texte(): void
    {
        $this->assertSame('Tél : 77123 45 67, Mermoz', Repli::texte("Tél : ٧٧\u{200B}１２３ 45 67,\u{00AD} Mermoz"));
        $this->assertSame('+33', Repli::texte('＋３３'));
        $this->assertSame('', Repli::texte("77 \xff"));
    }

    /** @return list<string> */
    private static function textes(string $texte, Politique $politique): array
    {
        return array_map(fn (NumeroTrouve $n): string => $n->texte, LectureDesNumeros::lire($texte, $politique) ?? []);
    }

    /** @return list<string> */
    private static function e164(string $texte, Politique $politique): array
    {
        return array_values(array_unique(array_map(fn (NumeroTrouve $n): ?string => $n->e164(), LectureDesNumeros::lire($texte, $politique) ?? [])));
    }
}
