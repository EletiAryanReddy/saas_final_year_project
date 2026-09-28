export type Role = 'owner' | 'admin' | 'member' | 'guest';

export interface User { id: string; name: string; email: string; avatar?: string; isVerified: boolean; preferences: { theme: 'light' | 'dark' | 'system'; language: string; timezone: string; notifications: Record<string, boolean> } }
export interface Workspace { _id: string; name: string; slug: string; logo?: string; plan: 'free' | 'pro' | 'business'; owner: string; description?: string; settings?: { allowMemberInvites: boolean }; role?: Role; permissions?: string[] }
export interface MembershipRef { membershipId: string; role: Role; workspace: Workspace }
export interface Person { _id: string; name: string; avatar?: string; email?: string }
export interface Member { membershipId: string; role: Role; joinedAt: string; user: Person }
export interface Tag { _id: string; name: string; color: string }
export interface Column { key: string; name: string; color: string; isDone: boolean }
export interface Project {
  _id: string; name: string; description?: string; status: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
  deadline?: string; color: string; members: Person[]; tags: Tag[]; columns: Column[]; stats?: { total: number; done: number; overdue: number };
}
export interface Task {
  _id: string; title: string; description?: string; status: string; priority: 'low' | 'medium' | 'high' | 'urgent';
  assignees: Person[]; tags: Tag[]; dueDate?: string; order: number; completedAt?: string | null;
  project: string | { _id: string; name: string; color: string; columns?: Column[] }; createdBy?: string; createdAt?: string;
}
export interface Comment { _id: string; body: string; createdAt: string; createdBy: Person }
export interface Conversation { _id: string; type: 'workspace' | 'team' | 'dm'; name?: string; members: Person[]; unread: number; lastMessageAt: string; lastMessagePreview?: string }
export interface Message { _id: string; conversation: string; sender: Person; body: string; createdAt: string; editedAt?: string; deleted?: boolean; readBy: string[] }
export interface EventItem { _id: string; title: string; description?: string; start: string; end: string; allDay?: boolean; type: 'event' | 'meeting'; location?: string; color?: string; attendees: Person[]; meeting?: string }
export interface Meeting { _id: string; title: string; description?: string; startsAt: string; endsAt?: string; roomId: string; host: Person; participants: Person[]; status: 'scheduled' | 'live' | 'ended' }
export interface Notification { _id: string; type: string; title: string; body?: string; link?: string; read: boolean; createdAt: string; actor?: Person }
export interface ActivityItem { _id: string; message: string; action: string; entityType: string; createdAt: string; actor?: Person }
export interface FileItem { _id: string; kind: 'file' | 'folder'; name: string; parent?: string | null; mimeType?: string; size: number; createdAt: string; createdBy?: Person }
export interface WikiPage { _id: string; title: string; icon?: string; content?: string; parent?: string | null; updatedAt: string; updatedBy?: Person }
export interface Whiteboard { _id: string; name: string; updatedAt: string; elements?: any[] }
export interface CallRecord { _id: string; roomId: string; type: 'audio' | 'video'; mode: 'direct' | 'group'; status: string; initiator: Person; invited: Person[]; participants: { user: Person }[]; startedAt: string; durationSec: number }
export type R<T> = { data: T };
export type Paged<T> = { data: T[]; page: number; limit: number; total: number };

export interface Note { _id: string; title: string; body: string; color: string; pinned: boolean; createdAt: string; updatedAt: string }
export type ComplaintCategory = 'workload' | 'conduct' | 'harassment' | 'process' | 'pay_benefits' | 'other';
export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';
export interface Complaint {
  _id: string; category: ComplaintCategory; subject: string; description: string; status: ComplaintStatus;
  anonymous: boolean; submitter: Person | null; assignedTo?: Person; adminResponse?: string; createdAt: string; resolvedAt?: string;
}
export interface AiMessage { _id: string; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface Announcement { _id: string; body: string; createdBy: Person; createdAt: string }
