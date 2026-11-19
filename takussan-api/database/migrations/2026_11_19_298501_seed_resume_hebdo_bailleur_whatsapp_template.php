<?php

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationTemplate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2985 (ADR-0132 § 6, § 7) — le gabarit WhatsApp `resume_hebdo_bailleur` du résumé du lundi (clé et nom chez Meta,
 * la convention des gabarits du pont), inscrit au registre
 * en `meta_status = pending`, en français et en anglais. Tant qu'il n'est pas approuvé, le résumé part par e-mail ;
 * le faire approuver est l'action de déploiement `ouvrir-le-pont-whatsapp` (TCK-2980).
 *
 * Le corps est le texte `body` du code, ses paramètres remplacés par les variables positionnelles de Meta (`{{1}}`…)
 * dans l'ordre de `NotificationCode::params()`.
 */
return new class extends Migration
{
    private const GABARIT = 'resume_hebdo_bailleur';

    private const LOCALES = ['fr', 'en'];

    public function up(): void
    {
        $code = NotificationCode::OwnerWeeklyDigest;
        $names = array_keys($code->params());
        $now = now();
        $rows = [];
        foreach (self::LOCALES as $locale) {
            $text = (string) trans('notifications.codes.'.$code->value.'.body', [], $locale);
            foreach ($names as $index => $name) {
                $text = str_replace(':'.$name, '{{'.($index + 1).'}}', $text);
            }
            $rows[] = [
                // La clé que le pont cherche (`ResumeDuLundi::GABARIT`), comme `pont_invitation`.
                'event' => self::GABARIT,
                'channel' => 'whatsapp',
                'locale' => $locale,
                'subject' => null,
                'body' => $text,
                'is_active' => true,
                'meta_template_name' => self::GABARIT,
                'meta_category' => NotificationTemplate::META_CATEGORY_UTILITY,
                'meta_status' => NotificationTemplate::META_STATUS_PENDING,
                'meta_variables' => json_encode($names),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table('notification_templates')->insertOrIgnore($rows);
    }

    public function down(): void
    {
        DB::table('notification_templates')
            ->where('channel', 'whatsapp')
            ->where('event', self::GABARIT)
            ->delete();
    }
};
