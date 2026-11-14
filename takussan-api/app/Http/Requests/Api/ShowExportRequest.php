<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Rules\JourIso;
use App\Services\Export\ExportDataService;
use Illuminate\Validation\Rule;

/**
 * TCK-305 — extrait de ExportController::show(), où les règles étaient écrites en ligne.
 *
 * Deux conventions coexistaient pour le même geste : 120 `$request->validate()` inline contre
 * 65 FormRequest. Une contrainte métier ne pouvait pas être revue sans d'abord chercher laquelle
 * des deux l'endpoint avait retenue. `scripts/check-inline-validation.mjs` (Repo CI) casse
 * désormais sur tout `validate()` rouvert dans un contrôleur.
 */
class ShowExportRequest extends BaseFormRequest
{
    /**
     * TCK-587 (ADR-0031 §2) — capacité exigée du PERSONNEL, par entité. Le bailleur (non personnel)
     * garde l'export de ses biens et baux, borné par `ExportDataService::scopeToActor()`.
     */
    public const CAPABILITY = [
        'customers' => Capability::CrmExport,
        'payments' => Capability::PaymentsExport,
        'leases' => Capability::ReportsExport,
        'properties' => Capability::ReportsExport,
        // TCK-595 (§7) — les exports financiers de l'agence : `reports.export`, et au PERSONNEL seul.
        'payouts' => Capability::ReportsExport,
        'invoices' => Capability::ReportsExport,
        'commissions' => Capability::ReportsExport,
        'aging' => Capability::ReportsExport,
        'deposits' => Capability::ReportsExport,
        // TCK-2721 — le registre des encaissements d'« Argent », avec ses filtres : la capacité de
        // l'entité `payments`.
        'payment_history' => Capability::PaymentsExport,
    ];

    /**
     * TCK-595 — ni le bailleur ni le locataire n'exportent les finances d'une agence. TCK-2721 — le
     * registre des encaissements non plus : c'est un écran du personnel (`/app/agency/finances`).
     */
    public const STAFF_ONLY = ['payouts', 'invoices', 'commissions', 'aging', 'deposits', 'payment_history'];

    /** TCK-2661 — le bénéficiaire sans `reports.export` n'exporte que SES commissions. */
    private bool $ownLinesOnly = false;

    /**
     * L'entité inconnue (404), puis le droit d'exporter (403), AVANT les règles (422) : un appelant
     * sans droit ne lit ni les formats acceptés ni le plafond de `limit` (suivi de vérification de
     * TCK-2720/2721, re-mesuré le 2026-11-12 — `authorize()` rendait `true` et la validation passait
     * la première). La règle n'est dans aucune policy : elle est REPRISE ici, telle que
     * `ExportController::show()` l'écrivait (CLAUDE.md de l'API, § Validation, piège 2).
     *
     * TCK-587 — le contrôle se fait EN TÊTE, avant toute requête. Il ouvrait l'export à tout membre
     * (agent comme admin) sans lire `crm.export`, `payments.export` ni `reports.export`, et le
     * prédicat d'agence (`isAgentAt` sur `$user->agency_id`) ne distinguait pas le personnel du
     * bailleur.
     */
    public function authorize(): bool
    {
        $user = $this->user();
        abort_unless($user, 401);

        $entity = (string) $this->route('entity');
        abort_code_unless(isset(self::CAPABILITY[$entity]), 404, 'export.entity_unknown', ['entity' => $entity]);

        if ($user->isSuperAdmin()) {
            return true;
        }

        $staffAgencyId = $user->staffAgencyId();
        if ($staffAgencyId !== null) {
            $allowed = $user->canActAt(self::CAPABILITY[$entity], Agency::query()->find($staffAgencyId));
            // TCK-2661 — sans `reports.export`, le bénéficiaire exporte encore SES commissions, et
            // elles seules (même s'il lit celles de l'agence au relevé).
            $this->ownLinesOnly = ! $allowed && $entity === 'commissions';
            abort_code_unless($allowed || $this->ownLinesOnly, 403, 'export.forbidden');
        } elseif ($entity === 'customers' || in_array($entity, self::STAFF_ONLY, true)) {
            abort_code(403, 'export.forbidden');
        } elseif ($entity === 'properties'
            && ! ($user->agency_id !== null && $user->isOwnerAt((int) $user->agency_id))) {
            abort_code(403, 'export.forbidden');
        }

        return true;
    }

    /** TCK-2661 — vrai quand l'appelant n'exporte que ses propres lignes de commission. */
    public function ownLinesOnly(): bool
    {
        return $this->ownLinesOnly;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'format' => ['sometimes', Rule::in(['csv', 'xlsx', 'excel', 'pdf'])],
            'from' => ['sometimes', 'date', new JourIso],
            'to' => ['sometimes', 'date', new JourIso],
            // TCK-713 — le plafond dépend du format : 200 lignes en PDF (TCK-1306), 5 000 en XLSX
            // (TCK-1746), 10 000 en CSV.
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.ExportDataService::maxRows($this->input('format'))],
        ];
    }
}
