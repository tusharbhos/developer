<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ConectrWebhookEvent extends Model
{
    protected $fillable = [
        'customer_session_link_id',
        'event',
        'session_token',
        'viewer_id',
        'delivery_hash',
        'payload',
        'received_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'received_at' => 'datetime',
    ];

    public function sessionLink(): BelongsTo
    {
        return $this->belongsTo(CustomerSessionLink::class, 'customer_session_link_id');
    }
}
