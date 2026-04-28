<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivationRequestApproval extends Model
{
    use HasFactory;

    protected $fillable = [
        'activation_request_id',
        'user_id',
    ];

    public function activationRequest(): BelongsTo
    {
        return $this->belongsTo(ActivationRequest::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
