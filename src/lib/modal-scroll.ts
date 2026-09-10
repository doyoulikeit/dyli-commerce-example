const locks = new WeakMap<Document, { count: number; previous: string }>();

export function acquireModalScroll(document: Document) {
  const lock = locks.get(document) || { count: 0, previous: document.body.style.overflow };
  lock.count++;
  locks.set(document, lock);
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count === 0) {
      document.body.style.overflow = lock.previous;
      locks.delete(document);
    }
  };
}
