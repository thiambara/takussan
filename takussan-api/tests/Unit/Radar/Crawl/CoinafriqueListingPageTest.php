<?php

namespace Tests\Unit\Radar\Crawl;

use App\Services\Radar\Crawl\CoinafriqueAdapter;
use App\Services\Radar\Crawl\ListingPage;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2465 (ADR-0087 §1) — la page d'une annonce de CoinAfrique lue par son adaptateur, sans IA, sur une fixture écrite à
 * la main (données inventées, structure relevée le 2026-11-04) : le numéro n'est QUE dans des attributs, la galerie en
 * `background-image`, et le menu des catégories pèse plus que l'annonce.
 */
class CoinafriqueListingPageTest extends TestCase
{
    private const URL = 'https://sn.coinafrique.com/annonce/villas/vente-villa-fictive-6-pieces-saly-8100001';

    private const ANNONCEUR = '+221775550101';

    private const GALERIE = [
        'https://images.coinafrique.com/8100001_uploaded_image1_1700000001.jpg',
        'https://images.coinafrique.com/8100001_uploaded_image2_1700000002.jpeg',
        'https://images.coinafrique.com/8100001_uploaded_image3_1700000003.jpeg',
        'https://images.coinafrique.com/8100001_uploaded_image4_1700000004.jpeg',
    ];

    private static function fixture(): string
    {
        return (string) file_get_contents(dirname(__DIR__, 3).'/fixtures/radar/coinafrique-listing.html');
    }

    /** La fixture sans le JSON de l'annonce : le DOM seul. */
    private static function sansJson(): string
    {
        return (string) preg_replace('#<div id="ad-details".*?></div>#s', '', self::fixture());
    }

    private function lire(?string $html = null): ListingPage
    {
        $page = (new CoinafriqueAdapter)->parseListing($html ?? self::fixture(), self::URL);
        $this->assertNotNull($page);

        return $page;
    }

    public function test_ac1_le_numero_de_l_annonceur_vient_des_attributs_au_format_international(): void
    {
        $this->assertSame([self::ANNONCEUR], $this->lire()->phones);
        $this->assertSame([self::ANNONCEUR], $this->lire(self::sansJson())->phones, 'Sans le JSON, les attributs suffisent.');
    }

    public function test_ac1_le_texte_de_l_annonce_ne_porte_pas_le_numero(): void
    {
        $this->assertStringNotContainsString('555', $this->lire()->text(), 'Le numéro n\'est que dans les attributs : la fixture reproduit le défaut.');
    }

    public function test_un_numero_ecrit_sans_indicatif_dans_data_mobile_est_rendu_au_format_international(): void
    {
        $html = '<html><body><div class="ad__info__box ad__info__box-descriptions"><p class="title">Détails</p><p>Studio fictif.</p></div>'
            .'<div id="ad-details" data-mobile="775550101"></div></body></html>';

        $this->assertSame([self::ANNONCEUR], $this->lire($html)->phones);
    }

    public function test_le_numero_du_service_de_coinafrique_n_est_jamais_rendu(): void
    {
        $this->assertContains('+221765694843', (new CoinafriqueAdapter)->excludedPhones());
        $this->assertStringContainsString('tel:+221 765694843', self::fixture(), 'La fixture porte bien le numéro du service.');
        $this->assertNotContains('+221765694843', $this->lire()->phones);
        $this->assertNotContains('+221765694843', $this->lire(self::sansJson())->phones);
    }

    public function test_ac1_toute_la_galerie_dans_son_ordre_sans_les_vignettes(): void
    {
        $this->assertSame(self::GALERIE, $this->lire()->photoUrls);
        $this->assertSame(self::GALERIE, $this->lire(self::sansJson())->photoUrls, 'Repli : les diapositives cliquables du carrousel.');
    }

    public function test_une_photo_hors_https_ou_hors_des_hotes_d_images_est_ignoree(): void
    {
        $html = str_replace(
            ['https://images.coinafrique.com/8100001_uploaded_image2', 'https://images.coinafrique.com/8100001_uploaded_image3'],
            ['http://images.coinafrique.com/8100001_uploaded_image2', 'https://images.example.org/8100001_uploaded_image3'],
            self::fixture(),
        );

        $this->assertSame([self::GALERIE[0], self::GALERIE[3]], $this->lire($html)->photoUrls);
    }

    public function test_ac1_la_description_est_celle_de_l_annonce_sans_le_menu(): void
    {
        foreach ([$this->lire(), $this->lire(self::sansJson())] as $page) {
            $this->assertSame('Vente villa fictive 6 pièces - Saly', $page->title);
            $this->assertStringStartsWith('Villa fictive à vendre à Saly Portudal.', (string) $page->description);
            $this->assertStringContainsString('Titre foncier. Prix négociable.', (string) $page->description);
            foreach (['Voitures', 'Climatiseurs', 'Selectionnez', 'Détails du produit', 'Partagez', 'Qui sommes-nous'] as $bruit) {
                $this->assertStringNotContainsString($bruit, $page->text());
            }
        }
    }

    public function test_prix_contrat_type_lieu_et_caracteristiques(): void
    {
        foreach ([$this->lire(), $this->lire(self::sansJson())] as $page) {
            $this->assertSame(95000000, $page->price);
            $this->assertSame('XOF', $page->currency);
            $this->assertSame('villa', $page->propertyType);
            $this->assertSame('Mbour', $page->city);
            $this->assertSame('Saly Portudal', $page->neighborhood);
            $this->assertSame(6, $page->rooms, 'Des PIÈCES.');
            $this->assertNull($page->bedrooms, 'La page ne dit pas le nombre de chambres : rien n\'est deviné.');
            $this->assertSame(3, $page->bathrooms);
            $this->assertSame(350.0, $page->surfaceM2);
            $this->assertNull($page->furnished);
        }

        $page = $this->lire();
        $this->assertSame('sale', $page->contract);
        $this->assertSame('2026-10-20T09:15:00+00:00', $page->postedAt?->toIso8601String());
    }

    public function test_le_vendeur_et_ses_indices(): void
    {
        $page = $this->lire();

        $this->assertSame('Agence Fictive Immobilier', $page->sellerName);
        $this->assertSame([
            ['signal' => 'professional_badge', 'evidence' => 'Icone Professionel'],
            ['signal' => 'listing_count', 'evidence' => '57 Annonces'],
            ['signal' => 'member_since', 'evidence' => '2021-03-03T10:00:00Z'],
            ['signal' => 'business_name', 'evidence' => 'Agence Fictive Immobilier'],
        ], $page->sellerSignals);
    }

    public function test_les_champs_gardes_n_ont_ni_la_description_ni_la_galerie(): void
    {
        $fields = $this->lire()->sourceFields();

        $this->assertArrayNotHasKey('description', $fields);
        $this->assertArrayNotHasKey('photo_urls', $fields);
        $this->assertSame([self::ANNONCEUR], $fields['phones']);
        $this->assertSame(95000000, $fields['price']);
        $this->assertSame('2026-10-20T09:15:00+00:00', $fields['posted_at']);
    }

    public function test_une_page_qui_n_est_pas_reconnue_rend_null(): void
    {
        $this->assertNull((new CoinafriqueAdapter)->parseListing('<html><head><title>Villa Ngor</title></head><body><p>Villa à louer. 77 123 45 67</p></body></html>', self::URL));
        $this->assertNull((new CoinafriqueAdapter)->parseListing('', self::URL));
    }
}
