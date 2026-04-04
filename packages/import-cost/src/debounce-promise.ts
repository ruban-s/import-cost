const promises: Record<string, Promise<unknown>> = {};

export const DebounceError = new Error('DebounceError');

export function debouncePromise<T>(
  key: string,
  fn: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
  delay = 500,
): Promise<T> {
  const promise = new Promise<T>((resolve, reject) => {
    setTimeout(
      () =>
        promises[key] === promise
          ? new Promise<T>(fn).then(resolve).catch(reject)
          : reject(DebounceError),
      delay,
    );
  });
  promises[key] = promise;
  return promise;
}
