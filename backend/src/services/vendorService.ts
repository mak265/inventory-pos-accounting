import Vendor, { IVendor } from '../models/Vendor.js';
import mongoose from 'mongoose';

export const getAllVendors = async (filters: any = {}) => {
  const query: any = { isDeleted: false };
  
  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { contactPerson: { $regex: filters.search, $options: 'i' } }
    ];
  }

  const vendors = await Vendor.find(query)
    .sort({ name: 1 })
    .lean();
  
  return vendors;
};

export const getVendorById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid vendor ID');
  }

  const vendor = await Vendor.findOne({ _id: id, isDeleted: false }).lean();
  
  if (!vendor) {
    throw new Error('Vendor not found');
  }
  
  return vendor;
};

export const createVendor = async (vendorData: Partial<IVendor>, userId: string) => {
  const vendor = new Vendor({
    ...vendorData,
    createdBy: userId,
    updatedBy: userId
  });

  await vendor.save();
  return vendor;
};

export const updateVendor = async (id: string, vendorData: Partial<IVendor>, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid vendor ID');
  }

  const vendor = await Vendor.findOne({ _id: id, isDeleted: false });
  
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  Object.assign(vendor, vendorData, {
    updatedBy: userId,
    updatedAt: new Date()
  });

  await vendor.save();
  return vendor;
};

export const deleteVendor = async (id: string, userId: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid vendor ID');
  }

  const vendor = await Vendor.findOne({ _id: id, isDeleted: false });
  
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  vendor.isDeleted = true;
  vendor.updatedBy = new mongoose.Types.ObjectId(userId);
  vendor.updatedAt = new Date();
  
  await vendor.save();
  return { message: 'Vendor deleted successfully' };
};
