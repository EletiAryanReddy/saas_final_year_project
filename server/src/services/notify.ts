import { Notification, User } from '../models';
import { toUser, isOnline } from './realtime';
import { sendMail, mailLayout } from '../utils/mailer';
import { env } from '../config/env';
import { uniq } from '../utils/helpers';

interface NotifyInput {
  workspace: string;
  users: any[];
  actor?: string;
  type: 'task' | 'project' | 'meeting' | 'chat' | 'workspace' | 'call';
  title: string;
  body?: string;
  link?: string;
  /** also send an email to recipients who are offline and have email notifications on */
  email?: boolean;
}

export async function notify(input: NotifyInput) {
  const ids = uniq(input.users).filter((id) => id !== String(input.actor || ''));
  if (!ids.length) return;
  const users = await User.find({ _id: { $in: ids } }).select('email name preferences');

  const docs = [];
  for (const u of users) {
    const prefs: any = u.preferences?.notifications || {};
    if (prefs[input.type] === false) continue;
    docs.push({
      workspace: input.workspace, user: u._id, actor: input.actor,
      type: input.type, title: input.title, body: input.body, link: input.link,
    });
    if (input.email && prefs.email !== false && !isOnline(input.workspace, String(u._id))) {
      sendMail(
        u.email, input.title,
        mailLayout(input.title, `<p>${input.body || ''}</p>${input.link ? `<p><a href="${env.clientUrl}${input.link}">Open in CollabSpace</a></p>` : ''}`)
      );
    }
  }
  if (!docs.length) return;
  const created = await Notification.insertMany(docs);
  for (const n of created) toUser(String(n.user), 'notification:new', n.toObject());
}
