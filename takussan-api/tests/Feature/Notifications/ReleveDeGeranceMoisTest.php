<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P164.02 (TCK-1470) — l'avis « relevé de gérance disponible » range la période en `Y-m`
 * (`2026-09`) et la rend en mois écrit dans la langue du destinataire, jamais brute.
 */
class ReleveDeGeranceMoisTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, string}> */
    public static function langues(): array
    {
        return [
            'fr' => ['fr', 'septembre 2026'],
            'en' => ['en', 'September 2026'],
        ];
    }

    #[DataProvider('langues')]
    public function test_la_periode_est_rendue_en_mois_ecrit(string $locale, string $mois): void
    {
        $renderer = app(NotificationRenderer::class);

        foreach (['title', 'body', 'sms'] as $surface) {
            $texte = $renderer->render(NotificationCode::OwnerStatementAvailable, ['period' => '2026-09'], $locale, null, $surface);
            $this->assertStringNotContainsString('2026-09', $texte, $surface);
            $this->assertStringContainsString($mois, $texte, $surface);
        }
    }

    public function test_une_periode_illisible_reste_telle_quelle_et_une_absente_rend_le_tiret(): void
    {
        $renderer = app(NotificationRenderer::class);

        $this->assertStringContainsString('T3-2026', $renderer->render(NotificationCode::OwnerStatementAvailable, ['period' => 'T3-2026'], 'fr'));
        $this->assertStringContainsString('—', $renderer->render(NotificationCode::OwnerStatementAvailable, ['period' => null], 'fr'));
    }
}
