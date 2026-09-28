/** Shared aggregation expressions. */
export const notDone = { $eq: [{ $ifNull: ['$completedAt', null] }, null] };

/**
 * A task is overdue only if it is not done AND it actually has a due date in the past.
 * (In Mongo, a missing/null dueDate sorts below every date, so a bare $lt would wrongly match it.)
 */
export const isOverdue = (now: Date) => ({
  $and: [notDone, { $gt: [{ $ifNull: ['$dueDate', null] }, null] }, { $lt: ['$dueDate', now] }],
});
