<?php
// app/Models/ActivationRequest.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ActivationRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        // Step 1
        'project_name',
        'city',
        'google_location',
        'units_left_label',
        'units_left',
        'possession_date',
        // Step 2
        'price_range',
        'location_type',
        'unit_structure',
        // Step 3
        'buyer_type',
        'sales_velocity',
        'target_timeline',
        'developer_positioning',
        // Step 7
        'contact_name',
        'designation',
        'phone',
        'email',
        'developer_name',
        // Assessment
        'assessment',
        // Admin
        'status',
        'admin_notes',
        'contacted_at',
        'activated_at',
        'submitted_at',
    ];

    protected $casts = [
        'assessment'     => 'array',
        'possession_date' => 'date:Y-m-d',
        'contacted_at'   => 'datetime',
        'activated_at'   => 'datetime',
        'submitted_at'   => 'datetime',
        'units_left'     => 'integer',
    ];

    // ── Relationships ─────────────────────────────────────

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(ActivationRequestApproval::class);
    }

    // ── Scopes ────────────────────────────────────────────

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeForCity($query, string $city)
    {
        return $query->where('city', $city);
    }

    // ── Helpers ───────────────────────────────────────────

    public function markContacted(): void
    {
        $this->update([
            'status'       => 'contacted',
            'contacted_at' => now(),
        ]);
    }

    public function markActivated(): void
    {
        $this->update([
            'status'       => 'activated',
            'activated_at' => now(),
        ]);
    }

    public function markRejected(string $reason = null): void
    {
        $this->update([
            'status'      => 'rejected',
            'admin_notes' => $reason,
        ]);
    }
}
