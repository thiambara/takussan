<?php

namespace Tests\Unit\Radar\Crawl;

use App\Services\Radar\Crawl\RadarSitemapReader;
use App\Services\Radar\Crawl\SitemapEntry;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2467 (ADR-0087 §4) — la lecture d'un sitemap d'annonces : sans réseau, sans entité, sans DTD. Sitemaps écrits à la
 * main dans la forme relevée sur Expat-Dakar le 2026-11-04 (URL et dates inventées).
 */
class RadarSitemapReaderTest extends TestCase
{
    private const SITEMAP = 'https://www.expat-dakar.com/sitemap-listings-appartements-a-louer-fr.xml';

    private const HEAD = '<?xml version="1.0" encoding="UTF-8"?>'."\n"
        .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';

    public function test_une_entree_par_url_avec_sa_date_en_utc(): void
    {
        $entries = RadarSitemapReader::parse(self::HEAD
            .'<url><loc>https://www.expat-dakar.com/annonce/f3-fictif-9400001</loc><lastmod>2026-08-09T20:31:49+00:00</lastmod>'
            .'<image:image><image:loc>https://i.roamcdn.net/x.jpg</image:loc></image:image></url>'
            .'<url><loc> https://www.expat-dakar.com/annonce/f4-fictif-9400002 </loc><lastmod>2026-08-10T10:00:00+02:00</lastmod></url>'
            .'<url><loc>https://www.expat-dakar.com/annonce/sans-date-9400003</loc></url>'
            .'<url><loc>https://www.expat-dakar.com/annonce/date-illisible-9400004</loc><lastmod>hier</lastmod></url>'
            .'<url><loc>https://www.expat-dakar.com/annonce/jour-seul-9400005</loc><lastmod>2026-08-11</lastmod></url>'
            .'</urlset>', self::SITEMAP);

        $this->assertNotNull($entries);
        $this->assertSame([
            'https://www.expat-dakar.com/annonce/f3-fictif-9400001',
            'https://www.expat-dakar.com/annonce/f4-fictif-9400002',
            'https://www.expat-dakar.com/annonce/sans-date-9400003',
            'https://www.expat-dakar.com/annonce/date-illisible-9400004',
            'https://www.expat-dakar.com/annonce/jour-seul-9400005',
        ], array_map(fn (SitemapEntry $e) => $e->url, $entries));
        $this->assertSame('2026-08-09 20:31:49', $entries[0]->lastmod?->format('Y-m-d H:i:s'));
        $this->assertSame('2026-08-10 08:00:00', $entries[1]->lastmod?->format('Y-m-d H:i:s'), 'Ramenée en UTC.');
        $this->assertNull($entries[2]->lastmod);
        $this->assertNull($entries[3]->lastmod);
        $this->assertSame('2026-08-11 00:00:00', $entries[4]->lastmod?->format('Y-m-d H:i:s'));
    }

    public function test_une_url_hors_de_l_hote_du_sitemap_ou_hors_https_est_ignoree_et_un_doublon_compte_une_fois(): void
    {
        $entries = RadarSitemapReader::parse(self::HEAD
            .'<url><loc>https://evil.example/annonce/piege-9400010</loc></url>'
            .'<url><loc>http://www.expat-dakar.com/annonce/en-clair-9400011</loc></url>'
            .'<url><loc>https://www.expat-dakar.com:8443/annonce/port-9400012</loc></url>'
            .'<url><loc>https://www.expat-dakar.com/annonce/bonne-9400013</loc></url>'
            .'<url><loc>https://www.expat-dakar.com/annonce/bonne-9400013</loc></url>'
            .'</urlset>', self::SITEMAP);

        $this->assertSame(['https://www.expat-dakar.com/annonce/bonne-9400013'], array_map(fn (SitemapEntry $e) => $e->url, $entries ?? []));
    }

    public function test_une_entite_externe_est_refusee_avant_l_analyse(): void
    {
        $this->assertNull(RadarSitemapReader::parse('<?xml version="1.0"?>'."\n"
            .'<!DOCTYPE urlset [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>&xxe;</loc></url></urlset>', self::SITEMAP));
    }

    public function test_une_expansion_d_entites_internes_est_refusee(): void
    {
        $this->assertNull(RadarSitemapReader::parse('<?xml version="1.0"?>'
            .'<!DOCTYPE urlset [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>'
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.expat-dakar.com/&b;</loc></url></urlset>', self::SITEMAP));
    }

    public function test_une_dtd_meme_sans_entite_est_refusee(): void
    {
        $this->assertNull(RadarSitemapReader::parse('<?xml version="1.0"?><!doctype urlset SYSTEM "http://169.254.169.254/x.dtd">'
            .'<urlset><url><loc>https://www.expat-dakar.com/annonce/x-1</loc></url></urlset>', self::SITEMAP));
    }

    public function test_un_document_mal_forme_un_index_ou_une_page_d_erreur_ne_sont_pas_des_sitemaps(): void
    {
        $this->assertNull(RadarSitemapReader::parse(self::HEAD.'<url><loc>https://www.expat-dakar.com/a', self::SITEMAP));
        $this->assertNull(RadarSitemapReader::parse('<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            .'<sitemap><loc>https://www.expat-dakar.com/sitemap-listings-x-fr.xml</loc></sitemap></sitemapindex>', self::SITEMAP));
        $this->assertNull(RadarSitemapReader::parse("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<error><code>404</code><message>Not Found</message></error>", self::SITEMAP));
        $this->assertNull(RadarSitemapReader::parse('', self::SITEMAP));
    }

    public function test_un_urlset_vide_rend_une_liste_vide(): void
    {
        $this->assertSame([], RadarSitemapReader::parse(self::HEAD.'</urlset>', self::SITEMAP));
    }
}
