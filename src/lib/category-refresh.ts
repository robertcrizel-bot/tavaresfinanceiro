// Await mounted data providers before confirming a category mutation.
const listeners = new Set<() => Promise<void>>();
export const subscribeCategoryChanges = (listener: () => Promise<void>) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const refreshCategoryReferences = async () => {
  await Promise.all([...listeners].map(listener => listener()));
};
