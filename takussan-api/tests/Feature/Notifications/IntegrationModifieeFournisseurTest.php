<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P164.01 (TCK-1468) — l'avis « intégration modifiée » range le CODE du fournisseur
 * (`orange_money`) et le rend par son libellé (`IntegrationProvider::label()`), jamais brut.
 */
class IntegrationModifieeFournisseurTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function langues(): array
    {
        return ['fr' => ['fr'], 'en' => ['en']];
    }

    #[DataProvider('langues')]
    public function test_le_fournisseur_est_nomme_par_son_libelle(string $locale): void
    {
        $renderer = app(NotificationRenderer::class);
        $params = ['provider' => 'orange_money', 'actor' => 'Awa Diop'];

        foreach (['title', 'body', 'sms'] as $surface) {
            $texte = $renderer->render(NotificationCode::GovernanceIntegrationChanged, $params, $locale, null, $surface);
            $this->assertStringNotContainsString('orange_money', $texte, $surface);
        }
        foreach (['body', 'sms'] as $surface) {
            $texte = $renderer->render(NotificationCode::GovernanceIntegrationChanged, $params, $locale, null, $surface);
            $this->assertStringContainsString('Orange Money', $texte, $surface);
        }
    }

    public function test_un_fournisseur_hors_registre_suit_le_libelle_generique(): void
    {
        $texte = app(NotificationRenderer::class)->render(
            NotificationCode::GovernanceIntegrationChanged, ['provider' => 'sms_orange', 'actor' => 'Awa Diop'], 'fr',
        );

        $this->assertStringContainsString('Sms Orange', $texte);
    }

    public function test_un_fournisseur_absent_rend_le_tiret(): void
    {
        $texte = app(NotificationRenderer::class)->render(
            NotificationCode::GovernanceIntegrationChanged, ['provider' => '', 'actor' => 'Awa Diop'], 'fr',
        );

        $this->assertStringContainsString('—', $texte);
    }
}
