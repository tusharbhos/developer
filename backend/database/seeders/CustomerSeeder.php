<?php
// database/seeders/CustomerSeeder.php
namespace Database\Seeders;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        // Get regular users (non-admin)
        $users = User::where('role', 'user')->get();

        // If no regular users exist, create a demo user
        if ($users->isEmpty()) {
            $demoUser = User::create([
                'name' => 'Demo User',
                'email' => 'demo@channelpartner.network',
                'password' => bcrypt('demo123'),
                'company_name' => 'Demo Realty',
                'rera_no' => 'RERA-DEMO-001',
                'phone' => '9876543210',
                'address' => 'Mumbai, Maharashtra',
                'role' => 'user',
                'is_active' => true,
                'email_verified_at' => now(),
            ]);
            $users = collect([$demoUser]);
        }

        // Sample customers data
        $customers = [
            [
                'nickname' => 'Mr. Sharma - Luxury Villa',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Rajesh Sharma',
                'email' => 'rajesh.sharma@example.com',
                'phone' => '9876543210',
                'address' => 'Andheri East, Mumbai - 400069',
                'meeting_date' => now()->addDays(2),
                'meeting_time' => '15:30:00',
                'notes' => 'Interested in luxury villas, budget 5-7 Cr, prefers Powai or Andheri location',
                'project_name' => 'Hiranandani Gardens',
                'status' => 'active',
            ],
            [
                'nickname' => 'Patel Family - 3BHK',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Amit Patel',
                'email' => 'amit.patel@example.com',
                'phone' => '9876543211',
                'address' => 'Borivali West, Mumbai - 400092',
                'meeting_date' => now()->addDays(5),
                'meeting_time' => '11:00:00',
                'notes' => 'Looking for 3BHK ready to move, budget 1.5-2 Cr, need good school nearby',
                'project_name' => 'Godrej Reserve',
                'status' => 'active',
            ],
            [
                'nickname' => 'Singh Investment - Commercial',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Vikram Singh',
                'email' => 'vikram.singh@example.com',
                'phone' => '9876543212',
                'address' => 'Navi Mumbai - 400706',
                'meeting_date' => now()->addDays(3),
                'meeting_time' => '14:00:00',
                'notes' => 'Looking for commercial property for investment, budget 2-3 Cr, high rental yield area',
                'project_name' => '',
                'status' => 'active',
            ],
            [
                'nickname' => 'Gupta - First Time Home',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Rahul Gupta',
                'email' => 'rahul.gupta@example.com',
                'phone' => '9876543213',
                'address' => 'Thane West - 400601',
                'meeting_date' => now()->addDays(7),
                'meeting_time' => '16:30:00',
                'notes' => 'First time home buyer, looking for 2BHK under 80L, need good connectivity',
                'project_name' => 'Mahindra Happinest',
                'status' => 'active',
            ],
            [
                'nickname' => 'Desai NRI - Investment',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Meera Desai',
                'email' => 'meera.desai@example.com',
                'phone' => '9876543214',
                'address' => 'Powai, Mumbai - 400076',
                'meeting_date' => now()->addDays(10),
                'meeting_time' => '12:00:00',
                'notes' => 'NRI client, looking for luxury property with high appreciation potential, budget 4-6 Cr',
                'project_name' => 'Prestige Park Grove',
                'status' => 'inactive',
            ],
            [
                'nickname' => 'Kumar - Urgent Requirement',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Suresh Kumar',
                'email' => 'suresh.kumar@example.com',
                'phone' => '9876543215',
                'address' => 'Kandivali East, Mumbai - 400101',
                'meeting_date' => now()->addDays(1),
                'meeting_time' => '10:30:00',
                'notes' => 'Urgent requirement, need possession within 3 months, budget 1-1.2 Cr',
                'project_name' => 'Lodha Palava',
                'status' => 'Booked',
            ],
            [
                'nickname' => 'Joshi - Senior Citizen',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Arun Joshi',
                'email' => 'arun.joshi@example.com',
                'phone' => '9876543216',
                'address' => 'Dadar West, Mumbai - 400028',
                'meeting_date' => now()->addDays(4),
                'meeting_time' => '09:00:00',
                'notes' => 'Retired couple, looking for peaceful locality with amenities, budget 1.2-1.5 Cr',
                'project_name' => 'Sobha Dream Acres',
                'status' => 'active',
            ],
            [
                'nickname' => 'Fernandes - Premium',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Maria Fernandes',
                'email' => 'maria.fernandes@example.com',
                'phone' => '9876543217',
                'address' => 'Bandra West, Mumbai - 400050',
                'meeting_date' => now()->addDays(8),
                'meeting_time' => '17:00:00',
                'notes' => 'Looking for premium sea-facing apartment, budget 8-10 Cr, need parking for 3 cars',
                'project_name' => '',
                'status' => 'active',
            ],
            [
                'nickname' => 'Reddy - Business Investment',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Prakash Reddy',
                'email' => 'prakash.reddy@example.com',
                'phone' => '9876543218',
                'address' => 'Hyderabad, Telangana',
                'meeting_date' => now()->addDays(12),
                'meeting_time' => '11:30:00',
                'notes' => 'Businessman looking for commercial investment in Mumbai, budget 5-7 Cr, multiple properties',
                'project_name' => '',
                'status' => 'active',
            ],
            [
                'nickname' => 'Mehta - Quick Decision',
                'secret_code' => 'CUST-' . Str::random(8),
                'name' => 'Neha Mehta',
                'email' => 'neha.mehta@example.com',
                'phone' => '9876543219',
                'address' => 'Vashi, Navi Mumbai - 400703',
                'meeting_date' => now()->addDays(2),
                'meeting_time' => '15:00:00',
                'notes' => 'Quick decision maker, already shortlisted 3 properties, will finalize in this meeting',
                'project_name' => 'Runwal Gardens',
                'status' => 'active',
            ],
        ];

        // Assign customers to each user (alternating)
        foreach ($users as $index => $user) {
            // Assign 3-5 customers per user
            $userCustomers = array_slice($customers, ($index * 5) % count($customers), 5);

            foreach ($userCustomers as $customerData) {
                Customer::create(array_merge($customerData, [
                    'user_id' => $user->id,
                ]));
            }
        }

        $this->command->info('✅ ' . Customer::count() . ' customers seeded successfully!');
    }
}
