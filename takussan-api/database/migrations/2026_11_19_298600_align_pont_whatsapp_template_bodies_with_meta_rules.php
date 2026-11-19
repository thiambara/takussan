<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2980 (ADR-0132 § 7, action de déploiement `ouvrir-le-pont-whatsapp`) — les corps des quatre gabarits du pont,
 * réécrits pour passer les règles de format de Meta, relevées le 2026-11-19 en préparant leur soumission : un corps ne
 * commence ni ne finit par une variable, deux variables ne se suivent pas avec seulement une ponctuation entre elles,
 * et il n'y a pas plus d'une variable pour trois mots environ. Les corps semés par 298100, 298202 et 298501 étaient
 * refusés sur l'un de ces points.
 *
 * Les variables gardent leur nombre et leur ordre (`meta_variables` inchangé) : l'envoi se fait par nom de gabarit et
 * par position, rien d'autre ne change. Le registre doit dire le texte que Meta a approuvé.
 */
return new class extends Migration
{
    /** @var array<string, array{fr: array{0: string, 1: string}, en: array{0: string, 1: string}}> [avant, après] */
    private const CORPS = [
        'pont_invitation' => [
            'fr' => [
                '{{1}} souhaite vous écrire sur WhatsApp à propos de « {{2}} ». Acceptez-vous de recevoir ses messages ici ? Répondez STOP à tout moment pour arrêter.',
                'Bonjour, {{1}} souhaite vous écrire sur WhatsApp à propos de « {{2}} ». Acceptez-vous de recevoir ses messages ici ? Répondez STOP à tout moment pour arrêter.',
            ],
            'en' => [
                '{{1}} would like to write to you on WhatsApp about “{{2}}”. Do you agree to receive their messages here? Reply STOP at any time to stop.',
                'Hello, {{1}} would like to write to you on WhatsApp about “{{2}}”. Do you agree to receive their messages here? Reply STOP at any time to stop.',
            ],
        ],
        'pont_nouveau_message' => [
            'fr' => [
                '{{1}} ({{2}}) vous a écrit : {{3}}',
                "Nouveau message de {{1}}, de l'agence {{2}}. Son message : « {{3}} ». Vous pouvez répondre directement ici.",
            ],
            'en' => [
                '{{1}} ({{2}}) wrote to you: {{3}}',
                'New message from {{1}}, of the agency {{2}}. Their message: “{{3}}”. You can reply directly here.',
            ],
        ],
        'pont_lien_action' => [
            'fr' => [
                "{{1}} vous invite à {{2}}. Ouvrez le lien pour le faire sans vous connecter ; il est valable 7 jours et ne sert qu'une fois.",
                "Bonjour, {{1}} vous invite à {{2}}. Ouvrez le lien pour le faire sans vous connecter ; il est valable 7 jours et ne sert qu'une fois.",
            ],
            'en' => [
                '{{1}} invites you to {{2}}. Open the link to do it without signing in; it is valid for 7 days and works only once.',
                'Hello, {{1}} invites you to {{2}}. Open the link to do it without signing in; it is valid for 7 days and works only once.',
            ],
        ],
        'resume_hebdo_bailleur' => [
            'fr' => [
                '{{1}} — loyers encaissés : {{2}} ({{3}}). En retard : {{4}} ({{5}}). Interventions ouvertes : {{6}}, closes : {{7}}. Visites confirmées : {{8}}.',
                'Bonjour, voici le résumé de la semaine de {{1}}. Loyers encaissés : {{2}}, pour un total de {{3}}. Loyers en retard : {{4}}, pour un total de {{5}}. Interventions ouvertes cette semaine : {{6}} ; interventions closes : {{7}}. Visites confirmées : {{8}}. Bonne semaine.',
            ],
            'en' => [
                '{{1}} — rent collected: {{2}} ({{3}}). Overdue: {{4}} ({{5}}). Maintenance opened: {{6}}, closed: {{7}}. Visits confirmed: {{8}}.',
                'Hello, here is the weekly summary from {{1}}. Rent collected: {{2}}, for a total of {{3}}. Rent overdue: {{4}}, for a total of {{5}}. Maintenance requests opened this week: {{6}}; requests closed: {{7}}. Visits confirmed: {{8}}. Have a good week.',
            ],
        ],
    ];

    public function up(): void
    {
        $this->ecrire(1);
    }

    public function down(): void
    {
        $this->ecrire(0);
    }

    private function ecrire(int $version): void
    {
        foreach (self::CORPS as $gabarit => $langues) {
            foreach ($langues as $locale => $corps) {
                DB::table('notification_templates')
                    ->where('channel', 'whatsapp')
                    ->where('meta_template_name', $gabarit)
                    ->where('locale', $locale)
                    ->update(['body' => $corps[$version], 'updated_at' => now()]);
            }
        }
    }
};
