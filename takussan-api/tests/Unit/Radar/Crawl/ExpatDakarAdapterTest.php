<?php

namespace Tests\Unit\Radar\Crawl;

use App\Services\Radar\Crawl\ExpatDakarAdapter;
use App\Services\Radar\Crawl\ListCard;
use App\Services\Radar\Crawl\ListPage;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2392 — la lecture d'une page de liste d'Expat-Dakar, sur des fixtures écrites à la main (données inventées).
 */
class ExpatDakarAdapterTest extends TestCase
{
    private const PAGE = 'https://www.expat-dakar.com/immobilier';

    private function parse(string $fixture, string $url = self::PAGE): ListPage
    {
        return (new ExpatDakarAdapter)->parse((string) file_get_contents(dirname(__DIR__, 3).'/fixtures/radar/crawl/'.$fixture), $url);
    }

    public function test_une_carte_par_annonce_du_site_sans_le_doublon_du_carrousel_ni_le_lien_hors_site(): void
    {
        $page = $this->parse('expat-dakar-page-1.html');

        $this->assertSame([
            'https://www.expat-dakar.com/annonce/villa-fictive-a-ngor-9000001',
            'https://www.expat-dakar.com/annonce/appartement-f3-fictif-mermoz-9000002?utm_source=liste',
            'https://www.expat-dakar.com/annonce/terrain-fictif-a-diamniadio-9000003',
        ], array_map(fn (ListCard $c) => $c->url, $page->cards));
    }

    public function test_la_carte_rend_prix_categorie_lieu_et_pastilles(): void
    {
        $card = $this->parse('expat-dakar-page-1.html')->cards[1];

        $this->assertSame('Appartement F3 fictif à Mermoz', $card->title);
        $this->assertSame(450000, $card->price);
        $this->assertSame('rent', $card->contract);
        $this->assertSame('apartment', $card->propertyType);
        $this->assertSame(2, $card->bedrooms);
        $this->assertSame(95.0, $card->surfaceM2);
        $this->assertSame('Mermoz, Dakar', $card->location);
    }

    public function test_un_prix_dans_une_autre_monnaie_n_est_pas_lu_et_le_lieu_retombe_sur_le_texte(): void
    {
        $card = $this->parse('expat-dakar-page-1.html')->cards[2];

        $this->assertNull($card->price);
        $this->assertSame('sale', $card->contract);
        $this->assertSame('land', $card->propertyType);
        $this->assertSame(300.0, $card->surfaceM2);
        $this->assertNull($card->bedrooms);
        $this->assertSame('Diamniadio, Rufisque', $card->location);
    }

    public function test_la_page_suivante_vient_du_lien_next_et_la_derniere_n_en_a_pas(): void
    {
        $this->assertSame('https://www.expat-dakar.com/immobilier?page=2', $this->parse('expat-dakar-page-1.html')->nextUrl);
        $this->assertNull($this->parse('expat-dakar-page-2.html', self::PAGE.'?page=2')->nextUrl);
    }

    public function test_une_page_sans_carte_ni_html_lisible_ne_rend_rien(): void
    {
        $page = (new ExpatDakarAdapter)->parse('', self::PAGE);

        $this->assertSame([], $page->cards);
        $this->assertNull($page->nextUrl);
    }
}
