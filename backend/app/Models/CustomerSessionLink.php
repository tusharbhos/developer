<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerSessionLink extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'customer_id',
        'project_name',
        'presentation_id',
        'presentation_title',
        'presenter_name',
        'presenter_email',
        'presenter_platform_id',
        'viewer_name',
        'viewer_email',
        'viewer_phone',
        'viewer_platform_id',
        'session_token',
        'session_code',
        'join_code',
        'presenter_link',
        'viewer_link',
        'expires_at',
        'raw_response',
    ];

    protected $casts = [
        'raw_response' => 'array',
        'expires_at' => 'datetime',
    ];

    protected $appends = [
        'self_view_url',
        'self_view_expires_at',
    ];

    public function getSelfViewUrlAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'self_view_url');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getSelfViewExpiresAtAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'self_view_expires_at');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
