<?php

namespace App\Models\Concerns;

use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Builder;

trait HasPaymentAttributes
{
    public function initializeHasPaymentAttributes(): void
    {
        $this->mergeCasts([
            'amount' => 'decimal:2',
            'currency' => Currency::class,
            'payment_method' => PaymentMethod::class,
            'status' => PaymentStatus::class,
            'paid_at' => 'datetime',
        ]);
    }

    public function scopePaid(Builder $query): Builder
    {
        return $query->where('status', PaymentStatus::Paid);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', PaymentStatus::Pending);
    }
}
