<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Sms\SmsSegmentCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-588, AC12 — tout SMS d'un code `mobile()` tient en deux segments, dans les trois langues,
 * avec des paramètres de taille réaliste et, quand le code en a une, sa variante avec lien.
 *
 * Un texte accentué est encodé en UCS-2 : deux segments, c'est 134 caractères, pas 306.
 */
class SmsSegmentsTest extends TestCase
{
    use RefreshDatabase;

    private const MAX_SEGMENTS = 2;

    /**
     * Des valeurs AU-DELÀ du parc, pas des « x » : l'intitulé de bien le plus long du jeu de
     * données fait 49 caractères (p99 : 43, mesuré le 2026-10-07), le nom client le plus long 16.
     */
    private const TEXTS = [
        'property' => 'Appartement F4 meublé avec terrasse, Sacré-Cœur 3',
        'tenant' => 'Mame Diarra Ndiaye-Sow Fall',
        'reference' => 'BK-2026-000123',
        'window' => '24h',
    ];

    /** @return array<string, mixed> */
    private function params(NotificationCode $code, bool $withOptional): array
    {
        $params = [];
        foreach ($code->params() as $name => $type) {
            $params[$name] = match ($type) {
                'money' => NotificationRenderer::money(1250000, 'XOF'),
                'date' => '2026-09-29',
                'datetime' => '2026-10-08T10:30:00+00:00',
                'count' => 17,
                default => self::TEXTS[$name] ?? 'Valeur réaliste',
            };
        }
        if ($withOptional) {
            foreach (array_keys($code->optionalParams()) as $name) {
                $params[$name] = 'https://takussan.com/p/7Kq2xLm9Zt';
            }
        }

        return $params;
    }

    public function test_chaque_sms_mobile_tient_en_deux_segments_dans_les_trois_langues(): void
    {
        $renderer = app(NotificationRenderer::class);
        $checked = 0;

        foreach (NotificationCode::cases() as $code) {
            if (! $code->mobile()) {
                continue;
            }
            foreach (['fr', 'en', 'wo'] as $locale) {
                foreach (array_unique([false, $code->optionalParams() !== []]) as $withOptional) {
                    $sms = $renderer->render($code, $this->params($code, $withOptional), $locale, null, 'sms');
                    $this->assertLessThanOrEqual(
                        self::MAX_SEGMENTS,
                        SmsSegmentCalculator::segmentsCount($sms),
                        "{$code->value} [{$locale}] ".mb_strlen($sms)." caractères : {$sms}",
                    );
                    $this->assertDoesNotMatchRegularExpression('/:[a-z_]+\b/', (string) preg_replace('#https?://\S+#', '', $sms), "placeholder non remplacé : {$sms}");
                    if ($withOptional) {
                        $this->assertStringContainsString('https://takussan.com/p/7Kq2xLm9Zt', $sms, 'le lien n\'est jamais tronqué');
                    }
                    $checked++;
                }
            }
        }

        // Garde contre un test vide : 7 codes mobiles, dont 2 avec lien, en trois langues.
        $this->assertGreaterThanOrEqual(27, $checked);
    }
}
