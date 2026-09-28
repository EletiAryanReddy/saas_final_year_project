import { Schema, model } from 'mongoose';

const oid = Schema.Types.ObjectId;
const ws = { type: oid, ref: 'Workspace', required: true, index: true };

const fileSchema = new Schema(
  {
    workspace: ws,
    kind: { type: String, enum: ['file', 'folder'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    parent: { type: oid, ref: 'FileItem', default: null, index: true },
    project: { type: oid, ref: 'Project' },
    mimeType: String,
    size: { type: Number, default: 0 },
    provider: { type: String, enum: ['cloudinary', 'local'] },
    url: String,
    publicId: String,
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
fileSchema.index({ workspace: 1, parent: 1, kind: 1, name: 1 });
export const FileItem = model('FileItem', fileSchema);

const wikiSchema = new Schema(
  {
    workspace: ws,
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: String,
    icon: { type: String, default: '📄' },
    content: { type: String, default: '', maxlength: 200000 },
    parent: { type: oid, ref: 'WikiPage', default: null },
    project: { type: oid, ref: 'Project' },
    versions: {
      type: [{ _id: false, content: String, title: String, editedBy: { type: oid, ref: 'User' }, editedAt: Date }],
      select: false,
      default: [],
    },
    createdBy: { type: oid, ref: 'User' },
    updatedBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
wikiSchema.index({ workspace: 1, parent: 1 });
export const WikiPage = model('WikiPage', wikiSchema);

const whiteboardSchema = new Schema(
  {
    workspace: ws,
    name: { type: String, required: true, trim: true, maxlength: 100 },
    project: { type: oid, ref: 'Project' },
    elements: { type: [Schema.Types.Mixed], default: [] },
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
export const Whiteboard = model('Whiteboard', whiteboardSchema);
