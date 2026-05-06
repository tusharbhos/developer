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
        'viewer_link_with_phone',
        'self_view_url',
        'self_view_url_with_phone',
        'self_view_expires_at',
        'meeting_date',
        'meeting_time',
        'status',
        'started_at',
        'ended_at',
        'joinees',
        'event_count',
    ];

    public function getViewerLinkWithPhoneAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'viewer_link_with_phone');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getSelfViewUrlAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'self_view_url');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getSelfViewUrlWithPhoneAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'self_view_url_with_phone');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getSelfViewExpiresAtAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'self_view_expires_at')
            ?: data_get($this->raw_response, 'expires_at');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getMeetingDateAttribute(): ?string
    {
        $scheduledFor = trim((string) data_get($this->raw_response, 'self_view_scheduled_for', ''));
        if (preg_match('/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/', $scheduledFor, $matches)) {
            return $matches[1];
        }

        return null;
    }

    public function getMeetingTimeAttribute(): ?string
    {
        $scheduledFor = trim((string) data_get($this->raw_response, 'self_view_scheduled_for', ''));
        if (preg_match('/^\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/', $scheduledFor, $matches)) {
            return $matches[1];
        }

        return null;
    }

    public function getStatusAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'status');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getStartedAtAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'started_at');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getEndedAtAttribute(): ?string
    {
        $value = data_get($this->raw_response, 'ended_at');

        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    public function getJoineesAttribute(): int
    {
        return (int) data_get($this->raw_response, 'joinees', 0);
    }

    public function getEventCountAttribute(): int
    {
        return (int) data_get($this->raw_response, 'event_count', 0);
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
