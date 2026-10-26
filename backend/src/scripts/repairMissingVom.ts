import dotenv from 'dotenv'
dotenv.config({ override: false })

import { connectDatabase } from '../config/database-adapter.js'

async function main() {
  const dryRun = process.argv.includes('--dryRun') || process.argv.includes('--dryrun') || process.argv.includes('-n');
  console.log('Repair Missing VOM — dryRun=', dryRun)

  await connectDatabase()

  const Sale = (await import('../models/Sale.js')).default
  const Product = (await import('../models/Product.js')).default

  const sales = await Sale.find({ isDeleted: { $ne: true }, status: 'COMPLETED' }).sort({ postedAt: 1, createdAt: 1 }).lean();
  console.log(`Found ${sales.length} completed sales to scan`)

  let scanned = 0, skipped = 0, tagged = 0, created = 0

  for (const sale of sales) {
    scanned++
    const saleIdStr = sale._id.toString()
    const saleTime = sale.postedAt ? new Date(sale.postedAt).getTime() : new Date(sale.updatedAt || sale.createdAt).getTime()

    for (const item of sale.lineItems || []) {
      // Resolve product
      let product: any = null
      if (item.productId) {
        try { product = await Product.findById(item.productId).lean(); } catch { product = null }
      }
      if (!product && item.description?.trim()) {
        const desc = item.description.trim()
        product = await Product.findOne({ description: { $regex: new RegExp('^' + desc.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '$', 'i') }, isDeleted: { $ne: true } }).lean()
      }
      if (!product) { skipped++; continue }

      const expectedDeduction = (item.quantity || 0) * (item.conversionFactor || 1)

      // Check if already has SALE VOM
      const already = (product.vomData || []).some((v: any) => v.referenceType === 'SALE' && String(v.referenceId) === saleIdStr)
      if (already) { skipped++; continue }

      // Heuristic: find untagged VOM matching qty and time window
      const vomEntries = product.vomData || []
      let match: any = null
      let bestDiff = Infinity
      for (const v of vomEntries) {
        if (v.referenceType) continue
        if (!v.quantityOut || v.quantityOut <= 0) continue
        const timeDiff = Math.abs(new Date(v.date).getTime() - saleTime)
        const tolerance = Math.max(0.01, expectedDeduction * 0.05)
        if (Math.abs(v.quantityOut - expectedDeduction) <= tolerance && timeDiff < 60 * 60 * 1000 && timeDiff < bestDiff) {
          match = v; bestDiff = timeDiff
        }
      }

      if (match) {
        if (!dryRun) {
          await Product.updateOne(
            { _id: product._id },
            { $set: { 'vomData.$[entry].referenceType': 'SALE', 'vomData.$[entry].referenceId': saleIdStr } },
            { arrayFilters: [{ 'entry.referenceType': { $exists: false }, 'entry.date': match.date }] }
          )
        }
        tagged++
        continue
      }

      // No matching VOM — create one
      if (!dryRun) {
        const fresh = await Product.findById(product._id)
        if (!fresh) { skipped++; continue }
        const stockBefore = fresh.availableStock || 0
        const stockAfter = stockBefore - expectedDeduction
        fresh.availableStock = stockAfter
        if (!fresh.vomData) fresh.vomData = []
        fresh.vomData.push({
          date: sale.postedAt ? new Date(sale.postedAt) : new Date(sale.updatedAt || sale.createdAt),
          quantityIn: 0,
          quantityOut: expectedDeduction,
          balance: stockAfter,
          reason: `REPAIR-MIGRATION: SALE ${sale.drNumber}`,
          referenceType: 'SALE',
          referenceId: saleIdStr
        })
        await fresh.save()
      }
      created++
    }
  }

  console.log('Scan complete:', { scanned, skipped, tagged, created })
  if (dryRun) console.log('Dry-run complete. No writes were made.')
  process.exit(0)
}

main().catch(err => { console.error('Script error:', err); process.exit(1) })
