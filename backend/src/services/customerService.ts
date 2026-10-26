import Customer, { ICustomer } from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Payment from '../models/Payment.js';
import CheckRecord from '../models/CheckRecord.js';
import mongoose from 'mongoose';

export const getAllCustomers = async (filters: any = {}) => {
  const query: any = { isDeleted: false };
  
  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { phone: { $regex: filters.search, $options: 'i' } }
    ];
  }

  // Sort alphabetically by name (case-insensitive)
  const customers = await Customer.find(query)
    .collation({ locale: 'en', strength: 2 })
    .sort({ name: 1 })
    .lean();
  
  return customers;
};

export const getCustomerById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid customer ID');
  }

  const customer = await Customer.findOne({ _id: id, isDeleted: false }).lean();
  
  if (!customer) {
    throw new Error('Customer not found');
  }
  
  return customer;
};

export const getCustomerHistory = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid customer ID');
  }

  const customer = await Customer.findOne({ _id: id, isDeleted: false });

  if (!customer) {
    throw new Error('Customer not found');
  }

  // Fetch completed sales for this customer
  const sales = await Sale.find({
    customerId: new mongoose.Types.ObjectId(id),
    isDeleted: false,
    status: 'COMPLETED'
  }).sort({ saleDate: -1 }).lean();

  const saleIds = sales.map(s => s._id);

  // Fetch payments for these sales
  const payments = await Payment.find({
    saleId: { $in: saleIds },
    isDeleted: false
  }).lean();

  // Fetch bounced checks for this customer
  const bouncedChecks = await CheckRecord.find({
    customerName: customer.name,
    status: 'BOUNCED',
    isDeleted: false
  }).lean();

  // Build payment map by saleId
  const paymentMap = new Map<string, any[]>();
  for (const p of payments) {
    const sid = p.saleId.toString();
    if (!paymentMap.has(sid)) paymentMap.set(sid, []);
    paymentMap.get(sid)!.push(p);
  }

  // Build per-channel totals across all payments
  let totalBPI = 0, totalGCash = 0, totalAUB = 0, totalCash = 0, totalCheck = 0, totalOther = 0;
  for (const p of payments) {
    totalCash += p.cashPayment || 0;
    for (const ch of p.paymentChannels || []) {
      const c = (ch.channel || '').toUpperCase();
      if (c === 'BPI') totalBPI += ch.amount;
      else if (c === 'GCASH') totalGCash += ch.amount;
      else if (c === 'AUB') totalAUB += ch.amount;
      else if (c === 'CASH') totalCash += ch.amount;
      else if (c === 'CHECK') totalCheck += ch.amount;
      else totalOther += ch.amount;
    }
  }

  const transactions = sales.map(sale => {
    const salePayments = paymentMap.get(sale._id.toString()) || [];
    const totalPaid = salePayments.reduce((s, p) => s + (p.totalPaid || 0), 0);
    return {
      drNumber: sale.drNumber,
      date: sale.saleDate,
      description: sale.lineItems.map(li => li.description).join(', '),
      quantity: sale.lineItems.reduce((s, li) => s + li.quantity, 0),
      sellingPrice: sale.totalAmount,
      totalAmount: sale.totalAmount,
      totalPaid,
      unpaid: sale.totalAmount - totalPaid,
      lineItems: sale.lineItems
    };
  });

  return {
    customer,
    transactions,
    channelTotals: { BPI: totalBPI, GCash: totalGCash, AUB: totalAUB, Cash: totalCash, Check: totalCheck, Other: totalOther },
    bouncedChecks: bouncedChecks.map(bc => ({
      _id: bc._id,
      amount: bc.amount,
      referenceNumber: bc.referenceNumber,
      customerName: bc.customerName,
      bouncedDate: bc.bouncedDate,
      receivedDate: bc.receivedDate,
      paymentId: bc.paymentId
    }))
  };
};

export const getCustomerBalance = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid customer ID');
  }

  const customer = await Customer.findOne({ _id: id, isDeleted: false }).lean();
  
  if (!customer) {
    throw new Error('Customer not found');
  }
  
  return {
    customerId: customer._id,
    customerName: customer.name,
    balance: customer.balance
  };
};

export const createCustomer = async (customerData: Partial<ICustomer>, userId: string) => {
  const name = (customerData.name || '').trim();
  if (!name) {
    throw new Error('Customer name is required');
  }

  // Check for duplicate name (case-insensitive)
  const existing = await Customer.findOne({
    name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    isDeleted: false
  });

  if (existing) {
    // Avoid creating duplicate customer records for the same name.
    return existing;
  }

  const customer = new Customer({
    ...customerData,
    name,
    balance: 0, // Initialize balance to 0
    createdBy: userId,
    updatedBy: userId
  });

  await customer.save();
  return customer;
};

export const updateCustomer = async (id: string, customerData: Partial<ICustomer>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid customer ID');
  }

  const customer = await Customer.findOne({ _id: id, isDeleted: false });
  
  if (!customer) {
    throw new Error('Customer not found');
  }

  // Don't allow direct balance updates through this endpoint
  // Balance should only be updated through sales and payment transactions
  const { balance, ...updateData } = customerData;

  Object.assign(customer, updateData, {
    updatedBy: userId,
    updatedAt: new Date()
  });

  await customer.save();
  return customer;
};

export const deleteCustomer = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid customer ID');
  }

  const customer = await Customer.findOne({ _id: id, isDeleted: false });
  
  if (!customer) {
    throw new Error('Customer not found');
  }

  customer.isDeleted = true;
  customer.updatedBy = new mongoose.Types.ObjectId(userId);
  customer.updatedAt = new Date();
  
  await customer.save();
  return { message: 'Customer deleted successfully' };
};

export const calculateCustomerBalance = async (customerId: string): Promise<number> => {
  // TODO: This will be implemented when Sales and Payment modules are complete
  // For now, return the stored balance
  const customer = await Customer.findOne({ _id: customerId, isDeleted: false });
  if (!customer) {
    throw new Error('Customer not found');
  }
  return customer.balance;
};

export const updateCustomerBalance = async (customerId: string, amount: number, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new Error('Invalid customer ID');
  }

  const customer = await Customer.findOne({ _id: customerId, isDeleted: false });
  
  if (!customer) {
    throw new Error('Customer not found');
  }

  customer.balance = Math.max(0, customer.balance + amount);
  customer.updatedBy = new mongoose.Types.ObjectId(userId);
  customer.updatedAt = new Date();
  
  await customer.save();
  return customer;
};
