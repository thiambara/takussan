<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\HtmlCleaner;
use Tests\TestCase;

/**
 * TCK-2386 (ADR-0077 §10) — d'une page d'annonce au texte que lit l'extraction : le bruit retiré,
 * le titre, la description, les photos (URL source seulement, jamais téléchargées).
 *
 * `Tests\TestCase` et non l'unitaire pur : la borne du texte se lit dans `config/radar.php`.
 */
class HtmlCleanerTest extends TestCase
{
    private const BASE = 'https://sn.coinafrique.com/annonce/appartement-42';

    private function clean(string $html, string $base = self::BASE)
    {
        return (new HtmlCleaner)->clean($html, $base);
    }

    public function test_le_bruit_est_retire_et_le_texte_garde(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><head><title>Titre</title><style>.a{color:red}</style>
            <script>var secret = "jeton";</script></head>
            <body>
              <header>Connexion Inscription</header>
              <nav>Accueil Immobilier</nav>
              <main><h1>Appartement F3</h1><p>Almadies, 450 000 FCFA par mois.</p>
                <noscript>Activez JavaScript</noscript>
                <svg><text>icone</text></svg>
                <iframe src="https://pub.example"></iframe>
                <form><input name="q"> Rechercher</form>
              </main>
              <footer>Mentions légales</footer>
            </body></html>
            HTML);

        $this->assertStringContainsString('Appartement F3', $page->text);
        $this->assertStringContainsString('Almadies, 450 000 FCFA par mois.', $page->text);
        foreach (['secret', 'color:red', 'Connexion', 'Accueil', 'JavaScript', 'icone', 'Rechercher', 'Mentions'] as $bruit) {
            $this->assertStringNotContainsString($bruit, $page->text, $bruit);
        }
    }

    public function test_les_blancs_sont_replies(): void
    {
        $page = $this->clean("<html><body><p>Villa   \n\n\t avec\u{00A0}piscine</p><p>Saly</p></body></html>");

        $this->assertSame('Villa avec piscine Saly', $page->text);
    }

    public function test_le_titre_vient_d_og_title_avant_title(): void
    {
        $page = $this->clean('<html><head><title>Titre du site</title>'
            .'<meta property="og:title" content="  Villa à Saly  "></head><body></body></html>');

        $this->assertSame('Villa à Saly', $page->title);
    }

    public function test_le_titre_retombe_sur_title(): void
    {
        $page = $this->clean('<html><head><title> Studio Mermoz </title></head><body></body></html>');

        $this->assertSame('Studio Mermoz', $page->title);
    }

    public function test_sans_titre_le_titre_est_nul(): void
    {
        $this->assertNull($this->clean('<html><body><p>x</p></body></html>')->title);
    }

    public function test_la_description_og_precede_le_corps(): void
    {
        $page = $this->clean('<html><head><meta property="og:description" content="Trois chambres, Ouakam.">'
            .'</head><body><p>Contactez le 77 000 00 00</p></body></html>');

        $this->assertSame('Trois chambres, Ouakam. Contactez le 77 000 00 00', $page->text);
    }

    public function test_l_utf8_est_preserve_sans_declaration_de_jeu(): void
    {
        $page = $this->clean('<html><body><p>Thiès — chambre meublée, 1ᵉʳ étage, prix négociable</p></body></html>');

        $this->assertSame('Thiès — chambre meublée, 1ᵉʳ étage, prix négociable', $page->text);
    }

    public function test_le_texte_est_borne(): void
    {
        config(['radar.fetch.max_text_chars' => 50]);

        $page = $this->clean('<html><body><p>'.str_repeat('é', 200).'</p></body></html>');

        $this->assertSame(50, mb_strlen($page->text));
    }

    public function test_un_html_casse_ne_leve_pas(): void
    {
        $page = $this->clean('<div><p>Maison <b>Pikine<div></span>fin');

        $this->assertStringContainsString('Maison', $page->text);
        $this->assertStringContainsString('Pikine', $page->text);
    }

    public function test_une_chaine_vide_rend_une_page_vide(): void
    {
        $page = $this->clean('');

        $this->assertSame('', $page->text);
        $this->assertNull($page->title);
        $this->assertSame([], $page->photoUrls);
    }

    public function test_les_photos_viennent_d_og_image_et_du_json_ld_absolutisees_et_dedoublonnees(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><head>
              <meta property="og:image" content="/media/1.jpg">
              <script type="application/ld+json">
                {"@context":"https://schema.org","@type":"Product",
                 "image":["https://cdn.coinafrique.com/media/2.jpg","../media/3.jpg","/media/1.jpg"]}
              </script>
              <script type="application/ld+json">
                {"@graph":[{"@type":"Offer","image":{"@type":"ImageObject","url":"//cdn.coinafrique.com/media/4.jpg"}}]}
              </script>
            </head><body><img src="/ignore-pas-og.jpg"></body></html>
            HTML);

        $this->assertSame([
            'https://sn.coinafrique.com/media/1.jpg',
            'https://cdn.coinafrique.com/media/2.jpg',
            'https://sn.coinafrique.com/media/3.jpg',
            'https://cdn.coinafrique.com/media/4.jpg',
        ], $page->photoUrls);
    }

    public function test_seules_les_photos_http_et_https_sont_gardees(): void
    {
        $page = $this->clean(<<<'HTML'
            <html><head>
              <meta property="og:image" content="javascript:alert(1)">
              <script type="application/ld+json">
                {"image":["data:image/png;base64,AAAA","file:///etc/passwd","ftp://x/y.jpg","http://ok.example/a.jpg"]}
              </script>
            </head><body></body></html>
            HTML);

        $this->assertSame(['http://ok.example/a.jpg'], $page->photoUrls);
    }

    public function test_un_json_ld_invalide_est_ignore(): void
    {
        $page = $this->clean('<html><head><script type="application/ld+json">{pas du json</script>'
            .'<meta property="og:image" content="https://x.example/a.jpg"></head><body></body></html>');

        $this->assertSame(['https://x.example/a.jpg'], $page->photoUrls);
    }

    public function test_au_plus_vingt_photos(): void
    {
        $images = json_encode(array_map(fn ($i) => "https://cdn.example/{$i}.jpg", range(1, 30)));
        $page = $this->clean('<html><head><script type="application/ld+json">{"image":'.$images.'}</script></head><body></body></html>');

        $this->assertCount(20, $page->photoUrls);
        $this->assertSame('https://cdn.example/1.jpg', $page->photoUrls[0]);
    }

    public function test_le_json_ld_ne_fuit_pas_dans_le_texte(): void
    {
        $page = $this->clean('<html><head><script type="application/ld+json">{"image":"https://x.example/a.jpg"}</script>'
            .'</head><body><p>Texte</p></body></html>');

        $this->assertSame('Texte', $page->text);
    }
}
