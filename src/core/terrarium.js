// terrarium/1 client. Resolves to a client when a shell answers hello with
// welcome, or to null (standalone) after `timeout` ms.

export function connectTerrarium({ title, accepts = [], timeout = 1000, win = globalThis.window } = {}) {
  if (!win || win.parent === win) return Promise.resolve(null);
  return new Promise((resolve) => {
    const pending = new Map();
    const handlers = new Map();
    let n = 0;
    let done = false;
    const post = (msg) => win.parent.postMessage({ terrarium: 1, ...msg }, '*');
    const client = {
      windowId: null,
      file: null,
      request(type, fields = {}) {
        const id = `hr${++n}`;
        return new Promise((res, rej) => {
          pending.set(id, { res, rej });
          post({ type, id, ...fields });
        });
      },
      notify(type, fields = {}) { post({ type, ...fields }); },
      on(type, fn) { handlers.set(type, fn); },
    };
    win.addEventListener('message', (e) => {
      const m = e.data;
      if (!m || m.terrarium !== 1 || e.source !== win.parent) return;
      if (m.type === 'welcome') {
        if (done) return;
        done = true;
        client.windowId = m.windowId;
        client.file = m.file || null;
        resolve(client);
      } else if (m.type === 'reply') {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.ok) p.res(m);
        else {
          const err = new Error(m.error || 'failed');
          err.cancelled = m.error === 'cancelled';
          p.rej(err);
        }
      } else {
        handlers.get(m.type)?.(m);
      }
    });
    post({ type: 'hello', title, accepts });
    setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeout);
  });
}
