import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const UOMS = [
  { name: 'Piece', abbreviation: 'PC' },
  { name: 'Linear Meter', abbreviation: 'LM' },
  { name: 'Bag', abbreviation: 'BAG' },
  { name: 'Bottle', abbreviation: 'Bottle' },
  { name: 'Kilogram', abbreviation: 'Kilo' },
  { name: 'Liter', abbreviation: 'Liter' },
  { name: 'Meter', abbreviation: 'Meter' },
  { name: 'Pack', abbreviation: 'Pack' },
  { name: 'Pair', abbreviation: 'Pair' },
  { name: 'Roll', abbreviation: 'Roll' },
  { name: 'Set', abbreviation: 'Set' },
  { name: 'Tin', abbreviation: 'Tin' },
  { name: 'Cubic Meter', abbreviation: 'cum' },
  { name: 'Board Feet', abbreviation: 'BDFT' },
  { name: 'Box', abbreviation: 'Box' },
  { name: 'Gallon', abbreviation: 'Gallon' },
  { name: 'Bundle', abbreviation: 'Bundle' },
  { name: 'Sheet', abbreviation: 'Sheet' },
  { name: 'Length', abbreviation: 'Length' },
  { name: 'Sack', abbreviation: 'Sack' },
  { name: 'Can', abbreviation: 'Can' },
  { name: 'Tube', abbreviation: 'Tube' },
  { name: 'Per Trip', abbreviation: 'Per Trip' },
  { name: 'Dump Truck', abbreviation: 'DT' },
  { name: 'Roll 100M', abbreviation: '1ROLL/100M' },
  { name: 'Roll 150M', abbreviation: '1ROLL/150M' },
  { name: 'Roll 200M', abbreviation: '1ROLL/200M' },
  { name: 'Roll 300M', abbreviation: '1ROLL/300M' },
  { name: 'Roll 30M', abbreviation: '1ROLL/30M' },
  { name: 'Roll 50M', abbreviation: '1ROLL/50M' },
  { name: 'Roll 60M', abbreviation: '1ROLL/60M' },
  { name: 'Roll 90M', abbreviation: '1ROLL/90M' },
  { name: 'Roll 10M', abbreviation: '1ROLL/10M' },
  { name: 'Roll 20M', abbreviation: '1ROLL/20M' },
  { name: 'Roll 1000M', abbreviation: '1ROLL/1000M' },
  { name: 'Bag 40K', abbreviation: '1BAG/40K' },
  { name: 'Bag 20K', abbreviation: '1BAG/20K' },
  { name: 'Box 100P', abbreviation: '1BOX/100P' },
  { name: 'Box 20K', abbreviation: '1BOX/20K' },
  { name: 'Box 10K', abbreviation: '1BOX/10K' },
  { name: 'Pack 10P', abbreviation: '1PACK/10P' },
  { name: '250ml', abbreviation: '250ml' },
  { name: '200cc', abbreviation: '200cc' },
  { name: '100cc', abbreviation: '100cc' },
  { name: '400cc', abbreviation: '400cc' },
  { name: '240G', abbreviation: '240G' },
  { name: '250G', abbreviation: '250G' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const schema = new mongoose.Schema({ name: String, abbreviation: { type: String, unique: true }, syncVersion: Number, isDeleted: Boolean });
  const UOM = mongoose.models.UOM || mongoose.model('UOM', schema);

  let created = 0;
  for (const u of UOMS) {
    const exists = await UOM.findOne({ abbreviation: u.abbreviation });
    if (!exists) {
      await UOM.create({ ...u, syncVersion: 0, isDeleted: false });
      created++;
    }
  }
  console.log(`UOMs: ${created} created, ${UOMS.length - created} already existed`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
