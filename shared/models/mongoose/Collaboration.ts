import mongoose, { Document, Schema } from 'mongoose';

export interface ICollaboration extends Document {
  projectId: mongoose.Types.ObjectId;
  agreementId?: mongoose.Types.ObjectId;
  folderId?: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  collaboratorId: mongoose.Types.ObjectId;
  collaboratorBoxId: string;
  role: 'viewer' | 'editor' | 'approver';
  status: 'pending' | 'accepted' | 'rejected';
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canApprove: boolean;
    canDelete: boolean;
  };
  message?: string;
  requestedAt: Date;
  respondedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CollaborationSchema = new Schema<ICollaboration>({
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  agreementId: {
    type: Schema.Types.ObjectId,
    ref: 'Document',
    default: null
  },
  folderId: {
    type: Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaboratorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaboratorBoxId: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['viewer', 'editor', 'approver'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  permissions: {
    canView: { type: Boolean, default: true },
    canEdit: { type: Boolean, default: false },
    canApprove: { type: Boolean, default: false },
    canDelete: { type: Boolean, default: false }
  },
  message: {
    type: String,
    default: null
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Set permissions based on role
CollaborationSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'viewer':
        this.permissions = { canView: true, canEdit: false, canApprove: false, canDelete: false };
        break;
      case 'editor':
        this.permissions = { canView: true, canEdit: true, canApprove: false, canDelete: false };
        break;
      case 'approver':
        this.permissions = { canView: true, canEdit: true, canApprove: true, canDelete: false };
        break;
    }
  }
  next();
});

// Indexes for performance
CollaborationSchema.index({ projectId: 1, status: 1 });
CollaborationSchema.index({ collaboratorId: 1, status: 1 });
CollaborationSchema.index({ ownerId: 1, status: 1 });
CollaborationSchema.index({ collaboratorBoxId: 1 });

export const Collaboration = mongoose.model<ICollaboration>('Collaboration', CollaborationSchema);
