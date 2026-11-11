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
 *
 * TCK-2706 (décisions de la session du 2026-11-11) — UNE exception déclarée : la relance qui
 * fusionne loyer et charges (variante `rent_charges`, avec ou sans liens) a droit à
 * {@see MAX_SEGMENTS_FUSION}. Deux motifs, mesurés à l'écriture :
 *  - sans lien, trois montants, la date (ou le retard) ET le nom du bien dépassent 134 caractères
 *    avec un intitulé long : le nom du bien reste, parce qu'un locataire ou un bailleur à plusieurs
 *    biens ne saurait plus de quel bien il s'agit (3 segments) ;
 *  - avec liens, c'est le prix de la voie 2 du porteur (un lien par échéance, deux liens) : 3
 *    segments avec le lien d'échantillon de ce test, 4 avec des liens de longueur RÉELLE
 *    (`https://takussan.com/fr/pay/` + 43 caractères).
 * La variante `charges` (charges seules) et tout le reste restent à {@see MAX_SEGMENTS}.
 *
 * ⚠ Ce test mesure avec un lien d'échantillon de 33 caractères, plus court qu'un vrai lien de paiement
 * (71) : le SMS à UN lien de longueur réelle fait déjà 3 segments (trou préexistant, relevé par
 * TCK-2706 et non corrigé ici).
 */
class SmsSegmentsTest extends TestCase
{
    use RefreshDatabase;

    private const MAX_SEGMENTS = 2;

    /** TCK-2706 — la seule exception (relance fusionnée loyer et charges), motivée en tête de classe. */
    private const MAX_SEGMENTS_FUSION = 3;

    private const LIEN = 'https://takussan.com/p/7Kq2xLm9Zt';

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
            $params[$name] = $this->valeur($name, $type);
        }
        if ($withOptional) {
            foreach ($code->optionalParams() as $name => $type) {
                if (! in_array($name, $code->variantParams(), true)) {
                    $params[$name] = $this->valeur($name, $type);
                }
            }
        }

        return $params;
    }

    private function valeur(string $name, string $type): mixed
    {
        return match ($type) {
            'money' => NotificationRenderer::money(1250000, 'XOF'),
            'date' => '2026-09-29',
            'datetime' => '2026-10-08T10:30:00+00:00',
            'count' => 17,
            'url' => self::LIEN,
            default => self::TEXTS[$name] ?? 'Valeur réaliste',
        };
    }

    /**
     * Les jeux de paramètres d'un code : sans facultatif, avec son lien, et — TCK-2706 — chaque
     * variante ({@see NotificationCode::variant()}), sans puis avec ses liens.
     *
     * @return list<array{0: array<string, mixed>, 1: int}> les paramètres, le plafond de segments
     */
    private function jeux(NotificationCode $code): array
    {
        $jeux = [];
        foreach (array_unique([false, $code->optionalParams() !== []]) as $withOptional) {
            $jeux[] = [$this->params($code, $withOptional), self::MAX_SEGMENTS];
        }
        if ($code->variantParams() === []) {
            return $jeux;
        }
        $avecLiens = array_key_exists('payment_url', $code->optionalParams());
        $argent = NotificationRenderer::money(1250000, 'XOF');
        foreach (['rent_charges' => ['rent' => $argent, 'charges' => $argent], 'charges' => ['charges' => $argent]] as $variante => $detail) {
            $base = $this->params($code, false) + $detail;
            $this->assertSame($variante, $code->variant($base));
            $plafond = $variante === 'rent_charges' ? self::MAX_SEGMENTS_FUSION : self::MAX_SEGMENTS;
            $jeux[] = [$base, $plafond];
            if ($avecLiens) {
                $liens = $variante === 'rent_charges' ? ['payment_url' => self::LIEN, 'charges_url' => self::LIEN] : ['payment_url' => self::LIEN];
                $jeux[] = [$base + $liens, $plafond];
            }
        }

        return $jeux;
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
                foreach ($this->jeux($code) as [$params, $plafond]) {
                    $sms = $renderer->render($code, $params, $locale, null, 'sms');
                    $this->assertLessThanOrEqual(
                        $plafond,
                        SmsSegmentCalculator::segmentsCount($sms),
                        "{$code->value} [{$locale}] ".mb_strlen($sms)." caractères : {$sms}",
                    );
                    $this->assertDoesNotMatchRegularExpression('/:[a-z_]+\b/', (string) preg_replace('#https?://\S+#', '', $sms), "placeholder non remplacé : {$sms}");
                    $liens = array_filter($params, fn ($v) => $v === self::LIEN);
                    $this->assertSame(count($liens), substr_count($sms, self::LIEN), "chaque lien, jamais tronqué : {$sms}");
                    $checked++;
                }
            }
        }

        // Garde contre un test vide : 7 codes mobiles, dont 2 avec lien, en trois langues ; et les
        // variantes de TCK-2706 (deux codes à liens, un sans).
        $this->assertGreaterThanOrEqual(27 + 3 * (4 + 4 + 2), $checked);
    }
}
