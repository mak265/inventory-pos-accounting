import mongoose, { Schema, Document } from 'mongoose';

export interface IUOM extends Document {
  name: string;
  abbreviation: string;
  createdAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
  syncVersion: number;
  isDeleted: boolean;
}

const UOMSchema: Schema = new Schema({
  name: {
    type: String,
    required: [true, 'UOM name is required'],
    trim: true
  },
  abbreviation: {
    type: String,
    required: [true, 'UOM abbreviation is required'],
    trim: true,
    lowercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  syncVersion: {
    type: Number,
    default: 0
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
UOMSchema.index({ abbreviation: 1 }, { unique: true });
UOMSchema.index({ isDeleted: 1 });

// Update timestamps on save
UOMSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model<IUOM>('UOM', UOMSchema);
