<?php

namespace Tests\Unit\Support\Http;

use App\Support\Http\ParametreUnique;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;

/**
 * P216.05 (TCK-2242, ADR-0075 § 1) — le lecteur d'un paramètre qui attend une valeur unique : la
 * chaîne, ou `null` si la valeur est absente ou reçue en liste.
 */
class ParametreUniqueTest extends TestCase
{
    public function test_une_chaine_est_rendue_telle_quelle(): void
    {
        $this->assertSame(' -created_at ', ParametreUnique::chaine(Request::create('/x', 'GET', ['sort' => ' -created_at ']), 'sort'));
    }

    public function test_une_valeur_absente_rend_null(): void
    {
        $this->assertNull(ParametreUnique::chaine(Request::create('/x', 'GET'), 'sort'));
    }

    public function test_une_liste_rend_null(): void
    {
        $this->assertNull(ParametreUnique::chaine(Request::create('/x', 'GET', ['sort' => ['x']]), 'sort'));
    }

    public function test_une_liste_vide_rend_null(): void
    {
        $this->assertNull(ParametreUnique::chaine(Request::create('/x', 'GET', ['sort' => []]), 'sort'));
    }

    public function test_la_notation_pointee_lit_une_cle_imbriquee(): void
    {
        $request = Request::create('/x', 'GET', ['filter' => ['status' => 'active', 'kind' => ['a', 'b']]]);

        $this->assertSame('active', ParametreUnique::chaine($request, 'filter.status'));
        $this->assertNull(ParametreUnique::chaine($request, 'filter.kind'));
        $this->assertNull(ParametreUnique::chaine($request, 'filter.agency_id'));
    }

    public function test_une_valeur_deja_extraite_suit_la_meme_regle(): void
    {
        $this->assertSame('today', ParametreUnique::valeur('today'));
        $this->assertSame('', ParametreUnique::valeur(''));
        $this->assertSame('12', ParametreUnique::valeur(12));
        $this->assertNull(ParametreUnique::valeur(null));
        $this->assertNull(ParametreUnique::valeur(['today']));
        $this->assertNull(ParametreUnique::valeur([]));
    }
}
