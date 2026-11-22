<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\CleanedPage;
use App\Services\Radar\HtmlCleaner;
use Tests\TestCase;

/**
 * TCK-2465 (ADR-0087 §3) — le lecteur générique ne perd plus un numéro : il récolte ceux des liens `tel:`, des liens
 * WhatsApp et des attributs `data-*phone*` / `data-mobile`, écarte ceux du JSON-LD `Organization` (le site lui-même), et
 * retire les listes de liens de navigation sans perdre la description.
 *
 * `Tests\TestCase` : la borne du texte se lit dans `config/radar.php`.
 */
class HtmlCleanerPhonesTest extends TestCase
{
    private const BASE = 'https://www.example-annonces.sn/annonce/42';

    private function clean(string $html, string $base = self::BASE): CleanedPage
    {
        return (new HtmlCleaner)->clean($html, $base);
    }

    private static function fixture(string $name): string
    {
        return (string) file_get_contents(dirname(__DIR__, 2).'/fixtures/radar/'.$name);
    }

    public function test_chaque_forme_d_attribut_rend_son_numero_au_format_international_dans_l_ordre_de_la_page(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><body><main><p>Appartement à louer, Mermoz.</p>
              <a href="tel:+221 77 555 01 01">Appeler</a>
              <a href="https://wa.me/221775550102?text=Bonjour">WhatsApp</a>
              <a href="https://api.whatsapp.com/send?phone=221775550103">WhatsApp</a>
              <a href="https://web.whatsapp.com/send?phone=+221775550104&amp;text=x">WhatsApp</a>
              <a href="whatsapp://send?abid=%2B221775550105&amp;phone=%2B221775550105">WhatsApp</a>
              <button data-phone-number="+221775550106">Voir</button>
              <div data-mobile="775550107"></div>
              <span data-seller-phone="78 555 01 08"></span>
              <a class="btn" data-whatsapp="https://wa.me/221775550109?text=Bonjour">WhatsApp</a>
              <a href="sms:+221775550110">SMS</a>
              <a href="tel:+221775550101">Rappeler</a>
            </main></body></html>
            HTML);

        $this->assertSame([
            '+221775550101', '+221775550102', '+221775550103', '+221775550104', '+221775550105',
            '+221775550106', '+221775550107', '+221785550108', '+221775550109', '+221775550110',
        ], $page->phones);
    }

    public function test_ce_qui_n_est_pas_un_numero_senegalais_n_est_pas_rendu(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><body><main><p>Villa à vendre.</p>
              <div data-listing-card-show-phone-container=".contact-bar__contact"></div>
              <a href="tel:+33612345678">France</a>
              <a href="https://wa.me/?text=partager">Partager</a>
              <a href="https://example.org/phone">Lien</a>
              <span data-phone-label="Téléphone"></span>
            </main></body></html>
            HTML);

        $this->assertSame([], $page->phones);
    }

    public function test_ac2_le_numero_d_une_organization_du_json_ld_n_est_pas_rendu(): void
    {
        $page = $this->clean(self::fixture('expat-dakar-listing.html'), 'https://www.expat-dakar.com/annonce/villa-fictive-f5-avec-piscine-8200001');

        $this->assertSame(['+221775550202'], $page->phones);
        $this->assertStringNotContainsString('6448613', $page->text);
    }

    public function test_un_numero_d_en_tete_ou_de_pied_de_page_est_celui_du_site(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><body>
              <header><a href="tel:+221338000001">Standard</a></header>
              <main><p>Studio à louer.</p><a href="tel:+221775550101">Appeler</a></main>
              <footer><a href="tel:+221338000002">Service client</a></footer>
            </body></html>
            HTML);

        $this->assertSame(['+221775550101'], $page->phones);
    }

    public function test_les_listes_de_liens_de_navigation_sont_retirees_et_la_description_gardee(): void
    {
        $page = $this->clean(self::fixture('coinafrique-listing.html'), 'https://sn.coinafrique.com/annonce/villas/vente-villa-fictive-6-pieces-saly-8100001');

        $this->assertStringContainsString('Villa fictive à vendre à Saly Portudal.', $page->text);
        $this->assertStringContainsString('Titre foncier. Prix négociable.', $page->text);
        foreach (['Voitures', 'Motos & Scooters', 'Climatiseurs', 'Appartements meublés'] as $menu) {
            $this->assertStringNotContainsString($menu, $page->text);
        }
        $this->assertContains('+221775550101', $page->phones);
    }

    public function test_une_description_qui_cite_des_liens_n_est_pas_prise_pour_un_menu(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><body><main>
              <ul class="categories"><li><a href="/a">Villas</a></li><li><a href="/b">Terrains</a></li><li><a href="/c">Bureaux</a></li><li><a href="/d">Chambres</a></li></ul>
              <div class="description"><p>Appartement F4 neuf à <a href="/q/mermoz">Mermoz</a>, proche de la <a href="/q/vdn">VDN</a>
                et de <a href="/q/sacre-coeur">Sacré-Cœur</a>. Trois chambres, deux salles de bain, cuisine équipée, parking.</p></div>
            </main></body></html>
            HTML);

        // `blockText()` met un blanc autour de chaque élément, liens compris : « Mermoz , proche » (comportement d'avant).
        $this->assertStringContainsString('Appartement F4 neuf à Mermoz', $page->text);
        $this->assertStringContainsString('Trois chambres, deux salles de bain, cuisine équipée, parking.', $page->text);
        $this->assertStringNotContainsString('Terrains', $page->text);
    }
}
