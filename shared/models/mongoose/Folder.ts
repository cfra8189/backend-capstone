import mongoose, { Document, Schema } from 'mongoose';

export interface IFolder extends Document {
  name: string;
  path: string;
  parentId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: 'root' | 'year' | 'custom';
  year?: number;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema = new Schema<IFolder>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  path: {
    type: String,
    required: true,
    trim: true
  },
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['root', 'year', 'custom'],
    required: true
  },
  year: {
    type: Number,
    required: function(this: IFolder) {
      return this.type === 'year';
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
FolderSchema.index({ userId: 1, path: 1 });
FolderSchema.index({ userId: 1, parentId: 1 });
FolderSchema.index({ userId: 1, type: 1, year: 1 });

export const Folder = mongoose.model<IFolder>('Folder', FolderSchema);
