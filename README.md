# CollabSpace

A full multi-tenant SaaS collaboration platform: workspaces, projects & Kanban boards, tasks,
real-time chat, audio/video calls & meetings (WebRTC), calendar, file storage, wiki, whiteboard,
notifications, analytics, billing, an AI assistant, private notes, a confidential complaint box,
and real-time workspace announcements.

```
collabspace/
  server/   Express + TypeScript + MongoDB + Socket.IO API
  client/   Next.js 14 (App Router) + TypeScript + Tailwind
```

## 1. Prerequisites
- Node.js 18+
- A MongoDB database (local `mongod`, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)

## 2. Backend setup
```bash
cd server
cp .env.example .env      # edit MONGODB_URI etc. Defaults work for a local Mongo instance.
npm install
npm run seed               # optional: creates demo@collabspace.dev / Demo1234 (owner) and sam@collabspace.dev (member)
npm run dev                 # http://localhost:5000
```

Nothing else is required to run the whole app: if `SMTP_HOST` is left blank, verification codes and
invite links are printed to the server console (and returned in the API response in development) instead
of emailed. If `CLOUDINARY_*` is left blank, uploaded files are stored on local disk under `server/uploads/`.

## 3. Frontend setup
```bash
cd client
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000, register an account (or sign in with the seeded demo accounts above),
and you're in.

## 4. Optional integrations
| Feature | Env vars | Without it |
|---|---|---|
| Sending real email (verification, invites, resets) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Emails are logged to the server console |
| Google sign-in | `GOOGLE_CLIENT_ID` (server) + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (client), from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) | The Google button is hidden |
| Cloud file storage | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Files are stored on local disk |
| TURN server (calls across strict NATs/firewalls) | `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Calls use STUN only, which fails for a minority of network setups; see [coturn](https://github.com/coturn/coturn) or a hosted TURN provider |
| Real payments | see `server/src/services/payments.ts` | `PAYMENT_MODE=mock` activates plan changes immediately, no card needed, for demos and course submissions |
| AI assistant | `ANTHROPIC_API_KEY` (get one at [console.anthropic.com](https://console.anthropic.com)), optionally `AI_MODEL` (defaults to `claude-sonnet-5`) | The AI Assistant page shows a "not configured" notice and the send box is disabled |

## 5. Deploying
- **Backend** → Render, Railway, Fly.io, or any Node host. Set the same env vars as `.env`.
- **Database** → MongoDB Atlas (free tier is enough for a class project or demo).
- **Frontend** → Vercel. Set `API_URL` to your backend's URL (used server-side for the `/api` rewrite)
  and `NEXT_PUBLIC_SOCKET_URL` to the same URL (the browser connects to Socket.IO directly, since
  Vercel cannot proxy WebSockets).
- **File storage** → Cloudinary (local disk storage does not persist on most hosts' ephemeral filesystems).

## 6. Architecture notes
- **Tenant isolation**: every workspace-scoped document has an indexed `workspace` field. The `tenant`
  middleware (`server/src/middleware/tenant.ts`) resolves the caller's membership from the
  `x-workspace-id` header and every query is filtered by it — see `utils/crud.ts` for the shared,
  tenant-scoped CRUD factory used by most routes.
- **RBAC**: `server/src/config/permissions.ts` defines an owner/admin/member/guest permission matrix.
  `GET /api/workspaces/permissions` exposes it, and the frontend's `useApp().can(...)` checks it before
  rendering an action, while every route re-checks it server-side.
- **Realtime**: one Socket.IO server (`server/src/sockets/index.ts`) handles presence, chat typing,
  Kanban drag-and-drop broadcasts, WebRTC signalling for calls/meetings (peer-to-peer mesh, capped at
  `MAX_MESH_PEERS`), and live whiteboard drawing.
- **Calls**: peer-to-peer WebRTC mesh (no media server) — simplest to run and good for small teams/demos.
  For large group calls in production, swap in an SFU (LiveKit, mediasoup, Janus).
- **AI Assistant** (`/ai`): a per-user, per-workspace chat backed by the Anthropic Messages API
  (`server/src/services/ai.ts`). Conversation history is stored in Mongo and replayed as context on each
  turn. Requires `ANTHROPIC_API_KEY`; degrades to a clear "not configured" message otherwise.
- **Notes** (`/notes`): private sticky notes, scoped to `workspace + createdBy` — nobody else, including
  admins, can read another member's notes.
- **Complaint Box** (`/complaints`): any member can file a complaint, optionally anonymously. Owners/admins
  (permission `complaint:manage`) see every complaint, set its status, and write a response the submitter
  sees — anonymous submitters' identities are hidden from that view (masked server-side in
  `server/src/routes/complaints.ts`, not just in the UI), while internal admin notes are never shown to
  the submitter.
- **Announcements**: owners/admins (permission `announcement:create`) can broadcast a message from the
  Team page. It's pushed over the existing Socket.IO connection to everyone currently online (a dismissible
  banner at the top of the app) and delivered as a notification + email to everyone else.
