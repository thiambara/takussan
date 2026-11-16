<?php

namespace Tests\Unit\Architecture;

use App\Http\Requests\Accounting\MatchBankStatementLineRequest;
use App\Http\Requests\Accounting\StoreBankStatementRequest;
use App\Http\Requests\Accounting\UpdateBankCsvMappingRequest;
use App\Http\Requests\Agency\StoreAgentAbsenceRequest;
use App\Http\Requests\Agency\StoreAgentHandoverRequest;
use App\Http\Requests\Api\Admin\AssignAgencySubscriptionRequest;
use App\Http\Requests\Api\Admin\CancelPlatformPayoutRequest;
use App\Http\Requests\Api\Admin\ClosePlatformPayoutPeriodRequest;
use App\Http\Requests\Api\Admin\MarkPlatformPayoutPaidRequest;
use App\Http\Requests\Api\Admin\ReportExportRequest;
use App\Http\Requests\Api\Admin\StorePlanRequest;
use App\Http\Requests\Api\Admin\UpdatePlanRequest;
use App\Http\Requests\Api\Me\UpdateMeRequest;
use App\Http\Requests\AttachCustomerTagsRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\RequestPhoneLoginCodeRequest;
use App\Http\Requests\Auth\UpdateProfileRequest;
use App\Http\Requests\InitiatePaymentRequest;
use App\Http\Requests\InventorySignRequest;
use App\Http\Requests\InventoryStoreRequest;
use App\Http\Requests\InventoryUpdateRequest;
use App\Http\Requests\Kyc\RejectKycDossierRequest;
use App\Http\Requests\Kyc\UploadKycDocumentRequest;
use App\Http\Requests\Maintenance\RejectQuoteRequest;
use App\Http\Requests\Maintenance\SubmitQuoteRequest;
use App\Http\Requests\MediaUploadRequest;
use App\Http\Requests\Onboarding\HostIndividualOnboardRequest;
use App\Http\Requests\Permissions\StoreRoleDelegationRequest;
use App\Http\Requests\PropertyBulkArchiveRequest;
use App\Http\Requests\PropertyBulkAssignRequest;
use App\Http\Requests\PropertyBulkVisibilityRequest;
use App\Http\Requests\PropertyDuplicateRequest;
use App\Http\Requests\RejectPropertyRequest;
use App\Http\Requests\Search\SearchQueryRequest;
use App\Http\Requests\UploadDocumentVersionRequest;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionMethod;

/**
 * TCK-730 (P03.05) — un FormRequest de l'API étend `BaseFormRequest`, dont `authorize()` refuse
 * par défaut. Celui qui étend `FormRequest` directement hérite d'un `authorize()` qu'il écrit
 * lui-même, et l'usage a été de rendre `true` ou `user() !== null` : la validation passe alors
 * avant l'autorisation, et un appelant sans droit reçoit 422 et les noms des champs au lieu de 403
 * (voir `AuthorizationPrecedesValidationTest`).
 *
 * TCK-612 — et `BaseFormRequest` porte aussi la règle « une écriture se valide sur le corps seul »
 * (`validationData()`) : une classe qui étend `FormRequest` validait un champ venu de l'URL. La
 * garde couvre donc TOUT `app/Http/Requests`, `Auth/` et `Admin/` compris (ils en étaient hors
 * champ sous TCK-730), et ne connaît plus de liste figée : seulement des EXEMPTIONS motivées.
 * Elle est expirante : une exemption qui n'étend plus `FormRequest` la fait rougir.
 */
class FormRequestEtendBaseFormRequestTest extends TestCase
{
    /**
     * Les FormRequests qui étendent encore `FormRequest`, relatifs à `app/Http/Requests/`, chacun
     * avec son motif. `QueryNeverFeedsAWriteTest` lit cette liste : une écriture qui type-hint une
     * de ces classes y est déclarée non couverte, toute autre y fait rougir le parcours.
     *
     * @var array<string, string>
     */
    public const EXEMPTIONS = [
    ];

    /**
     * TCK-612 — les 35 classes passées de `FormRequest` à `BaseFormRequest` le 2026-11-16. Chacune
     * déclarait son propre `authorize()` : elle doit le garder, sans quoi elle hériterait du refus
     * par défaut de la base (fail-closed), ou d'une autorisation qui n'est plus la sienne.
     *
     * @var list<class-string>
     */
    private const CONVERTIES_TCK_612 = [
        RegisterRequest::class,
        MatchBankStatementLineRequest::class,
        StoreBankStatementRequest::class,
        UpdateBankCsvMappingRequest::class,
        StoreAgentAbsenceRequest::class,
        StoreAgentHandoverRequest::class,
        AssignAgencySubscriptionRequest::class,
        CancelPlatformPayoutRequest::class,
        ClosePlatformPayoutPeriodRequest::class,
        MarkPlatformPayoutPaidRequest::class,
        ReportExportRequest::class,
        StorePlanRequest::class,
        UpdatePlanRequest::class,
        UpdateMeRequest::class,
        AttachCustomerTagsRequest::class,
        LoginRequest::class,
        RequestPhoneLoginCodeRequest::class,
        UpdateProfileRequest::class,
        InitiatePaymentRequest::class,
        InventorySignRequest::class,
        InventoryStoreRequest::class,
        InventoryUpdateRequest::class,
        RejectKycDossierRequest::class,
        UploadKycDocumentRequest::class,
        RejectQuoteRequest::class,
        SubmitQuoteRequest::class,
        MediaUploadRequest::class,
        HostIndividualOnboardRequest::class,
        StoreRoleDelegationRequest::class,
        PropertyBulkArchiveRequest::class,
        PropertyBulkAssignRequest::class,
        PropertyBulkVisibilityRequest::class,
        PropertyDuplicateRequest::class,
        RejectPropertyRequest::class,
        SearchQueryRequest::class,
        UploadDocumentVersionRequest::class,
    ];

    public function test_chaque_classe_convertie_garde_son_propre_authorize(): void
    {
        $heritees = array_values(array_filter(
            self::CONVERTIES_TCK_612,
            fn (string $classe) => (new ReflectionMethod($classe, 'authorize'))->getDeclaringClass()->getName() !== $classe,
        ));

        $this->assertSame([], $heritees, "Ces FormRequests n'écrivent plus leur authorize() : elles héritent de celui de BaseFormRequest (TCK-612) :\n- ".implode("\n- ", $heritees));
    }

    private function racine(): string
    {
        return dirname(__DIR__, 3).'/app/Http/Requests';
    }

    /**
     * @return array{lus: int, directs: list<string>}
     */
    private function balayer(): array
    {
        $racine = $this->racine();
        $lus = 0;
        $directs = [];

        $fichiers = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($fichiers as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = str_replace('\\', '/', substr($fichier->getPathname(), strlen($racine) + 1));
            if ($relatif === 'BaseFormRequest.php') {
                continue;
            }

            $lus++;
            if ($this->etendFormRequest((string) file_get_contents($fichier->getPathname()))) {
                $directs[] = $relatif;
            }
        }
        sort($directs);

        return ['lus' => $lus, 'directs' => $directs];
    }

    /** `extends FormRequest`, ou son nom complet ; jamais `extends BaseFormRequest`. */
    private function etendFormRequest(string $source): bool
    {
        return preg_match('/\bextends\s+\\\\?(?:Illuminate\\\\Foundation\\\\Http\\\\)?FormRequest\b/', $source) === 1;
    }

    public function test_aucun_form_request_neuf_n_echappe_au_refus_par_defaut(): void
    {
        ['lus' => $lus, 'directs' => $directs] = $this->balayer();

        $this->assertGreaterThan(100, $lus, "balayage vide : {$lus} fichier(s) lu(s) sous app/Http/Requests");

        $neufs = array_values(array_diff($directs, array_keys(self::EXEMPTIONS)));
        $this->assertSame([], $neufs, "Ces FormRequests étendent FormRequest au lieu de BaseFormRequest (TCK-730, TCK-612) :\n- ".implode("\n- ", $neufs));
    }

    public function test_les_exemptions_ne_gardent_que_des_fichiers_qui_etendent_encore_form_request(): void
    {
        ['directs' => $directs] = $this->balayer();

        $perimes = array_values(array_diff(array_keys(self::EXEMPTIONS), $directs));
        $this->assertSame([], $perimes, "Ces fichiers n'étendent plus FormRequest : retirez-les d'EXEMPTIONS (TCK-612) :\n- ".implode("\n- ", $perimes));
    }

    public function test_le_motif_reconnait_les_deux_formes_et_pas_base_form_request(): void
    {
        $this->assertTrue($this->etendFormRequest('class A extends FormRequest {}'));
        $this->assertTrue($this->etendFormRequest('class A extends \Illuminate\Foundation\Http\FormRequest {}'));
        $this->assertFalse($this->etendFormRequest('class A extends BaseFormRequest {}'));
        $this->assertFalse($this->etendFormRequest('abstract class BaseFormRequest extends FormRequestBase {}'));
    }
}
