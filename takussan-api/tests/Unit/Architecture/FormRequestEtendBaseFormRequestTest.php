<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

/**
 * TCK-730 (P03.05) — un FormRequest de l'API étend `BaseFormRequest`, dont `authorize()` refuse
 * par défaut. Celui qui étend `FormRequest` directement hérite d'un `authorize()` qu'il écrit
 * lui-même, et l'usage a été de rendre `true` ou `user() !== null` : la validation passe alors
 * avant l'autorisation, et un appelant sans droit reçoit 422 et les noms des champs au lieu de 403
 * (voir `AuthorizationPrecedesValidationTest`).
 *
 * Cette garde FIGE les fichiers qui le font encore : aucun nouveau ne s'y ajoute, et la liste ne
 * fait que décroître. Elle est expirante : un fichier de la liste qui n'étend plus `FormRequest`
 * (ou qui n'existe plus) la fait rougir, pour qu'on l'en retire.
 *
 * Hors de son champ, comme dans la mesure de P03.05 : `Auth/` (connexion et inscription, appelées
 * sans compte) et `Admin/` (derrière le middleware de la console).
 */
class FormRequestEtendBaseFormRequestTest extends TestCase
{
    /**
     * Les FormRequests qui étendent encore `FormRequest`, relatifs à `app/Http/Requests/`. Chacun
     * se reprend un à un (P03.05, « reste ») : déléguer son `authorize()` à la policy que le
     * contrôleur appelle, passer à `BaseFormRequest`, et le retirer d'ici.
     */
    private const FIGES = [
        'Accounting/MatchBankStatementLineRequest.php',
        'Accounting/StoreBankStatementRequest.php',
        'Accounting/UpdateBankCsvMappingRequest.php',
        'Agency/StoreAgentAbsenceRequest.php',
        'Agency/StoreAgentHandoverRequest.php',
        'Api/Me/UpdateMeRequest.php',
        'AttachCustomerTagsRequest.php',
        'InitiatePaymentRequest.php',
        'InventorySignRequest.php',
        'InventoryStoreRequest.php',
        'InventoryUpdateRequest.php',
        'Kyc/RejectKycDossierRequest.php',
        'Kyc/UploadKycDocumentRequest.php',
        'Maintenance/RejectQuoteRequest.php',
        'Maintenance/SubmitQuoteRequest.php',
        'MediaUploadRequest.php',
        'Onboarding/HostIndividualOnboardRequest.php',
        'Permissions/StoreRoleDelegationRequest.php',
        'PropertyBulkArchiveRequest.php',
        'PropertyBulkAssignRequest.php',
        'PropertyBulkVisibilityRequest.php',
        'PropertyDuplicateRequest.php',
        'RejectPropertyRequest.php',
        'Search/SearchQueryRequest.php',
        'Search/SuggestRequest.php',
        'UploadDocumentVersionRequest.php',
    ];

    private const HORS_CHAMP = ['Auth/', 'Api/Admin/', 'Admin/'];

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
            if ($relatif === 'BaseFormRequest.php' || $this->horsChamp($relatif)) {
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

    private function horsChamp(string $relatif): bool
    {
        foreach (self::HORS_CHAMP as $prefixe) {
            if (str_starts_with($relatif, $prefixe)) {
                return true;
            }
        }

        return false;
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

        $neufs = array_values(array_diff($directs, self::FIGES));
        $this->assertSame([], $neufs, "Ces FormRequests étendent FormRequest au lieu de BaseFormRequest (TCK-730) :\n- ".implode("\n- ", $neufs));
    }

    public function test_la_liste_figee_ne_garde_que_des_fichiers_qui_etendent_encore_form_request(): void
    {
        ['directs' => $directs] = $this->balayer();

        $perimes = array_values(array_diff(self::FIGES, $directs));
        $this->assertSame([], $perimes, "Ces fichiers n'étendent plus FormRequest : retirez-les de FIGES (TCK-730) :\n- ".implode("\n- ", $perimes));
    }

    public function test_le_motif_reconnait_les_deux_formes_et_pas_base_form_request(): void
    {
        $this->assertTrue($this->etendFormRequest('class A extends FormRequest {}'));
        $this->assertTrue($this->etendFormRequest('class A extends \Illuminate\Foundation\Http\FormRequest {}'));
        $this->assertFalse($this->etendFormRequest('class A extends BaseFormRequest {}'));
        $this->assertFalse($this->etendFormRequest('abstract class BaseFormRequest extends FormRequestBase {}'));
    }
}
