<?php

namespace App\Http\Resources;

use App\Http\Resources\Bases\BaseResource;
use App\Models\PrivacyRequest;
use Illuminate\Http\Request;

/** TCK-601 (G) — une ligne du registre des demandes de droits, telle que la console la lit. */
class PrivacyRequestResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        /** @var PrivacyRequest $entry */
        $entry = $this->resource;
        $proof = $entry->getFirstMedia('proof');

        return [
            'id' => $entry->id,
            'user_id' => $entry->user_id,
            'requester_name' => $entry->requester_name,
            'requester_contact' => $entry->requester_contact,
            'type' => $this->enumValue($entry->type),
            'channel' => $this->enumValue($entry->channel),
            'status' => $this->enumValue($entry->status),
            'received_at' => $this->iso($entry->received_at),
            'due_at' => $this->iso($entry->due_at),
            'answered_at' => $this->iso($entry->answered_at),
            'response_summary' => $entry->response_summary,
            'handled_by' => $entry->handler !== null ? ['id' => $entry->handler->id, 'name' => $entry->handler->full_name] : null,
            'data_export_id' => $entry->data_export_id,
            'account_deletion_request_id' => $entry->account_deletion_request_id,
            'is_overdue' => $entry->isOverdue(),
            'proof' => $proof !== null ? ['file_name' => $proof->file_name, 'size' => (int) $proof->size] : null,
            'created_at' => $this->iso($entry->created_at),
        ];
    }
}
