<?php
// app/Models/ProjectRequest.php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'developer_name',
        'manager_name',
        'manager_phone',
        'manager_email',
        'status',
        'notes',
        'contacted_at',
        'activated_at',
    ];

    protected $casts = [
        'contacted_at' => 'datetime',
        'activated_at' => 'datetime',
    ];

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    // Helpers
    public function markContacted(): void
    {
        $this->update([
            'status' => 'contacted',
            'contacted_at' => now(),
        ]);
    }

    public function markActivated(): void
    {
        $this->update([
            'status' => 'activated',
            'activated_at' => now(),
        ]);
    }
}
