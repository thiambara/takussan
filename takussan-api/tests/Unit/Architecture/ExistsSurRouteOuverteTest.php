<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-1027 (P62.08) — une règle `exists:` sur une table d'agence, dans un FormRequest dont
 * l'`authorize()` ne juge rien, rend 422 pour un identifiant absent et laisse passer celui d'une
 * autre agence : la route dit à tout compte connecté ce qui existe (TCK-599, TCK-732, TCK-817 l'ont
 * corrigé route par route, sans rien qui empêche la forme de revenir).
 *
 * Cette garde FIGE les FormRequests qui la portent encore, chacun avec la Réf qui le traite : aucun
 * nouveau ne s'y ajoute, et une exception qui n'a plus la forme fait rougir, pour qu'on la retire.
 *
 * « Ne juge rien » : `return true;`, ou un test de la seule présence d'un compte, ou aucun
 * `authorize()` sur une classe qui étend `FormRequest` (Laravel autorise alors). Hors champ, comme
 * `FormRequestEtendBaseFormRequestTest` : `Auth/` (appelé sans compte) et `Admin/` (console).
 */
class ExistsSurRouteOuverteTest extends TestCase
{
    /** Relatifs à `app/Http/Requests/`. La Réf est celle de l'entrée du fichier de pistes qui la corrige. */
    private const EXCEPTIONS = [
        'Api/StoreLeaseRequest.php' => 'P62.01',
        'Api/StoreBookingRequest.php' => 'P62.02',
        'Api/StoreTaskRequest.php' => 'P62.03',
        'InventoryStoreRequest.php' => 'P62.04',
        'Api/StoreMaintenanceRequestRequest.php' => 'P62.04, P62.06',
        'Api/StoreConversationRequest.php' => 'P62.04, P62.06',
        'Conversation/CreateGroupConversationRequest.php' => 'P62.04',
        'Search/SearchQueryRequest.php' => 'P62.05',
        'Api/StorePropertyVisitRequest.php' => 'P62.06',
        'Api/IndexCalendarRequest.php' => 'P62.06, P62.07',
        'Api/StoreIntegrationRequest.php' => 'P62.07',
        'Invitation/CreateInvitationRequest.php' => 'P62.07',
        'Agency/AssignAgencyRoleRequest.php' => 'P62.07',
    ];

    /** Les tables dont une ligne appartient à une agence (ou en est une). */
    private const TABLES_D_AGENCE = [
        'agencies', 'agency_roles', 'bookings', 'conversations', 'customers', 'guarantors', 'leases',
        'maintenance_requests', 'properties', 'users',
    ];

    private const HORS_CHAMP = ['Auth/', 'Api/Admin/', 'Admin/'];

    public function test_aucune_regle_exists_neuve_sur_une_route_ouverte(): void
    {
        $nouveaux = array_diff_key($this->balayer(), self::EXCEPTIONS);

        $this->assertSame([], $nouveaux, "Ces FormRequests laissent passer tout compte et portent une règle d'existence sur une table d'agence :\n"
            .implode("\n", array_map(fn ($f, $t) => "  - {$f} : ".implode(', ', $t), array_keys($nouveaux), $nouveaux))
            ."\nJuger dans `authorize()` (policy) ou résoudre l'identifiant dans le périmètre de l'appelant, avec la même réponse pour l'absent et l'invisible (TCK-599).");
    }

    public function test_une_exception_qui_n_a_plus_la_forme_se_retire(): void
    {
        $perimees = array_diff_key(self::EXCEPTIONS, $this->balayer());

        $this->assertSame([], $perimees, "Ces exceptions n'ont plus la forme (corrigées ou disparues) : les retirer de EXCEPTIONS.\n"
            .implode("\n", array_map(fn ($f, $r) => "  - {$f} ({$r})", array_keys($perimees), $perimees)));
    }

    public function test_la_detection_ignore_les_commentaires_et_lit_rule_exists(): void
    {
        $ouvert = "    public function authorize(): bool\n    {\n        return \$this->user() !== null;\n    }\n";
        $source = static fn (string $authorize, string $regles) => "<?php\nclass X extends BaseFormRequest\n{\n{$authorize}\n    public function rules(): array\n    {\n        return [{$regles}];\n    }\n}\n";

        $this->assertSame([], $this->analyser($source($ouvert, "\n            // plus de `exists:properties,id` ici (TCK-599)\n            'property_id' => ['integer'],")));
        $this->assertSame(['properties'], $this->analyser($source($ouvert, "'property_id' => ['exists:properties,id'],")));
        $this->assertSame(['customers'], $this->analyser($source($ouvert, "'c' => [Rule::exists('customers', 'id')],")));
        $this->assertSame([], $this->analyser($source($ouvert, "'s' => ['exists:agency_specialties,id'],")), 'table hors agence');

        $juge = "    public function authorize(): bool\n    {\n        return \$this->user()?->can('create', Lease::class) === true;\n    }\n";
        $this->assertSame([], $this->analyser($source($juge, "'property_id' => ['exists:properties,id'],")), 'un authorize() qui délègue juge');
        $this->assertSame([], $this->analyser($source('', "'property_id' => ['exists:properties,id'],")), 'sans authorize(), BaseFormRequest refuse');
    }

    /** @return array<string, list<string>> fichier relatif → tables visées */
    private function balayer(): array
    {
        $racine = dirname(__DIR__, 3).'/app/Http/Requests';
        $trouves = [];
        $lus = 0;
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = str_replace('\\', '/', substr($fichier->getPathname(), strlen($racine) + 1));
            foreach (self::HORS_CHAMP as $prefixe) {
                if (str_starts_with($relatif, $prefixe)) {
                    continue 2;
                }
            }
            $lus++;
            $tables = $this->analyser((string) file_get_contents($fichier->getPathname()));
            if ($tables !== []) {
                $trouves[$relatif] = $tables;
            }
        }
        // Une garde qui ne lit rien est verte : elle doit avoir lu le dossier.
        $this->assertGreaterThan(100, $lus, 'le balayage de app/Http/Requests n\'a presque rien lu');
        ksort($trouves);

        return $trouves;
    }

    /** @return list<string> les tables d'agence visées par une règle d'existence, si l'`authorize()` ne juge rien */
    private function analyser(string $php): array
    {
        $code = '';
        foreach (token_get_all($php) as $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($jeton) ? $jeton[1] : $jeton;
        }

        if (! $this->authorizeOuvert($code)) {
            return [];
        }

        preg_match_all("/['\"]exists:([a-z_]+)|Rule::exists\\(\\s*['\"]([a-z_]+)['\"]/", $code, $m);
        $tables = array_values(array_unique(array_filter(array_merge($m[1], $m[2]))));
        $tables = array_values(array_intersect($tables, self::TABLES_D_AGENCE));
        sort($tables);

        return $tables;
    }

    private function authorizeOuvert(string $code): bool
    {
        if (preg_match('/function\s+authorize\s*\(\s*\)\s*(?::\s*bool\s*)?\{(.*?)\n    \}/s', $code, $m) !== 1) {
            // Sans authorize() : BaseFormRequest refuse, FormRequest autorise.
            return preg_match('/\bextends\s+(\\\\?Illuminate\\\\Foundation\\\\Http\\\\)?FormRequest\b/', $code) === 1;
        }
        $corps = preg_replace('/\s+/', ' ', trim($m[1]));

        return preg_match('/^return (true|\$this->user\(\) !==? null|\$this->user\(\) != null|\$this->user\(\) instanceof \\\\?[\w\\\\]*User|auth\(\)->check\(\));$/', (string) $corps) === 1
            && ! str_contains((string) $corps, '->can(');
    }
}
