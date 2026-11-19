<?php

use App\Models\NotificationTemplate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2982 (ADR-0132 § 5) — le gabarit WhatsApp `pont_lien_action` du lien d'action, inscrit au registre en
 * `meta_status = pending`, en français et en anglais (le patron de `resume_hebdo_bailleur`). Ses variables :
 * `{{1}}` l'agence, `{{2}}` le geste ; le bouton d'URL porte le jeton en suffixe variable. Tant qu'il n'est pas
 * approuvé, le lien part en texte libre dans la fenêtre, puis par SMS (l'ordre de repli).
 */
return new class extends Migration
{
    private const GABARIT = 'pont_lien_action';

    private const LOCALES = ['fr', 'en'];

    public function up(): void
    {
        $now = now();
        $rows = [];
        foreach (self::LOCALES as $locale) {
            $rows[] = [
                'event' => self::GABARIT,
                'channel' => 'whatsapp',
                'locale' => $locale,
                'subject' => null,
                'body' => (string) trans('pont.lien_action_gabarit', [], $locale),
                'is_active' => true,
                'meta_template_name' => self::GABARIT,
                'meta_category' => NotificationTemplate::META_CATEGORY_UTILITY,
                'meta_status' => NotificationTemplate::META_STATUS_PENDING,
                // Le corps : {{1}} l'agence, {{2}} le geste. Le bouton d'URL porte le jeton en suffixe {{1}} : il n'est pas
                // une variable du corps (`RelaisSortant::envoyer(…, boutonUrl:)`).
                'meta_variables' => json_encode(['agence', 'geste']),
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
