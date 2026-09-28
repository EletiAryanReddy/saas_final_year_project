import bcrypt from 'bcryptjs';
import { connectDB } from './config/db';
import { User, Workspace, Membership, Project, Task, Tag, WikiPage, CalendarEvent, Conversation, Message } from './models';
import mongoose from 'mongoose';

/** Demo data: two users, one workspace, a project with tasks, a wiki page, an event and some chat. */
async function seed() {
  await connectDB();
  const pw = await bcrypt.hash('Demo1234', 12);
  const upsert = async (email: string, name: string) =>
    User.findOneAndUpdate({ email }, { name, email, password: pw, isVerified: true }, { upsert: true, new: true, setDefaultsOnInsert: true });

  const demo = await upsert('demo@collabspace.dev', 'Demo Owner');
  const sam = await upsert('sam@collabspace.dev', 'Sam Rivera');

  let ws = await Workspace.findOne({ slug: 'acme-studio' });
  if (!ws) ws = await Workspace.create({ name: 'Acme Studio', slug: 'acme-studio', owner: demo._id, description: 'Demo workspace' });
  await Membership.findOneAndUpdate({ user: demo._id, workspace: ws._id }, { role: 'owner' }, { upsert: true });
  await Membership.findOneAndUpdate({ user: sam._id, workspace: ws._id }, { role: 'member' }, { upsert: true });

  if (!(await Project.exists({ workspace: ws._id }))) {
    const [design, bug] = await Tag.insertMany([
      { workspace: ws._id, name: 'design', color: '#7C3AED' },
      { workspace: ws._id, name: 'bug', color: '#C8443A' },
    ]);
    const project = await Project.create({ workspace: ws._id, name: 'Website relaunch', description: 'New marketing site and pricing page.', members: [demo._id, sam._id], createdBy: demo._id, deadline: new Date(Date.now() + 21 * 864e5), tags: [design._id] });
    const rows: [string, string, string, string, number, any[]][] = [
      ['Audit current sitemap', 'done', 'low', 'Map every URL before we move things.', -3, [demo._id]],
      ['Design pricing page', 'in_progress', 'high', 'Three tiers, monthly and yearly toggle.', 4, [sam._id, demo._id]],
      ['Fix broken contact form', 'review', 'urgent', 'Form fails on Safari.', 1, [sam._id]],
      ['Write launch announcement', 'todo', 'medium', '', 10, [demo._id]],
      ['Set up analytics events', 'todo', 'medium', '', -1, [sam._id]],
    ];
    let i = 0;
    for (const [title, status, priority, description, due, assignees] of rows) {
      await Task.create({ workspace: ws._id, project: project._id, title, status, priority, description, assignees, dueDate: new Date(Date.now() + due * 864e5), order: i++, createdBy: demo._id, tags: title.includes('Fix') ? [bug._id] : [], completedAt: status === 'done' ? new Date() : undefined });
    }
    await WikiPage.create({ workspace: ws._id, title: 'Team handbook', icon: '📘', content: '# Team handbook\n\nWelcome! Our working agreements:\n\n- Ship small, ship often\n- Write decisions down\n- Keep the board honest\n', createdBy: demo._id, updatedBy: demo._id });
    await CalendarEvent.create({ workspace: ws._id, title: 'Sprint planning', start: new Date(Date.now() + 864e5), end: new Date(Date.now() + 864e5 + 3600e3), attendees: [demo._id, sam._id], createdBy: demo._id });
  }

  let conv = await Conversation.findOne({ workspace: ws._id, type: 'workspace' });
  if (!conv) conv = await Conversation.create({ workspace: ws._id, type: 'workspace', name: 'General', createdBy: demo._id });
  if (!(await Message.exists({ conversation: conv._id }))) {
    await Message.create({ workspace: ws._id, conversation: conv._id, sender: sam._id, body: 'Morning! Pricing page mockups are in review.', readBy: [sam._id] });
  }

  console.log('\nSeeded. Sign in with:\n  demo@collabspace.dev / Demo1234   (owner)\n  sam@collabspace.dev  / Demo1234   (member)\n');
  await mongoose.disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
