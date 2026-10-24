<?php

namespace Tests\Feature\Notifications;

use App\Domain\Integrations\Providers\GenericProvider;
use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
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

    /**
     * La cloche (`texteNotification.ts`, `libelleGeneriqueFournisseur`) ne reçoit que le code et
     * le nomme par la règle de `GenericProvider::label()`. Un fournisseur dont le libellé s'en
     * écarte ferait dire à la cloche un autre nom que le courriel : il faut alors l'y ajouter.
     */
    public function test_chaque_libelle_du_registre_suit_la_regle_que_la_cloche_applique(): void
    {
        foreach (app(IntegrationProviderRegistry::class)->all() as $key => $provider) {
            $this->assertSame((new GenericProvider($key))->label(), $provider->label(), "libellé de {$key}");
        }
    }

    public function test_un_fournisseur_absent_rend_le_tiret(): void
    {
        $texte = app(NotificationRenderer::class)->render(
            NotificationCode::GovernanceIntegrationChanged, ['provider' => '', 'actor' => 'Awa Diop'], 'fr',
        );

        $this->assertStringContainsString('—', $texte);
    }
}
