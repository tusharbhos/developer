<?php
// database/migrations/2026_04_01_000001_create_activation_requests_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activation_requests', function (Blueprint $table) {
            $table->id();

            // Submitter (nullable — can be submitted without login)
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // Step 1 — Basic Info
            $table->string('project_name');
            $table->string('city');
            $table->string('google_location')->nullable();
            $table->string('units_left_label')->nullable();
            $table->integer('units_left')->default(0);
            $table->date('possession_date')->nullable();

            // Step 2 — Project Positioning
            $table->string('price_range')->nullable();
            $table->string('location_type')->nullable();
            $table->string('unit_structure')->nullable();

            // Step 3 — Market Dynamics
            $table->string('buyer_type')->nullable();
            $table->string('sales_velocity')->nullable();
            $table->string('target_timeline')->nullable();
            $table->string('developer_positioning')->nullable();

            // Step 7 — Contact Form
            $table->string('contact_name');
            $table->string('designation')->nullable();
            $table->string('phone', 15);
            $table->string('email');
            $table->string('developer_name');

            // Assessment output (JSON)
            $table->json('assessment')->nullable();

            // Admin tracking
            $table->enum('status', ['pending', 'reviewing', 'contacted', 'activated', 'rejected'])
                  ->default('pending');
            $table->text('admin_notes')->nullable();
            $table->timestamp('contacted_at')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('submitted_at')->nullable();

            $table->timestamps();

            // Indexes
            $table->index(['status', 'created_at']);
            $table->index('project_name');
            $table->index('city');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activation_requests');
    }
};