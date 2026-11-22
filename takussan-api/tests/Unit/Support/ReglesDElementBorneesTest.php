<?php

namespace Tests\Unit\Support;

use App\Support\ReglesDElementBornees;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2488 — la fonction qui retire les règles d'élément (`x.*`, `x.*.y`) d'une liste que son parent
 * refuse d'office. Laravel les jouerait sur chaque élément même après l'échec du parent (revue de
 * TCK-2483, M1 : 20 000 éléments, 29 s, 2 Mo de 422).
 *
 * Elle ne retire une règle que si le parent échoue de toute façon : la réponse reste un 422.
 */
class ReglesDElementBorneesTest extends TestCase
{
    private const REGLES = [
        'ids' => ['sometimes', 'array', 'max:3'],
        'ids.*' => ['integer', 'distinct'],
        'nom' => ['sometimes', 'string'],
    ];

    /** @return list<int> */
    private static function liste(int $n): array
    {
        return range(1, $n);
    }

    public function test_une_liste_au_dela_de_sa_borne_perd_ses_regles_d_element(): void
    {
        $regles = ReglesDElementBornees::retirer(self::REGLES, ['ids' => self::liste(4)]);

        $this->assertArrayNotHasKey('ids.*', $regles);
        $this->assertSame(self::REGLES['ids'], $regles['ids'], 'le parent garde sa règle : c\'est lui qui rend le 422');
        $this->assertSame(self::REGLES['nom'], $regles['nom']);
    }

    public function test_une_liste_dans_sa_borne_garde_ses_regles_d_element(): void
    {
        foreach ([
            'à la borne' => ['ids' => self::liste(3)],
            'vide' => ['ids' => []],
            'nulle' => ['ids' => null],
            'absente' => [],
            'pas un tableau' => ['ids' => 'abc'],
        ] as $cas => $donnees) {
            $this->assertSame(self::REGLES, ReglesDElementBornees::retirer(self::REGLES, $donnees), $cas);
        }
    }

    public function test_les_regles_sous_l_element_tombent_avec_lui(): void
    {
        $regles = [
            'items' => ['required', 'array', 'max:2'],
            'items.*.label' => ['required', 'string'],
            'items.*.prix' => ['numeric'],
            'items_bis' => ['array'],
            'items_bis.*' => ['string'],
        ];

        $retenues = ReglesDElementBornees::retirer($regles, ['items' => [[], [], []], 'items_bis' => ['a']]);

        $this->assertSame(['items', 'items_bis', 'items_bis.*'], array_keys($retenues), 'un préfixe homonyme (`items_bis`) n\'est pas un élément de `items`');
    }

    public function test_chaque_prefixe_d_une_cle_imbriquee_est_juge(): void
    {
        $regles = [
            'rooms' => ['array', 'max:2'],
            'rooms.*.name' => ['required', 'string'],
            'rooms.*.elements' => ['nullable', 'array', 'max:2'],
            'rooms.*.elements.*.label' => ['required', 'string'],
        ];

        $piecesEnTrop = ReglesDElementBornees::retirer($regles, ['rooms' => [[], [], []]]);
        $this->assertSame(['rooms'], array_keys($piecesEnTrop), 'trop de pièces : rien sous `rooms.*`');

        $elementsEnTrop = ReglesDElementBornees::retirer($regles, ['rooms' => [
            ['elements' => [1]],
            ['elements' => [1, 2, 3]],
        ]]);
        $this->assertSame(['rooms', 'rooms.*.name', 'rooms.*.elements'], array_keys($elementsEnTrop), 'une seule pièce en trop d\'éléments suffit : la requête échoue sur elle');

        $dansLesBornes = ReglesDElementBornees::retirer($regles, ['rooms' => [['elements' => [1, 2]], ['elements' => null]]]);
        $this->assertSame($regles, $dansLesBornes);
    }

    public function test_une_regle_ecrite_en_chaine_est_lue(): void
    {
        $regles = ['tags' => 'nullable|array|max:1', 'tags.*' => 'string'];

        $this->assertArrayNotHasKey('tags.*', ReglesDElementBornees::retirer($regles, ['tags' => ['a', 'b']]));
        $this->assertSame($regles, ReglesDElementBornees::retirer($regles, ['tags' => ['a']]));
    }

    public function test_list_compte_comme_un_tableau_et_la_plus_petite_borne_l_emporte(): void
    {
        $regles = ['p' => ['list', 'max:5', 'max:2'], 'p.*' => ['string']];

        $this->assertArrayNotHasKey('p.*', ReglesDElementBornees::retirer($regles, ['p' => ['a', 'b', 'c']]));
        $this->assertSame($regles, ReglesDElementBornees::retirer($regles, ['p' => ['a', 'b']]));
    }

    public function test_un_tableau_a_cles_listees_recu_avec_une_cle_hors_liste_perd_ses_elements(): void
    {
        $regles = [
            'personas' => ['array:client,agent'],
            'personas.*' => ['array:epingles'],
            'personas.*.epingles' => ['list', 'max:5'],
        ];

        $this->assertSame(['personas'], array_keys(ReglesDElementBornees::retirer($regles, ['personas' => ['client' => [], 'inconnu' => []]])));
        $this->assertSame($regles, ReglesDElementBornees::retirer($regles, ['personas' => ['client' => [], 'agent' => []]]));
    }

    public function test_un_parent_interdit_recu_non_vide_perd_ses_elements(): void
    {
        $regles = ['mods' => ['prohibited'], 'mods.*' => ['string']];

        $this->assertSame(['mods'], array_keys(ReglesDElementBornees::retirer($regles, ['mods' => ['a']])));
        $this->assertSame($regles, ReglesDElementBornees::retirer($regles, ['mods' => []]), '`prohibited` accepte `[]` : rien à retirer');
    }

    public function test_un_parent_sans_borne_ou_qui_peut_etre_exclu_ne_retire_rien(): void
    {
        $sansBorne = ['ids' => ['array'], 'ids.*' => ['integer']];
        $this->assertSame($sansBorne, ReglesDElementBornees::retirer($sansBorne, ['ids' => self::liste(1000)]));

        $maxSansTableau = ['ids' => ['max:3'], 'ids.*' => ['integer']];
        $this->assertSame($maxSansTableau, ReglesDElementBornees::retirer($maxSansTableau, ['ids' => self::liste(10)]), 'sans `array`, la borne n\'est pas lue comme un compte');

        $exclu = ['ids' => ['exclude_if:mode,x', 'array', 'max:3'], 'ids.*' => ['integer']];
        $this->assertSame($exclu, ReglesDElementBornees::retirer($exclu, ['ids' => self::liste(10)]), 'un parent exclu n\'est pas jugé : ses éléments non plus, mais ce n\'est pas à nous d\'en décider');

        $parentAbsent = ['ids.*' => ['integer']];
        $this->assertSame($parentAbsent, ReglesDElementBornees::retirer($parentAbsent, ['ids' => self::liste(10)]));
    }
}
