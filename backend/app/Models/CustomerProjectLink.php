<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerProjectLink extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'customer_id',
        'public_token',
        'selected_projects',
        'liked_projects',
        'mask_identity',
        'card_attempts',
        'locked_project_keys',
        'expires_at',
        'is_disabled',
        'disabled_at',
        'status',
        'sent_at',
        'opened_at',
        'last_interaction_at',
    ];

    protected $casts = [
        'selected_projects' => 'array',
        'liked_projects' => 'array',
        'mask_identity' => 'boolean',
        'card_attempts' => 'array',
        'locked_project_keys' => 'array',
        'expires_at' => 'datetime',
        'is_disabled' => 'boolean',
        'disabled_at' => 'datetime',
        'sent_at' => 'datetime',
        'opened_at' => 'datetime',
        'last_interaction_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
