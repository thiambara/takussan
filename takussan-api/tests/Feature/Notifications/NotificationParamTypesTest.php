<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P164.05 (TCK-1806) — la ressource du fil rend la NATURE de chaque paramètre (`param_types`),
 * dérivée du catalogue : la cloche choisit sa branche de formatage par elle, au lieu de la
 * deviner par le préfixe du code ou la forme de la valeur.
 */
class NotificationParamTypesTest extends TestCase
{
    use RefreshDatabase;

    private function ligne(User $user, ?string $code, array $params = []): AppNotification
    {
        return AppNotification::create([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'delivery_channel' => NotificationChannel::App,
            'title' => 'Titre',
            'body' => 'Corps',
            'is_read' => false,
            'code' => $code,
            'params' => $params,
        ]);
    }

    public function test_un_code_connu_rend_la_nature_de_ses_parametres_facultatifs_compris(): void
    {
        $user = User::factory()->create();
        $this->ligne($user, NotificationCode::LeasePaymentDueSoon->value, [
            'amount' => ['amount' => '1000.00', 'currency' => 'XOF'], 'due_date' => '2026-10-30', 'property' => '2026-10-30',
        ]);
        Sanctum::actingAs($user);

        $types = $this->getJson('/api/notifications')->assertOk()->json('data.0.param_types');

        $this->assertSame([
            'amount' => NotificationCode::PARAM_MONEY,
            'due_date' => NotificationCode::PARAM_DATE,
            'property' => NotificationCode::PARAM_TEXT,
            'payment_url' => NotificationCode::PARAM_URL,
        ], $types);
    }

    public function test_chaque_code_du_catalogue_rend_ses_natures_declarees(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        foreach (NotificationCode::cases() as $code) {
            $ligne = $this->ligne($user, $code->value);
            $types = $this->postJson("/api/notifications/{$ligne->id}/read")->assertOk()->json('data.param_types');

            $this->assertSame($code->params() + $code->optionalParams(), $types ?? [], $code->value);
        }
    }

    public function test_une_ligne_sans_code_ne_rend_aucune_nature(): void
    {
        $user = User::factory()->create();
        $this->ligne($user, null);
        Sanctum::actingAs($user);

        $this->getJson('/api/notifications')->assertOk()->assertJsonPath('data.0.param_types', null);
    }

    public function test_le_champ_clairseme_le_rend_ou_l_omet(): void
    {
        $user = User::factory()->create();
        $this->ligne($user, NotificationCode::RoleDelegationActivated->value, ['role' => 'agent', 'ends_at' => '2026-10-30']);
        Sanctum::actingAs($user);

        $avec = $this->getJson('/api/notifications?fields[app_notifications]=id,code,params,param_types')->assertOk()->json('data.0');
        $this->assertSame(['role' => 'role', 'ends_at' => 'date'], $avec['param_types']);

        $sans = $this->getJson('/api/notifications?fields[app_notifications]=id,code,params')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('param_types', $sans);
    }
}
