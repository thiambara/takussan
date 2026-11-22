<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationTemplate;
use App\Notifications\CodedNotification;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Notifications\Whatsapp\TemplateResolver;
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
                // TCK-2706 — `charges_url` n'existe que dans la variante fusionnée, qui n'a pas de
                // gabarit Meta (`whatsappTemplateEvent()` = `<code>.<variante>`, jamais approuvé) :
                // hors fenêtre, elle retombe sur le SMS. Le gabarit du code n'a pas à le porter.
                if ($type === NotificationCode::PARAM_URL && ! in_array($name, $code->variantParams(), true)) {
                    $this->assertContains($name, $row->metaVariables(), "{$where} : le lien « {$name} » manque au gabarit");
                }
            }

            $row->forceFill(['meta_status' => NotificationTemplate::META_STATUS_APPROVED])->save();
            app()->setLocale((string) $row->locale);
            $sent = (new CodedNotification($code, $this->sampleParams($code)))->whatsappTemplateParams(new AnonymousNotifiable);
            $this->assertCount(count($indices), $sent, "{$where} : paramètres envoyés");
        }
    }

    /**
     * TCK-2706 — une relance fusionnée (loyer et charges, ou charges seules) cherche le gabarit de
     * `<code>.<variante>`, que le registre ne porte pas : hors fenêtre, le canal retombe sur le SMS,
     * qui dit chaque montant et porte chaque lien. Le gabarit du code annoncerait le total sous le
     * mot « loyer », avec le seul lien du loyer.
     */
    public function test_une_relance_fusionnee_n_a_pas_de_gabarit_et_retombe_sur_le_sms(): void
    {
        NotificationTemplate::query()->where('channel', 'whatsapp')->update(['meta_status' => NotificationTemplate::META_STATUS_APPROVED]);
        $argent = NotificationRenderer::money(150000, 'XOF');

        foreach ([NotificationCode::LeasePaymentDueSoon, NotificationCode::LeasePaymentOverdue] as $code) {
            $this->assertNotNull(app(TemplateResolver::class)->approved($code->value, 'fr'), "prémisse : {$code->value} a un gabarit approuvé");
            foreach (['rent_charges' => ['rent' => $argent, 'charges' => $argent], 'charges' => ['charges' => $argent]] as $variante => $detail) {
                $notification = new CodedNotification($code, $this->sampleParams($code) + $detail);
                $this->assertSame("{$code->value}.{$variante}", $notification->whatsappTemplateEvent());
                $this->assertNull(app(TemplateResolver::class)->approved($notification->whatsappTemplateEvent(), 'fr'));
            }
            $this->assertSame($code->value, (new CodedNotification($code, $this->sampleParams($code)))->whatsappTemplateEvent(), 'un loyer seul garde son gabarit');
        }
    }

    /** @return array<string, mixed> */
    private function sampleParams(NotificationCode $code): array
    {
        $out = [];
        foreach ($code->params() + $code->optionalParams() as $name => $type) {
            // TCK-2706 — sans les paramètres d'une variante : ils désigneraient la variante, qui n'a
            // pas de gabarit (épinglé à part, ci-dessous).
            if (in_array($name, $code->variantParams(), true)) {
                continue;
            }
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
