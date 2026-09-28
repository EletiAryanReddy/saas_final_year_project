import { Schema, model } from 'mongoose';

const oid = Schema.Types.ObjectId;
const ws = { type: oid, ref: 'Workspace', required: true, index: true };

const conversationSchema = new Schema(
  {
    workspace: ws,
    type: { type: String, enum: ['workspace', 'team', 'dm'], required: true },
    name: String,
    members: [{ type: oid, ref: 'User' }],
    dmKey: String,
    createdBy: { type: oid, ref: 'User' },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: String,
  },
  { timestamps: true }
);
conversationSchema.index({ workspace: 1, dmKey: 1 }, { unique: true, partialFilterExpression: { dmKey: { $type: 'string' } } });
export const Conversation = model('Conversation', conversationSchema);

const messageSchema = new Schema(
  {
    workspace: ws,
    conversation: { type: oid, ref: 'Conversation', required: true, index: true },
    sender: { type: oid, ref: 'User', required: true },
    body: { type: String, default: '', maxlength: 4000 },
    readBy: [{ type: oid, ref: 'User' }],
    editedAt: Date,
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);
messageSchema.index({ conversation: 1, createdAt: -1 });
export const Message = model('Message', messageSchema);

const eventSchema = new Schema(
  {
    workspace: ws,
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    type: { type: String, enum: ['event', 'meeting'], default: 'event' },
    location: String,
    color: { type: String, default: '#0F5A55' },
    attendees: [{ type: oid, ref: 'User' }],
    project: { type: oid, ref: 'Project' },
    meeting: { type: oid, ref: 'Meeting' },
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
eventSchema.index({ workspace: 1, start: 1, end: 1 });
export const CalendarEvent = model('CalendarEvent', eventSchema);

const meetingSchema = new Schema(
  {
    workspace: ws,
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    roomId: { type: String, required: true, unique: true },
    host: { type: oid, ref: 'User', required: true },
    participants: [{ type: oid, ref: 'User' }],
    project: { type: oid, ref: 'Project' },
    status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
    createdBy: { type: oid, ref: 'User' },
  },
  { timestamps: true }
);
export const Meeting = model('Meeting', meetingSchema);

const callSchema = new Schema(
  {
    workspace: ws,
    roomId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['audio', 'video'], default: 'audio' },
    mode: { type: String, enum: ['direct', 'group'], default: 'direct' },
    initiator: { type: oid, ref: 'User', required: true },
    invited: [{ type: oid, ref: 'User' }],
    participants: [{ _id: false, user: { type: oid, ref: 'User' }, joinedAt: Date, leftAt: Date }],
    status: { type: String, enum: ['ringing', 'answered', 'missed', 'rejected', 'ended'], default: 'ringing' },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    durationSec: { type: Number, default: 0 },
  },
  { timestamps: true }
);
callSchema.index({ workspace: 1, startedAt: -1 });
export const Call = model('Call', callSchema);

const notificationSchema = new Schema(
  {
    workspace: ws,
    user: { type: oid, ref: 'User', required: true, index: true },
    actor: { type: oid, ref: 'User' },
    type: { type: String, required: true }, // task | project | meeting | chat | workspace | call
    title: { type: String, required: true },
    body: String,
    link: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
notificationSchema.index({ workspace: 1, user: 1, read: 1, createdAt: -1 });
export const Notification = model('Notification', notificationSchema);

const activitySchema = new Schema(
  {
    workspace: ws,
    actor: { type: oid, ref: 'User' },
    action: { type: String, required: true }, // created | updated | deleted | completed | commented | moved | joined
    entityType: { type: String, required: true },
    entityId: oid,
    message: { type: String, required: true },
    project: { type: oid, ref: 'Project' },
  },
  { timestamps: true }
);
activitySchema.index({ workspace: 1, createdAt: -1 });
export const Activity = model('Activity', activitySchema);
