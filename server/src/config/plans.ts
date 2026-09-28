export type PlanId = 'free' | 'pro' | 'business';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD
  limits: { members: number; projects: number; storageMB: number };
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', name: 'Free', priceMonthly: 0,
    limits: { members: 5, projects: 3, storageMB: 100 },
    features: ['Up to 5 members', '3 projects', '100 MB storage', 'Chat, tasks and wiki'],
  },
  pro: {
    id: 'pro', name: 'Pro', priceMonthly: 12,
    limits: { members: 25, projects: 50, storageMB: 5120 },
    features: ['Up to 25 members', '50 projects', '5 GB storage', 'Audio and video calls', 'Analytics and CSV exports'],
  },
  business: {
    id: 'business', name: 'Business', priceMonthly: 29,
    limits: { members: 500, projects: 100000, storageMB: 102400 },
    features: ['Up to 500 members', 'Unlimited projects', '100 GB storage', 'Priority support'],
  },
};
