<?php

namespace Tests\Unit\Radar;

use App\Services\Radar\RobotsTxt;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2386 (ADR-0077 §10) — l'interprétation d'un `robots.txt` (RFC 9309) : le groupe qui nomme le
 * Radar l'emporte sur `*`, la règle au plus long motif décide, `Allow` gagne une égalité, `*` et
 * `$` sont des jokers.
 */
class RobotsTxtTest extends TestCase
{
    private const UA = 'TakussanRadar/1.0 (+https://takussan.com)';

    public function test_un_fichier_vide_permet_tout(): void
    {
        $this->assertTrue(RobotsTxt::allows('', '/annonce/1', self::UA));
    }

    public function test_disallow_par_prefixe(): void
    {
        $robots = "User-agent: *\nDisallow: /prive\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/prive', self::UA));
        $this->assertFalse(RobotsTxt::allows($robots, '/prive/page', self::UA));
        $this->assertFalse(RobotsTxt::allows($robots, '/privees', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/public', self::UA));
    }

    public function test_disallow_vide_permet_tout(): void
    {
        $this->assertTrue(RobotsTxt::allows("User-agent: *\nDisallow:\n", '/x', self::UA));
    }

    public function test_disallow_racine_refuse_tout(): void
    {
        $this->assertFalse(RobotsTxt::allows("User-agent: *\nDisallow: /\n", '/x', self::UA));
    }

    public function test_le_plus_long_motif_l_emporte(): void
    {
        $robots = "User-agent: *\nDisallow: /annonces/\nAllow: /annonces/dakar/\n";

        $this->assertTrue(RobotsTxt::allows($robots, '/annonces/dakar/42', self::UA));
        $this->assertFalse(RobotsTxt::allows($robots, '/annonces/thies/42', self::UA));
    }

    public function test_le_plus_long_motif_l_emporte_quel_que_soit_l_ordre(): void
    {
        $robots = "User-agent: *\nAllow: /a\nDisallow: /a/b\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/a/b/c', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/a/c', self::UA));
    }

    public function test_allow_gagne_une_egalite(): void
    {
        $robots = "User-agent: *\nDisallow: /page\nAllow: /page\n";

        $this->assertTrue(RobotsTxt::allows($robots, '/page', self::UA));
    }

    public function test_le_joker_etoile(): void
    {
        $robots = "User-agent: *\nDisallow: /*.pdf\nDisallow: /recherche*tri=\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/docs/bail.pdf', self::UA));
        $this->assertFalse(RobotsTxt::allows($robots, '/recherche?ville=dakar&tri=prix', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/recherche?ville=dakar', self::UA));
    }

    public function test_l_ancre_dollar(): void
    {
        $robots = "User-agent: *\nDisallow: /*.php$\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/index.php', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/index.php?id=1', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/index.phpx', self::UA));
    }

    public function test_les_caracteres_speciaux_d_un_motif_sont_litteraux(): void
    {
        $robots = "User-agent: *\nDisallow: /a.b(c)\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/a.b(c)/d', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/axb(c)', self::UA));
    }

    public function test_le_groupe_du_radar_l_emporte_sur_l_etoile(): void
    {
        $robots = "User-agent: *\nDisallow: /\n\nUser-agent: TakussanRadar\nAllow: /\n";

        $this->assertTrue(RobotsTxt::allows($robots, '/annonce', self::UA));
    }

    public function test_un_groupe_du_radar_qui_interdit_s_applique_meme_si_l_etoile_permet(): void
    {
        $robots = "User-agent: *\nAllow: /\n\nUser-agent: takussanradar\nDisallow: /annonce\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/annonce', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/autre', self::UA));
    }

    public function test_le_groupe_d_un_autre_robot_ne_s_applique_pas(): void
    {
        $robots = "User-agent: Googlebot\nDisallow: /\n";

        $this->assertTrue(RobotsTxt::allows($robots, '/annonce', self::UA));
    }

    public function test_plusieurs_user_agent_partagent_un_groupe(): void
    {
        $robots = "User-agent: Googlebot\nUser-agent: TakussanRadar\nDisallow: /x\n\nUser-agent: *\nDisallow: /\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/x', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/y', self::UA));
    }

    public function test_deux_groupes_du_meme_robot_se_fusionnent(): void
    {
        $robots = "User-agent: *\nDisallow: /a\n\nUser-agent: Bingbot\nDisallow: /\n\nUser-agent: *\nDisallow: /b\n";

        $this->assertFalse(RobotsTxt::allows($robots, '/a', self::UA));
        $this->assertFalse(RobotsTxt::allows($robots, '/b', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/c', self::UA));
    }

    /** @return array<string, array{string}> */
    public static function tolerances(): array
    {
        return [
            'commentaires' => ["# robots\nUser-agent: * # tous\nDisallow: /prive # privé\n"],
            'fins de ligne CRLF' => ["User-agent: *\r\nDisallow: /prive\r\n"],
            'casse des directives et blancs' => ["  USER-AGENT :  *\n  disallow :   /prive  \n"],
            'BOM UTF-8' => ["\xEF\xBB\xBFUser-agent: *\nDisallow: /prive\n"],
            'directives inconnues ignorées' => ["User-agent: *\nCrawl-delay: 10\nSitemap: https://x/s.xml\nDisallow: /prive\n"],
        ];
    }

    #[DataProvider('tolerances')]
    public function test_le_fichier_est_lu_avec_tolerance(string $robots): void
    {
        $this->assertFalse(RobotsTxt::allows($robots, '/prive/1', self::UA));
        $this->assertTrue(RobotsTxt::allows($robots, '/public', self::UA));
    }

    public function test_une_regle_hors_de_tout_groupe_est_ignoree(): void
    {
        $this->assertTrue(RobotsTxt::allows("Disallow: /\n", '/x', self::UA));
    }

    public function test_robots_txt_lui_meme_est_toujours_permis(): void
    {
        $this->assertTrue(RobotsTxt::allows("User-agent: *\nDisallow: /\n", '/robots.txt', self::UA));
    }
}
