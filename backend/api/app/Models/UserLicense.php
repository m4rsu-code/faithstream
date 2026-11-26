<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserLicense extends Model
{
    protected $fillable = [
        'user_id',
        'payment_request_id',
        'status',
        'source',
        'activated_at',
        'activated_by',
        'activation_note',
        'revoked_at',
        'revoked_by',
        'revocation_note',
    ];

    protected function casts(): array
    {
        return ['activated_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function paymentRequest(): BelongsTo
    {
        return $this->belongsTo(LicensePaymentRequest::class, 'payment_request_id');
    }

    public function activator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'activated_by');
    }

    public function revoker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}
