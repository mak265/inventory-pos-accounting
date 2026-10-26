import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import Payment from '../models/Payment.js';
import CheckRecord from '../models/CheckRecord.js';

async function migrateCheckRecords() {
  try {
    await connectDatabase();
    console.log('🔄 Starting CheckRecord migration from existing payments...\n');

    // Find all non-deleted payments that have CHECK payment channels
    const payments = await Payment.find({
      isDeleted: false,
      'paymentChannels.channel': 'CHECK',
    }).populate('customerId', 'name');

    console.log(`Found ${payments.length} payment(s) with CHECK channels.`);

    let created = 0;
    let skipped = 0;

    for (const payment of payments) {
      for (const channel of payment.paymentChannels) {
        if (channel.channel !== 'CHECK' || channel.amount <= 0) continue;

        // Check if a CheckRecord already exists for this payment
        const exists = await CheckRecord.findOne({
          paymentId: payment._id,
          isDeleted: false,
        });

        if (exists) {
          skipped++;
          console.log(`  ⏭ Skipped payment ${payment._id} — CheckRecord already exists`);
          continue;
        }

        const customerName =
          (payment as any).customerId?.name || 'Walk-in';

        await CheckRecord.create({
          paymentId: payment._id,
          customerName,
          amount: channel.amount,
          referenceNumber: channel.referenceNumber || '',
          accountName: channel.accountName || '',
          effectiveDate: channel.effectiveDate || undefined,
          receivedDate: payment.paymentDate,
          status: 'PENDING',
        });

        created++;
        console.log(
          `  ✅ Created CheckRecord for payment ${payment._id} — ${customerName} — ₱${channel.amount.toLocaleString()}`
        );
      }
    }

    console.log(`\n🎉 Migration complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);

    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

migrateCheckRecords();
