<?php

namespace Tests\Unit\Radar\Crawl;

use App\Services\Radar\Crawl\ExpatDakarAdapter;
use App\Services\Radar\Crawl\ListingPage;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2465 (ADR-0087 §1) — la page d'une annonce d'Expat-Dakar lue par son adaptateur, sans IA, sur une fixture écrite à
 * la main (données inventées, structure relevée le 2026-11-04). Le numéro du site (`Organization.telephone`) n'est
 * jamais celui de l'annonceur.
 */
class ExpatDakarListingPageTest extends TestCase
{
    private const URL = 'https://www.expat-dakar.com/annonce/villa-fictive-f5-avec-piscine-8200001';

    private const ANNONCEUR = '+221775550202';

    private const SITE = '+221766448613';

    private static function fixture(): string
    {
        return (string) file_get_contents(dirname(__DIR__, 3).'/fixtures/radar/expat-dakar-listing.html');
    }

    private function lire(?string $html = null): ListingPage
    {
        $page = (new ExpatDakarAdapter)->parseListing($html ?? self::fixture(), self::URL);
        $this->assertNotNull($page);

        return $page;
    }

    public function test_le_numero_de_l_annonceur_vient_des_attributs(): void
    {
        $this->assertSame([self::ANNONCEUR], $this->lire()->phones);
    }

    public function test_ac2_le_numero_du_site_n_est_jamais_rendu(): void
    {
        $this->assertStringContainsString('"telephone":"+221 76 6448613"', self::fixture());
        $this->assertStringContainsString('tel:+221766448613', self::fixture(), 'La fixture le porte aussi en lien : l\'exclusion est éprouvée.');
        $this->assertContains(self::SITE, (new ExpatDakarAdapter)->excludedPhones());
        $this->assertNotContains(self::SITE, $this->lire()->phones);
    }

    public function test_ac2_le_numero_d_une_organization_du_json_ld_est_ecarte_meme_hors_de_la_liste_declaree(): void
    {
        $html = str_replace(['+221 76 6448613', 'tel:+221766448613'], ['+221 33 800 00 01', 'tel:+221338000001'], self::fixture());

        $this->assertSame([self::ANNONCEUR], $this->lire($html)->phones);
    }

    public function test_la_galerie_entiere_dans_la_plus_grande_taille_sans_les_images_filigranees(): void
    {
        $this->assertSame([
            'https://i.roamcdn.net/hz/ed/listing-gallery-full-1920w/FULL1/-/BBBB/1111111111111111111111111111111111111111.jpg',
            'https://i.roamcdn.net/hz/ed/listing-gallery-full-1920w/FULL2/-/BBBB/2222222222222222222222222222222222222222.jpg',
            'https://i.roamcdn.net/hz/ed/listing-gallery-full-1920w/FULL3/-/BBBB/3333333333333333333333333333333333333333.png',
        ], $this->lire()->photoUrls);
    }

    public function test_prix_contrat_type_lieu_et_date(): void
    {
        $page = $this->lire();

        $this->assertSame(2500000, $page->price);
        $this->assertSame('XOF', $page->currency);
        $this->assertSame('rent', $page->contract);
        $this->assertSame('house', $page->propertyType);
        $this->assertSame('Almadies', $page->neighborhood);
        $this->assertSame('Dakar', $page->city);
        $this->assertNull($page->rentPeriod, 'La page ne dit pas la période : rien n\'est deviné.');
        $this->assertNull($page->bedrooms);
        $this->assertNull($page->furnished);
        $this->assertSame('2026-10-12T09:30:00+00:00', $page->postedAt?->toIso8601String(), 'Offer.validFrom, pas « Aujourd\'hui » ni l\'heure du rendu.');
    }

    public function test_un_prix_nul_reste_nul_et_une_categorie_meublee_le_dit(): void
    {
        $html = str_replace(['"listing_price":"2500000.00"', '"maisons-a-louer"'], ['"listing_price":"0.00"', '"appartements-meubles"'], self::fixture());
        $page = $this->lire($html);

        $this->assertNull($page->price);
        $this->assertTrue($page->furnished);
        $this->assertSame('apartment', $page->propertyType);
        $this->assertNull($page->contract);
    }

    public function test_la_description_est_celle_de_l_annonce_seule(): void
    {
        $page = $this->lire();

        $this->assertSame('Villa fictive F5 avec piscine', $page->title);
        $this->assertSame("Belle villa fictive F5 aux Almadies.\nQuatre chambres, piscine, jardin.", $page->description);
        $this->assertSame("Villa fictive F5 avec piscine\nBelle villa fictive F5 aux Almadies.\nQuatre chambres, piscine, jardin.", $page->text());
    }

    public function test_le_vendeur_et_ses_indices(): void
    {
        $page = $this->lire();

        $this->assertSame('Agence Fictive Immo', $page->sellerName);
        $this->assertSame([
            ['signal' => 'member_since', 'evidence' => "Membre depuis 3. mars '21"],
            ['signal' => 'verified', 'evidence' => 'Numéro de portable'],
            ['signal' => 'business_name', 'evidence' => 'Agence Fictive Immo'],
        ], $page->sellerSignals);
    }

    public function test_une_page_qui_n_est_pas_reconnue_rend_null(): void
    {
        $this->assertNull((new ExpatDakarAdapter)->parseListing('<html><body><p>Rien.</p></body></html>', self::URL));
    }
}
