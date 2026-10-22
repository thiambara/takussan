<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Events\Permissions\RoleDelegationActivated;
use App\Listeners\Permissions\NotifyDelegationActivated;
use App\Models\AppNotification;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1322 (P128.02) — le rôle d'une délégation est un CODE (`agency_admin`, `agent`, `owner`) :
 * les six notifications `role_delegation.*` le rendent par son libellé, dans la langue du
 * destinataire, jamais par le code brut. Une ligne déjà écrite garde son code et se traduit à la
 * lecture.
 */
class RoleDelegationNotificationRoleTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, string}> */
    public static function langues(): array
    {
        return [
            'fr' => ['fr', "administrateur d'agence"],
            'en' => ['en', 'agency administrator'],
        ];
    }

    #[DataProvider('langues')]
    public function test_les_six_codes_de_delegation_rendent_le_libelle_du_role(string $locale, string $libelle): void
    {
        $renderer = app(NotificationRenderer::class);
        $params = ['role' => 'agency_admin', 'ends_at' => '2026-10-25', 'beneficiary' => 'Awa Diop'];

        foreach (NotificationCode::cases() as $code) {
            if (! str_starts_with($code->value, 'role_delegation.')) {
                continue;
            }
            foreach (['title', 'body', 'sms'] as $surface) {
                $texte = $renderer->render($code, $params, $locale, null, $surface);
                $this->assertStringNotContainsString('agency_admin', $texte, "{$code->value} / {$surface}");
                $this->assertStringContainsString($libelle, $texte, "{$code->value} / {$surface}");
            }
        }
    }

    public function test_un_code_de_role_inconnu_reste_rendu_tel_quel(): void
    {
        $texte = app(NotificationRenderer::class)->render(
            NotificationCode::RoleDelegationExpired, ['role' => 'role_inconnu'], 'fr',
        );

        $this->assertStringContainsString('role_inconnu', $texte);
    }

    public function test_la_ligne_ecrite_garde_le_code_brut_et_rend_le_libelle(): void
    {
        $delegation = RoleDelegation::factory()->create([
            'role' => 'agency_admin',
            'user_id' => User::factory()->create(['preferred_language' => 'en'])->id,
        ]);

        app(NotifyDelegationActivated::class)->handle(new RoleDelegationActivated($delegation));

        $ligne = AppNotification::query()->where('user_id', $delegation->user_id)->sole();
        $this->assertSame('agency_admin', $ligne->params['role']);
        $this->assertStringNotContainsString('agency_admin', $ligne->title.' '.$ligne->body);
        $this->assertStringContainsString('agency administrator', $ligne->body);
    }
}
