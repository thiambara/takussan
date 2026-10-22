<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationTemplate;
use App\Notifications\CodedNotification;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Tests\TestCase;

/**
 * TCK-1348 (P132.03) — chaque gabarit WhatsApp d'un code, tel que les migrations l'inscrivent au
 * registre, s'accorde avec ce que la notification envoie : variables `{{n}}` contiguës depuis 1,
 * autant de noms dans `meta_variables`, autant de paramètres fournis, et le lien de paiement dans
 * le corps quand le code en porte un.
 *
 * Rouge avant TCK-1348 : `lease_payment.overdue` sautait `{{3}}`, `lease_payment.due_soon`
 * recevait 4 paramètres pour 3 variables, et aucun ne portait `payment_url`.
 */
class WhatsappTemplateRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_chaque_gabarit_whatsapp_d_un_code_s_accorde_avec_les_parametres_envoyes(): void
    {
        $rows = NotificationTemplate::query()->where('channel', 'whatsapp')->get()
            ->filter(fn (NotificationTemplate $row) => NotificationCode::tryFrom((string) $row->event) !== null);
        $this->assertGreaterThanOrEqual(9, $rows->count(), 'le registre ne porte plus les gabarits des codes');

        foreach ($rows as $row) {
            $code = NotificationCode::from((string) $row->event);
            $where = "{$row->event} ({$row->locale})";

            preg_match_all('/\{\{(\d+)\}\}/', (string) $row->body, $m);
            $indices = array_values(array_unique(array_map('intval', $m[1])));
            sort($indices);
            $this->assertSame($indices === [] ? [] : range(1, count($indices)), $indices, "{$where} : variables non contiguës");
            $this->assertCount(count($indices), $row->metaVariables(), "{$where} : meta_variables");

            $known = $code->params() + $code->optionalParams();
            foreach ($row->metaVariables() as $name) {
                $this->assertArrayHasKey($name, $known, "{$where} : variable « {$name} » inconnue du code");
            }
            foreach ($code->optionalParams() as $name => $type) {
                if ($type === NotificationCode::PARAM_URL) {
                    $this->assertContains($name, $row->metaVariables(), "{$where} : le lien « {$name} » manque au gabarit");
                }
            }

            $row->forceFill(['meta_status' => NotificationTemplate::META_STATUS_APPROVED])->save();
            app()->setLocale((string) $row->locale);
            $sent = (new CodedNotification($code, $this->sampleParams($code)))->whatsappTemplateParams(new AnonymousNotifiable);
            $this->assertCount(count($indices), $sent, "{$where} : paramètres envoyés");
        }
    }

    /** @return array<string, mixed> */
    private function sampleParams(NotificationCode $code): array
    {
        $out = [];
        foreach ($code->params() + $code->optionalParams() as $name => $type) {
            $out[$name] = match ($type) {
                NotificationCode::PARAM_MONEY => NotificationRenderer::money(150000, 'XOF'),
                NotificationCode::PARAM_DATE => '2026-10-22',
                NotificationCode::PARAM_DATETIME => '2026-10-22 10:00:00',
                NotificationCode::PARAM_COUNT => 3,
                NotificationCode::PARAM_URL => 'https://front.test/fr/pay/'.str_repeat('Q', 43),
                default => 'Villa',
            };
        }

        return $out;
    }
}
