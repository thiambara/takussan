<?php

namespace Tests\Unit\Lang;

use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\NotificationType;
use App\Models\Enums\PropertyCondition;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use App\Models\ThresholdAlert;
use BackedEnum;
use PHPUnit\Framework\TestCase;

/**
 * P192.03 (TCK-1878) — l'API bâtit des clés de libellé sur une valeur (`properties.status.<cas>`,
 * `notifications.types.<type>`…). Un cas ajouté à l'enum sans sa clé ne lève rien : selon
 * l'appelant, le libellé sort `null` (`BaseResource::enumLabel`), en code brut, ou en clé brute
 * (`__()` sans repli). C'est ainsi que `pending_review` et `rejected` sont restés sans libellé
 * (P192.02, TCK-1876), sans qu'aucun test rougisse.
 *
 * {@see LangGroupParityTest} compare les langues ENTRE ELLES ; ce test compare chaque groupe à la
 * SOURCE de ses valeurs. La table est écrite à la main, à dessein : une clé bâtie neuve s'y ajoute
 * à la revue, avec la source qu'elle lit.
 */
class LabelKeysCoverValuesTest extends TestCase
{
    private const LOCALES = ['fr', 'en', 'wo'];

    /**
     * Groupe de clés => [fichier de langue, chemin dans le fichier, qui lit ces clés].
     *
     * @return array<string, array{0: string, 1: string, 2: list<string>}>
     */
    private function table(): array
    {
        return [
            'properties.type' => ['properties.php', 'type', $this->cases(PropertyType::class)],
            'properties.contract_type' => ['properties.php', 'contract_type', $this->cases(ContractType::class)],
            'properties.rent_period' => ['properties.php', 'rent_period', $this->cases(RentPeriod::class)],
            'properties.status' => ['properties.php', 'status', $this->cases(PropertyStatus::class)],
            'properties.title_type' => ['properties.php', 'title_type', $this->cases(TitleType::class)],
            'properties.condition' => ['properties.php', 'condition', $this->cases(PropertyCondition::class)],
            // BankStatementResource, BankStatementLineResource : `__()` sans repli.
            'reconciliation.status' => ['reconciliation.php', 'status', $this->cases(BankStatementStatus::class)],
            'reconciliation.line_status' => ['reconciliation.php', 'line_status', $this->cases(BankStatementLineMatchStatus::class)],
            // SystemMessageFactory : `__()` sans repli.
            'maintenance.status' => ['maintenance.php', 'status', $this->cases(MaintenanceStatus::class)],
            // notification-digest.blade.php : `__()` sans repli.
            'notifications.types' => ['notifications.php', 'types', $this->cases(NotificationType::class)],
            // ThresholdAlertTriggered::libelle : repli sur le code.
            'notifications.threshold_alert_mail.metrics' => ['notifications.php', 'threshold_alert_mail.metrics', ThresholdAlert::allowedMetrics()],
            'notifications.threshold_alert_mail.severities' => ['notifications.php', 'threshold_alert_mail.severities', ThresholdAlert::allowedSeverities()],
            // pdf/maintenance/quote.blade.php : `kinds.<kind>`, valeurs de la règle `in:` de la requête.
            'maintenance.quote_pdf.kinds' => ['maintenance.php', 'quote_pdf.kinds', $this->inRule('app/Http/Requests/Maintenance/SubmitQuoteRequest.php', 'lines.*.kind')],
        ];
    }

    public function test_chaque_valeur_a_sa_cle_de_libelle_dans_les_trois_langues(): void
    {
        $gaps = [];
        $checked = 0;
        foreach ($this->table() as $group => [$file, $path, $values]) {
            $this->assertNotEmpty($values, "{$group} : aucune valeur lue à la source, la garde ne regarderait rien.");
            foreach (self::LOCALES as $locale) {
                $labels = $this->labels($locale, $file, $path);
                foreach ($values as $value) {
                    $checked++;
                    if (! is_string($labels[$value] ?? null) || $labels[$value] === '') {
                        $gaps[] = "{$locale} : {$group}.{$value} absente";
                    }
                }
            }
        }

        $this->assertGreaterThan(150, $checked, 'Presque rien vérifié : la garde ne regarderait rien.');
        $this->assertSame([], $gaps, implode("\n", $gaps));
    }

    /**
     * @param  class-string<BackedEnum>  $enum
     * @return list<string>
     */
    private function cases(string $enum): array
    {
        return array_map(fn (BackedEnum $case) => (string) $case->value, $enum::cases());
    }

    /** @return array<mixed> */
    private function labels(string $locale, string $file, string $path): array
    {
        $node = require $this->root("lang/{$locale}/{$file}");
        foreach (explode('.', $path) as $segment) {
            $node = is_array($node) ? ($node[$segment] ?? []) : [];
        }

        return is_array($node) ? $node : [];
    }

    /**
     * Les valeurs de la règle `in:a,b` déclarée pour `$field` dans le fichier de requête, lues
     * dans sa source : la règle se lit sans démarrer l'application.
     *
     * @return list<string>
     */
    private function inRule(string $file, string $field): array
    {
        $source = (string) file_get_contents($this->root($file));
        $pattern = "/'".preg_quote($field, '/')."'\\s*=>\\s*\\[[^\\]]*'in:([^']+)'/";
        if (! preg_match($pattern, $source, $match)) {
            return [];
        }

        return explode(',', $match[1]);
    }

    private function root(string $path = ''): string
    {
        return dirname(__DIR__, 3).'/'.$path;
    }
}
