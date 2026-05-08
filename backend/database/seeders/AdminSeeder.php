<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = 'tushar.b@ramanora.com';
        $password = 'Ramanora@6797';

        User::updateOrCreate(
            ['email' => $email],
            [
                'name' => 'Tushar B',
                'email' => $email,
                'password' => Hash::make($password),
                'role' => 'admin',
                'is_active' => true,
                'email_verified_at' => now(),
                'company_name' => 'Ramanora',
                'rera_no' => 'ADMIN-001',
                'phone' => '9999999999',
                'address' => 'Mumbai, Maharashtra',
            ]
        );

        $this->command->info("Admin created: {$email} / {$password}");
    }
}
