<?php

use App\Domain\Notifications\NotificationCode;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * TCK-1348 (P132.03) — les neuf gabarits WhatsApp semés par `2026_10_07_100100_…` réécrits pour
 * s'accorder avec ce que la notification envoie.
 *
 * La migration d'origine tirait le corps de la variante `sms` (sans lien) et numérotait les
 * variables selon `params()` : `lease_payment.overdue` sautait `{{3}}` (`due_date` absent du
 * texte), `visit.reminder` déclarait `window` sans l'employer, et aucun ne portait le lien de
 * paiement que le SMS donne.
 *
 * Ici : le corps vient de la variante `sms_link` quand le code en a une, sinon de `sms` ; ses
 * variables sont numérotées dans leur ordre d'apparition, et `meta_variables` les nomme dans cet
 * ordre — c'est la liste que `CodedNotification::whatsappTemplateParams()` lit pour envoyer.
 * `meta_status` n'est pas touché : la soumission à Meta reste un acte d'exploitation.
 *
 * `down()` rend la forme d'origine (même calcul que `2026_10_07_100100_…`).
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
        foreach (self::CODES as $code) {
            foreach (self::LOCALES as $locale) {
                $key = 'notifications.codes.'.$code->value.'.sms_link';
                $text = trans($key, [], $locale);
                if (! is_string($text) || $text === $key) {
                    $text = (string) trans('notifications.codes.'.$code->value.'.sms', [], $locale);
                }
                $text = $this->lastForm($text);

                $known = array_keys($code->params() + $code->optionalParams());
                // Les noms les plus longs d'abord : `:amount` ne doit pas mordre sur un `:amount_x`.
                usort($known, fn (string $a, string $b) => strlen($b) <=> strlen($a));
                preg_match_all('/:('.implode('|', array_map('preg_quote', $known)).')\b/', $text, $m);
                $names = array_values(array_unique($m[1]));
                foreach ($names as $index => $name) {
                    $text = (string) preg_replace('/:'.preg_quote($name, '/').'\b/', '{{'.($index + 1).'}}', $text);
                }

                $this->write($code, $locale, $text, $names);
            }
        }
    }

    public function down(): void
    {
        foreach (self::CODES as $code) {
            $names = array_keys($code->params());
            foreach (self::LOCALES as $locale) {
                $text = $this->lastForm((string) trans('notifications.codes.'.$code->value.'.sms', [], $locale));
                foreach ($names as $index => $name) {
                    $text = str_replace(':'.$name, '{{'.($index + 1).'}}', $text);
                }
                $this->write($code, $locale, $text, $names);
            }
        }
    }

    /** Une forme accordée (`{1} …|[0,*] …`) : Meta n'en a pas, on garde la forme plurielle. */
    private function lastForm(string $text): string
    {
        $forms = explode('|', $text);

        return (string) preg_replace('/^(\{\d+\}|\[[^\]]*\])\s*/', '', end($forms));
    }

    /** @param  list<string>  $names */
    private function write(NotificationCode $code, string $locale, string $body, array $names): void
    {
        DB::table('notification_templates')
            ->where('channel', 'whatsapp')
            ->where('event', $code->value)
            ->where('locale', $locale)
            ->update(['body' => $body, 'meta_variables' => json_encode($names), 'updated_at' => now()]);
    }
};
