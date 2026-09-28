import { Schema, model } from 'mongoose';

const oid = Schema.Types.ObjectId;
const ws = { type: oid, ref: 'Workspace', required: true, index: true };

export const DEFAULT_COLUMNS = [
  { key: 'todo', name: 'To do', color: '#6B7C86', isDone: false },
  { key: 'in_progress', name: 'In progress', color: '#2F7FB8', isDone: false },
  { key: 'review', name: 'In review', color: '#C98A0B', isDone: false },
  { key: 'done', name: 'Done', color: '#1F8A5B', isDone: true },
];

const projectSchema = new Schema(
  {
    workspace: ws,
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, maxlength: 2000 },
    status: { type: String, enum: ['planning', 'active', 'on_hold', 'completed', 'archived'], default: 'active' },
    deadline: Date,
    color: { type: String, default: '#0F5A55' },
    members: [{ type: oid, ref: 'User' }],
    tags: [{ type: oid, ref: 'Tag' }],
    columns: {
      type: [{ _id: false, key: String, name: String, color: String, isDone: { type: Boolean, default: false } }],
      default: () => DEFAULT_COLUMNS.map((c) => ({ ...c })),
    },
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
projectSchema.index({ workspace: 1, status: 1 });
export const Project = model('Project', projectSchema);

const taskSchema = new Schema(
  {
    workspace: ws,
    project: { type: oid, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 10000 },
    status: { type: String, default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    assignees: [{ type: oid, ref: 'User' }],
    dueDate: Date,
    tags: [{ type: oid, ref: 'Tag' }],
    order: { type: Number, default: 0 },
    completedAt: Date,
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
taskSchema.index({ workspace: 1, project: 1, status: 1, order: 1 });
taskSchema.index({ workspace: 1, assignees: 1 });
taskSchema.index({ workspace: 1, dueDate: 1 });
export const Task = model('Task', taskSchema);

const commentSchema = new Schema(
  {
    workspace: ws,
    task: { type: oid, ref: 'Task', required: true, index: true },
    body: { type: String, required: true, maxlength: 4000 },
    createdBy: { type: oid, ref: 'User', required: true },
  },
  { timestamps: true }
);
export const Comment = model('Comment', commentSchema);

const tagSchema = new Schema(
  {
    workspace: ws,
    name: { type: String, required: true, trim: true, maxlength: 30 },
    color: { type: String, default: '#0F5A55' },
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
tagSchema.index({ workspace: 1, name: 1 }, { unique: true });
export const Tag = model('Tag', tagSchema);
