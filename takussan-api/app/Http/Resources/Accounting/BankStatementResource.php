<?php

namespace App\Http\Resources\Accounting;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BankStatementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'agency_id' => $this->agency_id,
            'source_format' => $this->source_format?->value,
            'source_format_label' => $this->source_format ? strtoupper($this->source_format->value) : null,
            'file_hash' => $this->file_hash,
            'bank_name' => $this->bank_name,
            'account_iban_masked' => $this->account_iban_masked,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'lines_count' => $this->lines_count,
            'status' => $this->status?->value,
            'status_label' => $this->status ? __("reconciliation.status.{$this->status->value}") : null,
            'finalized_at' => $this->finalized_at?->toIso8601String(),
            'reconciled_ratio' => $this->reconciled_ratio,
            'uploaded_by' => $this->whenLoaded('uploadedBy', fn () => [
                'id' => $this->uploadedBy->id,
                'first_name' => $this->uploadedBy->first_name,
                'last_name' => $this->uploadedBy->last_name,
            ]),
            'finalized_by' => $this->whenLoaded('finalizedBy', fn () => [
                'id' => $this->finalizedBy->id,
                'first_name' => $this->finalizedBy->first_name,
                'last_name' => $this->finalizedBy->last_name,
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
