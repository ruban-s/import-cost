const pending = new Map<string, Promise<unknown>>();

export const DebounceError = new Error('DebounceError');

export function debouncePromise<T>(
  key: string,
  fn: () => Promise<T>,
  delay = 500,
): Promise<T> {
  const promise: Promise<T> = new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      if (pending.get(key) !== promise) return reject(DebounceError);
      pending.delete(key);
      fn().then(resolve, reject);
    }, delay);
  });
  pending.set(key, promise);
  return promise;
}
