<?php

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationTemplate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-588 (ADR-0032) — les gabarits WhatsApp des trois codes mobiles qui visent un contact sans
 * compte, inscrits au registre en `meta_status = pending`.
 *
 * Hors fenêtre de 24 h, Meta exige un gabarit APPROUVÉ ; tant qu'il ne l'est pas,
 * `TemplateResolver` n'en rend aucun et l'envoi bascule en SMS. Le passage à `approved` est un
 * acte d'exploitation (soumission à Meta), pas une migration.
 *
 * Le corps est le texte SMS du code, ses paramètres remplacés par les variables positionnelles
 * de Meta (`{{1}}`, `{{2}}`…) dans l'ordre de `NotificationCode::params()` — l'ordre dans lequel
 * `CodedNotification::whatsappTemplateParams()` les fournit.
 */
return new class extends Migration
{
    private const CODES = [
        NotificationCode::LeasePaymentDueSoon,
        NotificationCode::LeasePaymentOverdue,
        NotificationCode::VisitReminder,
    ];

    private const LOCALES = ['fr', 'en', 'wo'];

    public function up(): void
    {
        $now = now();
        $rows = [];
        foreach (self::CODES as $code) {
            $names = array_keys($code->params());
            foreach (self::LOCALES as $locale) {
                $rows[] = [
                    'event' => $code->value,
                    'channel' => 'whatsapp',
                    'locale' => $locale,
                    'subject' => null,
                    'body' => $this->body($code, $names, $locale),
                    'is_active' => true,
                    'meta_template_name' => 'takussan_'.str_replace('.', '_', $code->value),
                    'meta_category' => NotificationTemplate::META_CATEGORY_UTILITY,
                    'meta_status' => NotificationTemplate::META_STATUS_PENDING,
                    'meta_variables' => json_encode($names),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        DB::table('notification_templates')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        DB::table('notification_templates')
            ->where('channel', 'whatsapp')
            ->whereIn('event', array_map(fn (NotificationCode $code) => $code->value, self::CODES))
            ->delete();
    }

    /** @param  list<string>  $names */
    private function body(NotificationCode $code, array $names, string $locale): string
    {
        $text = (string) trans('notifications.codes.'.$code->value.'.sms', [], $locale);
        // Une forme accordée (`{1} …|[0,*] …`) : Meta n'en a pas, on garde la forme plurielle.
        $forms = explode('|', $text);
        $text = (string) preg_replace('/^(\{\d+\}|\[[^\]]*\])\s*/', '', end($forms));

        foreach ($names as $index => $name) {
            $text = str_replace(':'.$name, '{{'.($index + 1).'}}', $text);
        }

        return $text;
    }
};
