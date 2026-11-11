<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserLicense extends Model
{
    protected $fillable = ['user_id', 'payment_request_id', 'status', 'activated_at'];

    protected function casts(): array
    {
        return ['activated_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function paymentRequest(): BelongsTo
    {
        return $this->belongsTo(LicensePaymentRequest::class, 'payment_request_id');
    }
}
