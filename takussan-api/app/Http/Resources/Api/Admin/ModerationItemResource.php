<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use Illuminate\Http\Request;

class ModerationItemResource extends BaseResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'type' => $this->resource['type'],
            'status' => $this->resource['status'],
            'subject_type' => $this->resource['subject_type'],
            'subject_id' => $this->resource['subject_id'],
            'subject' => $this->resource['subject'],
            'reporter' => $this->resource['reporter'],
            'agency' => $this->resource['agency'],
            'reason' => $this->resource['reason'],
            'reported_count' => $this->resource['reported_count'],
            'reported_at' => $this->resource['reported_at'],
            'created_at' => $this->resource['created_at'],
        ];
    }
}
