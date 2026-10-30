<?php

namespace Tests\Unit\Radar\Crawl;

use App\Services\Radar\Crawl\CoinafriqueAdapter;
use App\Services\Radar\Crawl\ListCard;
use App\Services\Radar\Crawl\ListPage;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2392 — la lecture d'une page de liste de CoinAfrique, sur des fixtures écrites à la main (données inventées).
 */
class CoinafriqueAdapterTest extends TestCase
{
    private const PAGE = 'https://sn.coinafrique.com/categorie/immobilier';

    private function parse(string $fixture, string $url = self::PAGE): ListPage
    {
        return (new CoinafriqueAdapter)->parse((string) file_get_contents(dirname(__DIR__, 3).'/fixtures/radar/crawl/'.$fixture), $url);
    }

    public function test_une_carte_par_annonce_l_url_absolutisee_et_le_profil_ignore(): void
    {
        $this->assertSame([
            'https://sn.coinafrique.com/annonce/appartements/appartement-fictif-4-pieces-almadies-8000001',
            'https://sn.coinafrique.com/annonce/villas/villa-fictive-saly-8000002',
            'https://sn.coinafrique.com/annonce/chambres/chambre-fictive-ouakam-8000003',
        ], array_map(fn (ListCard $c) => $c->url, $this->parse('coinafrique-page-1.html')->cards));
    }

    public function test_la_carte_rend_prix_type_et_ce_que_dit_le_titre(): void
    {
        [$flat, $villa, $room] = $this->parse('coinafrique-page-1.html')->cards;

        $this->assertSame(750000, $flat->price);
        $this->assertSame('apartment', $flat->propertyType);
        $this->assertSame('rent', $flat->contract);
        $this->assertSame(3, $flat->bedrooms);
        $this->assertSame(120.0, $flat->surfaceM2);
        $this->assertSame('Almadies, Dakar, Sénégal', $flat->location);

        $this->assertSame(95000000, $villa->price);
        $this->assertSame('villa', $villa->propertyType);
        $this->assertSame('sale', $villa->contract);

        $this->assertNull($room->price, 'Prix sur demande : aucun montant.');
        $this->assertSame('room', $room->propertyType);
        $this->assertNull($room->contract);
    }

    public function test_la_page_suivante_vient_de_la_pagination_pas_du_lien_next_vers_la_racine(): void
    {
        $this->assertSame('https://sn.coinafrique.com/categorie/immobilier?page=2', $this->parse('coinafrique-page-1.html')->nextUrl);
        $this->assertNull($this->parse('coinafrique-page-3.html', self::PAGE.'?page=3')->nextUrl);
    }
}
