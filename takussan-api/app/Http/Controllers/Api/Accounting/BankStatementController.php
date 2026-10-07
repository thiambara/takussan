<?php

namespace App\Http\Controllers\Api\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Accounting\StoreBankStatementRequest;
use App\Http\Resources\Accounting\BankStatementResource;
use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementStatus;
use App\Services\Accounting\StatementParser\CsvDriver;
use Illuminate\Http\Request;

class BankStatementController extends Controller
{
    public function index(Agency $agency, Request $request)
    {
        $this->authorize('viewAny', [BankStatement::class, $agency]);

        $query = BankStatement::query()->where('agency_id', $agency->id);

        return BankStatementResource::collection(
            BankStatement::buildQuery($query, $request)->paginate()
        );
    }

    public function store(Agency $agency, StoreBankStatementRequest $request)
    {
        $this->authorize('create', [BankStatement::class, $agency]);

        $hash = $request->input('file_hash') ?? hash_file('sha256', $request->file('file')->getRealPath());

        // Double-check for duplicate (also validated in form request)
        $previous = BankStatement::where('agency_id', $agency->id)->where('file_hash', $hash)->get();
        if ($previous->contains(fn (BankStatement $s) => $s->status !== BankStatementStatus::Failed)) {
            abort_code(422, 'reconciliation.duplicate_file');
        }

        // TCK-593 — un relevé `failed` n'a aucune ligne (l'insertion est transactionnelle) : le
        // ré-import du même fichier le remplace, sinon l'index unique `(agency_id, file_hash)`
        // ferait d'un mapping erroné une impasse.
        $previous->each->delete();

        // Mask IBAN if provided
        $iban = $request->input('account_iban');
        $maskedIban = $iban ? $this->maskIban($iban) : null;

        $statement = BankStatement::create([
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
            explode(',', $request->query('include', '')),
            ['uploadedBy', 'finalizedBy', 'agency'],
        ));

        return BankStatementResource::make($statement);
    }

    private function maskIban(string $iban): string
    {
        $clean = str_replace(' ', '', strtoupper($iban));
        $prefix = substr($clean, 0, 4);
        $suffix = substr($clean, -2);

        return $prefix.' '.str_repeat('**** ', max(0, (int) ((strlen($clean) - 6) / 4))).'**'.$suffix;
    }
}
