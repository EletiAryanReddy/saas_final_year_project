import { Schema, model } from 'mongoose';

const oid = Schema.Types.ObjectId;
const ws = { type: oid, ref: 'Workspace', required: true, index: true };

/* ---------------- personal notes ---------------- */
const noteSchema = new Schema(
  {
    workspace: ws,
    title: { type: String, trim: true, maxlength: 120, default: '' },
    body: { type: String, default: '', maxlength: 20000 },
    color: { type: String, default: '#F5E9B8' },
    pinned: { type: Boolean, default: false },
    createdBy: { type: oid, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);
noteSchema.index({ workspace: 1, createdBy: 1, pinned: -1, updatedAt: -1 });
export const Note = model('Note', noteSchema);

/* ---------------- complaint box ---------------- */
export const COMPLAINT_CATEGORIES = ['workload', 'conduct', 'harassment', 'process', 'pay_benefits', 'other'] as const;
export const COMPLAINT_STATUSES = ['open', 'in_review', 'resolved', 'dismissed'] as const;

const complaintSchema = new Schema(
  {
    workspace: ws,
    submitter: { type: oid, ref: 'User', required: true }, // always stored internally, even when anonymous, so we can notify the right person
    anonymous: { type: Boolean, default: false },
    category: { type: String, enum: COMPLAINT_CATEGORIES, default: 'other' },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, maxlength: 8000 },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'open' },
    assignedTo: { type: oid, ref: 'User' },
    adminResponse: { type: String, maxlength: 4000 }, // visible to the submitter
    notes: {
      // internal notes between admins/owner; never shown to the submitter
      type: [{ _id: false, body: String, by: { type: oid, ref: 'User' }, at: { type: Date, default: Date.now } }],
      default: [],
    },
    resolvedAt: Date,
  },
  { timestamps: true }
);
complaintSchema.index({ workspace: 1, status: 1, createdAt: -1 });
complaintSchema.index({ workspace: 1, submitter: 1 });
export const Complaint = model('Complaint', complaintSchema);

/* ---------------- AI assistant conversation history ---------------- */
const aiMessageSchema = new Schema(
  {
    workspace: ws,
    user: { type: oid, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 20000 },
  },
  { timestamps: true }
);
aiMessageSchema.index({ workspace: 1, user: 1, createdAt: 1 });
export const AiMessage = model('AiMessage', aiMessageSchema);

/* ---------------- workspace announcements ---------------- */
const announcementSchema = new Schema(
  {
    workspace: ws,
    body: { type: String, required: true, maxlength: 2000 },
    createdBy: { type: oid, ref: 'User', required: true },
  },
  { timestamps: true }
);
export const Announcement = model('Announcement', announcementSchema);
