<?php

namespace Tests\Unit\Support;

use App\Support\Http\RobotUserAgent;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** TCK-792 (P18.04) — la liste courte reconnaît les robots déclarés, et aucun navigateur. */
class RobotUserAgentTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function robots(): array
    {
        return [
            'Googlebot' => ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
            'Googlebot smartphone' => ['Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
            'Googlebot-Image' => ['Googlebot-Image/1.0'],
            'AdsBot' => ['AdsBot-Google (+http://www.google.com/adsbot.html)'],
            'bingbot' => ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
            'Applebot' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'],
            'YandexBot' => ['Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'],
            'Baiduspider' => ['Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'],
            'Yahoo Slurp' => ['Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)'],
            'facebook' => ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
            'Twitterbot' => ['Twitterbot/1.0'],
            'AhrefsBot' => ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
            'HeadlessChrome' => ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36'],
            'curl' => ['curl/8.4.0'],
            'python' => ['python-requests/2.31.0'],
        ];
    }

    /** @return array<string, array{?string}> */
    public static function visiteurs(): array
    {
        return [
            'Chrome Android' => ['Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'],
            'Cubot' => ['Mozilla/5.0 (Linux; Android 12; CUBOT NOTE 20) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'],
            'Cubot souligné' => ['Mozilla/5.0 (Linux; Android 11; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'],
            'Safari iPhone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
            'Firefox' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'],
            'Opera Mini' => ['Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54'],
            'Samsung Internet' => ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36'],
            'rendu serveur Node' => ['node'],
            'absent' => [null],
            'vide' => [''],
        ];
    }

    #[DataProvider('robots')]
    public function test_un_robot_declare_est_reconnu(string $agent): void
    {
        $this->assertTrue(RobotUserAgent::is($agent));
    }

    #[DataProvider('visiteurs')]
    public function test_un_navigateur_n_est_pas_un_robot(?string $agent): void
    {
        $this->assertFalse(RobotUserAgent::is($agent));
    }
}
