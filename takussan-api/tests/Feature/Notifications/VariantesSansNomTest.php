<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Lang;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P164.06 (TCK-1472) — un relevé sans nom de banque et un rôle disparu ne laissent ni « — » ni
 * double espace : le rendu choisit la variante `<surface>_unnamed`, la phrase existante privée du
 * nom, comme il choisit `<surface>_link` quand un lien est fourni.
 */
class VariantesSansNomTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{NotificationCode, array<string, mixed>, string, string, string}> */
    public static function cas(): array
    {
        return [
            'relevé fr' => [NotificationCode::BankStatementImported, ['bank' => null, 'lines' => 12], 'fr',
                'Votre relevé (12 lignes) est prêt à être rapproché.', 'Takussan : relevé importé.'],
            'relevé en' => [NotificationCode::BankStatementImported, ['bank' => '', 'lines' => 1], 'en',
                'Your statement (1 line) is ready for reconciliation.', 'Takussan: statement imported.'],
            'rôle fr' => [NotificationCode::GovernanceRoleCapabilitiesChanged, ['role' => '', 'actor' => 'Awa Diop'], 'fr',
                'Les droits d\'un rôle ont été modifiés par Awa Diop.', 'Takussan : droits d\'un rôle modifiés par Awa Diop.'],
            'rôle en' => [NotificationCode::GovernanceRoleCapabilitiesChanged, ['role' => null, 'actor' => 'Awa Diop'], 'en',
                'The permissions of a role were changed by Awa Diop.', 'Takussan: role permissions changed by Awa Diop.'],
        ];
    }

    /** @param  array<string, mixed>  $params */
    #[DataProvider('cas')]
    public function test_sans_le_nom_la_variante_est_choisie(NotificationCode $code, array $params, string $locale, string $corps, string $sms): void
    {
        $renderer = app(NotificationRenderer::class);

        $this->assertSame($corps, $renderer->render($code, $params, $locale, null, 'body'));
        $this->assertSame($corps, $renderer->render($code, $params, $locale, null, 'mail_body'));
        $this->assertSame($sms, $renderer->render($code, $params, $locale, null, 'sms'));
    }

    public function test_avec_le_nom_la_phrase_d_origine_reste(): void
    {
        $renderer = app(NotificationRenderer::class);

        $this->assertSame('Votre relevé CBAO (12 lignes) est prêt à être rapproché.',
            $renderer->render(NotificationCode::BankStatementImported, ['bank' => 'CBAO', 'lines' => 12], 'fr'));
        $this->assertSame('Les droits du rôle Agent ont été modifiés par Awa Diop.',
            $renderer->render(NotificationCode::GovernanceRoleCapabilitiesChanged, ['role' => 'Agent', 'actor' => 'Awa Diop'], 'fr'));
    }

    public function test_chaque_variante_existe_dans_les_trois_langues(): void
    {
        foreach (['fr', 'en', 'wo'] as $langue) {
            foreach (['bank_statement.imported', 'governance.role_capabilities_changed'] as $code) {
                foreach (['body_unnamed', 'sms_unnamed'] as $surface) {
                    $this->assertTrue(Lang::hasForLocale("notifications.codes.{$code}.{$surface}", $langue), "{$code}.{$surface} absente en {$langue}");
                }
            }
        }
    }
}
