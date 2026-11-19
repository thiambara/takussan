<?php

namespace Tests\Unit\Architecture;

use App\Services\Messaging\CodesDuFil;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2967 (ADR-0128 § 7) — le cycle de vie d'un geste attendu, déclaré au catalogue du fil.
 *
 * Un code déclaré `attend` (le seul à qui `EvenementsDuFil::ecrire` et `FilDeLObjet::parler` laissent porter
 * un `action_for` non vide) a au moins une clôture — un code du MÊME objet qui le liste dans `eteint` — ou
 * figure dans `CodesDuFil::sansCloture()` avec sa raison. Sans cela, le geste ne cesse d'être attendu que
 * si un événement postérieur attend le même lecteur : le locataire qui a payé restait « à vous ».
 */
class CloturesDuFilArchitectureTest extends TestCase
{
    public function test_chaque_code_qui_attend_a_une_cloture_ou_sa_raison(): void
    {
        $clos = array_unique(array_column(CodesDuFil::clotures(), 0));
        $attendent = array_filter(CodesDuFil::codes(), fn (string $code) => CodesDuFil::attend($code));
        $this->assertNotEmpty($attendent, 'aucun code ne déclare `attend` : ce test serait vert pour rien');

        $fautes = [];
        foreach ($attendent as $code) {
            $raison = CodesDuFil::sansCloture()[$code] ?? null;
            if (! in_array($code, $clos, true) && ($raison === null || trim($raison) === '')) {
                $fautes[] = $code;
            }
        }

        $this->assertSame([], $fautes, 'code attendu sans clôture déclarée ni raison dans SANS_CLOTURE');
    }

    public function test_chaque_cle_eteint_designe_un_code_attendu_du_meme_objet(): void
    {
        $this->assertNotEmpty(CodesDuFil::clotures());

        foreach (CodesDuFil::catalogue() as $code => $entree) {
            $eteints = $entree['eteint'] ?? [];
            if ($eteints === []) {
                continue;
            }
            // La clause ne lit que les `event` postérieurs : une carte qui clôt ne clôrait rien.
            $this->assertSame(CodesDuFil::NATURE_EVENEMENT, $entree['nature'], "{$code} : seul un événement clôt");
            $this->assertSame(array_values(array_unique($eteints)), $eteints, "{$code} : clôture en double");

            foreach ($eteints as $eteint) {
                $this->assertNotSame($code, $eteint, "{$code} se clôt lui-même");
                $this->assertTrue(CodesDuFil::existe($eteint), "{$code} éteint « {$eteint} », hors du catalogue");
                $this->assertSame($entree['objet'], CodesDuFil::entree($eteint)['objet'], "{$code} éteint « {$eteint} », d'un autre objet");
                $this->assertTrue(CodesDuFil::attend($eteint), "{$code} éteint « {$eteint} », qui n'attend aucun geste");
            }
        }
    }

    public function test_sans_cloture_ne_garde_que_des_codes_attendus_vraiment_sans_cloture(): void
    {
        $clos = array_column(CodesDuFil::clotures(), 0);
        // Vide depuis que l'état des lieux dit ses signatures : le test garde les entrées à venir.
        $this->assertSame([], array_diff(array_keys(CodesDuFil::sansCloture()), CodesDuFil::codes()), 'entrée hors du catalogue');

        foreach (CodesDuFil::sansCloture() as $code => $raison) {
            $this->assertTrue(CodesDuFil::existe($code), "« {$code} » hors du catalogue");
            $this->assertTrue(CodesDuFil::attend($code), "« {$code} » n'attend aucun geste : rien à clore");
            $this->assertNotContains($code, $clos, "« {$code} » a trouvé sa clôture : le retirer de SANS_CLOTURE");
            $this->assertNotSame('', trim($raison));
        }
    }

    /** `NonLus` écrit les couples en littéraux SQL après ce même contrôle : une faute se voit ici, pas à chaque liste. */
    public function test_chaque_code_d_une_cloture_s_ecrit_en_litteral(): void
    {
        foreach (CodesDuFil::clotures() as [$eteint, $parCode]) {
            $this->assertMatchesRegularExpression('/^[a-z_]+\.[a-z_]+$/', $eteint);
            $this->assertMatchesRegularExpression('/^[a-z_]+\.[a-z_]+$/', $parCode);
        }
    }
}
