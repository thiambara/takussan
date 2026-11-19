<?php

use App\Models\NotificationTemplate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2981 (ADR-0132 §§ 3, 4) — les gabarits WhatsApp du pont sortant, inscrits au registre en
 * `meta_status = pending`, en français et en anglais (l'approbation est l'action de déploiement de TCK-2980) :
 *
 * - `pont_invitation` — `{{1}}` l'agence, `{{2}}` le sujet du fil ; un bouton de réponse rapide « Accepter les
 *   messages » dont la charge utile désigne le relais d'invitation ;
 * - `pont_nouveau_message` — `{{1}}` l'auteur, `{{2}}` l'agence, `{{3}}` le message.
 *
 * Tant qu'ils ne sont pas approuvés, `TemplateResolver` ne les rend pas : l'invitation part en message interactif
 * dans la fenêtre, et un relais hors fenêtre passe au SMS (l'ordre de repli).
 */
return new class extends Migration
{
    private const GABARITS = [
        'pont_invitation' => [
            'variables' => ['agence', 'sujet'],
            'fr' => '{{1}} souhaite vous écrire sur WhatsApp à propos de « {{2}} ». Acceptez-vous de recevoir ses messages ici ? Répondez STOP à tout moment pour arrêter.',
            'en' => '{{1}} would like to write to you on WhatsApp about “{{2}}”. Do you agree to receive their messages here? Reply STOP at any time to stop.',
        ],
        'pont_nouveau_message' => [
            'variables' => ['nom', 'agence', 'texte'],
            'fr' => '{{1}} ({{2}}) vous a écrit : {{3}}',
            'en' => '{{1}} ({{2}}) wrote to you: {{3}}',
        ],
    ];

    public function up(): void
    {
        $now = now();
        $rows = [];
        foreach (self::GABARITS as $gabarit => $definition) {
            foreach (['fr', 'en'] as $locale) {
                $rows[] = [
                    'event' => $gabarit,
                    'channel' => 'whatsapp',
                    'locale' => $locale,
                    'subject' => null,
                    'body' => $definition[$locale],
                    'is_active' => true,
                    'meta_template_name' => $gabarit,
                    'meta_category' => NotificationTemplate::META_CATEGORY_UTILITY,
                    'meta_status' => NotificationTemplate::META_STATUS_PENDING,
                    'meta_variables' => json_encode($definition['variables']),
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
            ->whereIn('event', array_keys(self::GABARITS))
            ->delete();
    }
};
