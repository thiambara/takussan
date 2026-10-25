<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Accounting\StoreBankStatementRequest;
use App\Http\Resources\Accounting\BankStatementResource;
use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Services\Accounting\StatementParser\CsvDriver;
use App\Support\Http\ParametreUnique;
use App\Support\Masking;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BankStatementController extends Controller
{
    public function index(Agency $agency, Request $request)
    {
        $this->authorize('viewAny', [BankStatement::class, $agency]);

        $query = BankStatement::query()->where('agency_id', $agency->id);

        // TCK-988 — les comptes de `reconciled_ratio` après `buildQuery()` : un `fields[]` y pose
        // son `select`, qui écraserait les sous-requêtes de comptage posées avant.
        //
        // TCK-1298 (P118.04) — sans `sort=`, le plus récent d'abord ; `buildQuery()` départage par
        // l'`id` (TCK-1296).
        $paginator = BankStatement::buildQuery($query, $request)
            ->defaultSort('-created_at')
            ->withReconciledCounts()
            ->paginate();

        // TCK-1220 (P108.03) — l'enveloppe canonique `{ data, meta }`, et non celle de Laravel.
        return $this->paginated($paginator, BankStatementResource::collection($paginator)->toArray($request));
    }

    public function store(Agency $agency, StoreBankStatementRequest $request)
    {
        $this->authorize('create', [BankStatement::class, $agency]);

        $hash = $request->input('file_hash') ?? hash_file('sha256', $request->file('file')->getRealPath());

        // Mask IBAN if provided — TCK-601 : le masqueur unique du dépôt (ADR-0044 §1).
        $iban = $request->input('account_iban');
        $maskedIban = $iban ? Masking::iban($iban) : null;

        // TCK-1492 (P92.07) — l'agence verrouillée avant de chercher le même fichier : sans verrou,
        // deux imports simultanés passaient le contrôle, et le second heurtait
        // `bank_statements_agency_hash_unique` en 500 au lieu du 422 `reconciliation.duplicate_file`.
        $statement = DB::transaction(function () use ($agency, $request, $hash, $maskedIban): BankStatement {
            Agency::query()->whereKey($agency->getKey())->lockForUpdate()->firstOrFail();

            // Double-check for duplicate (also validated in form request)
            $previous = BankStatement::where('agency_id', $agency->id)->where('file_hash', $hash)->get();
            if ($previous->contains(fn (BankStatement $s) => $s->status !== BankStatementStatus::Failed)) {
                abort_code(422, 'reconciliation.duplicate_file');
            }

            // TCK-593 — un relevé `failed` n'a aucune ligne (l'insertion est transactionnelle) : le
            // ré-import du même fichier le remplace, sinon l'index unique `(agency_id, file_hash)`
            // ferait d'un mapping erroné une impasse.
            $previous->each->delete();

            return BankStatement::create([
                'agency_id' => $agency->id,
                'uploaded_by' => $request->user()->id,
                'source_format' => $request->input('source_format'),
                'file_hash' => $hash,
                'bank_name' => $request->input('bank_name'),
                'account_iban_masked' => $maskedIban,
                'status' => 'processing',
                // TCK-593 — le mapping est FIGÉ sur le relevé : modifier ensuite celui de l'agence ne
                // ré-interprète aucun relevé passé.
                'csv_mapping' => CsvDriver::effectiveMapping($agency->bank_csv_mapping),
            ]);
        });

        // Attach the file via Spatie MediaLibrary
        $statement->addMedia($request->file('file'))
            ->toMediaCollection('statement');

        ParseBankStatementJob::dispatch($statement->id);

        return BankStatementResource::make($statement)
            ->response()
            ->setStatusCode(202);
    }

    public function show(BankStatement $statement, Request $request)
    {
        $this->authorize('view', $statement);

        $statement->load(array_intersect(
            // P216.05 (TCK-2244, ADR-0075) — `include[]=…` vaut un `include` absent.
            explode(',', ParametreUnique::chaine($request, 'include') ?? ''),
            ['uploadedBy', 'finalizedBy'],
        ));

        return BankStatementResource::make($statement);
    }
}
