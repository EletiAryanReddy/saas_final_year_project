import { Activity } from '../models';
import { toWorkspace } from './realtime';

export async function logActivity(a: {
  workspace: string; actor?: string; action: string; entityType: string; entityId?: any; message: string; project?: any;
}) {
  try {
    const doc = await Activity.create(a);
    const populated = await doc.populate('actor', 'name avatar');
    toWorkspace(a.workspace, 'activity:new', populated.toObject());
  } catch (e) { console.error('[activity]', e); }
}
