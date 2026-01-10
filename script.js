// ==== SAVE & RESTORE COLLAPSE STATE FOR MARKMAP ====
// Hàm duyệt toàn bộ node để gán trạng thái từ localStorage
function restoreNodeState(node) {
  const key = node.content;
  let saved = null;
  try {
    saved = window.localStorage.getItem("mm-state-" + key);
  } catch (e) {
    // localStorage unavailable (permission/private mode); keep saved = null
  }

  if (saved !== null) {
    node.payload = node.payload || {};
    node.payload.fold = saved === "true"; // true = collapsed
  }

  if (node.children) {
    node.children.forEach(restoreNodeState);
  }
}

// Quan sát khi người dùng click vào node
function enableStateSaving(mm) {
  // Listen for state changes on the markmap instance
  const originalSetData = mm.setData.bind(mm);
  mm.setData = function(data) {
    originalSetData(data);
    saveAllNodeStates(data);
  };

  // Also save on direct node clicks
  mm.svg.on("click", (event) => {
    const el = event.target.closest("g.markmap-node");
    if (!el || !el.__data__) return;

    const node = el.__data__;
    setTimeout(() => {
      saveNodeState(node);
      saveAllNodeStates(mm.state.data);
    }, 50);
  });
}

// Save individual node state
function saveNodeState(node) {
  const key = node.content;
  const collapsed = node.payload?.fold ? "true" : "false";
  localStorage.setItem("mm-state-" + key, collapsed);
  console.log("Saved:", key, collapsed);
}

// Recursively save all node states
function saveAllNodeStates(node) {
  if (!node) return;
  saveNodeState(node);
  if (node.children) {
    node.children.forEach(saveAllNodeStates);
  }
}

// === APPLY ===
function initializeState() {
  if (!window.mm) {
    setTimeout(initializeState, 100);
    return;
  }

  const root = window.mm.state.data;
  restoreNodeState(root);
  window.mm.setData(root);
  window.mm.fit();
  enableStateSaving(window.mm);
}

initializeState();

// PSEUDOCODE / PLAN (detailed)
// 1. Provide a StorageFallback object with async methods: isLocalAvailable(), setItem(k,v), getItem(k), removeItem(k), clear(), syncAll()
// 2. isLocalAvailable:
//    - try set/remove a temp key in localStorage inside try/catch
//    - return boolean
// 3. Primary storage: localStorage (fast, synchronous).
//    - On any operation, try localStorage first inside try/catch.
//    - If it fails (quota, disabled, I/O), fall back to secondary storage.
// 4. Secondary storage: IndexedDB (async, persistent).
//    - Implement openDB() that returns a Promise<IDBDatabase>, create objectStore "kv" if needed.
//    - Implement idbSet/get/remove/clear functions using transactions and Promises.
// 5. Tertiary fallback: cookies (small values) for extreme cases.
//    - Implement cookieSet/get/remove for tiny items / bootstrap data.
// 6. On setItem:
//    - Try localStorage.setItem; if success also update IndexedDB (best-effort) for resilience.
//    - If localStorage fails, write to IndexedDB; if that fails, write to cookies.
// 7. On getItem:
//    - Try localStorage.getItem; if returned null/undefined -> check IndexedDB -> check cookies.
// 8. syncAll:
//    - If localStorage becomes available (e.g., after reboot/browser fixed), migrate items from IndexedDB -> localStorage.
// 9. Expose StorageFallback for usage. Keep code self-contained, safe (try/catch everywhere) and minimal dependencies.
// 10. Usage examples (commented) at bottom.

// Full implementation:
(() => {
  const StorageFallback = (() => {
    const IDB_DB_NAME = 'fallbackStorage_v1';
    const IDB_STORE_NAME = 'kv';

    // Cookie helpers (simple, not secure)
    function cookieSet(name, value, days = 365) {
      try {
        const v = encodeURIComponent(value);
        const d = new Date();
        d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `${name}=${v}; expires=${d.toUTCString()}; path=/`;
        return true;
      } catch (e) { return false; }
    }
    function cookieGet(name) {
      try {
        const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return m ? decodeURIComponent(m[2]) : null;
      } catch (e) { return null; }
    }
    function cookieRemove(name) {
      cookieSet(name, '', -1);
    }

    // Check localStorage availability
    function isLocalAvailable() {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return false;
        const TEST_KEY = '__storage_test__';
        window.localStorage.setItem(TEST_KEY, '1');
        window.localStorage.removeItem(TEST_KEY);
        return true;
      } catch (e) {
        return false;
      }
    }

    // IndexedDB helpers
    function openDB() {
      return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
          reject(new Error('IndexedDB not supported'));
          return;
        }
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = (ev) => {
          const db = ev.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Failed to open IDB'));
      });
    }

    function idbTx(storeMode, callback) {
      return openDB().then(db => new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(IDB_STORE_NAME, storeMode);
          const store = tx.objectStore(IDB_STORE_NAME);
          callback(store, resolve, reject);
          tx.oncomplete = () => { db.close(); };
          tx.onerror = () => { reject(tx.error || new Error('IDB tx error')); };
          tx.onabort = () => { reject(tx.error || new Error('IDB tx abort')); };
        } catch (err) {
          reject(err);
        }
      }));
    }

    function idbSet(key, value) {
      return idbTx('readwrite', (store, resolve, reject) => {
        const putReq = store.put({ key, value });
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error || new Error('IDB put failed'));
      });
    }

    function idbGet(key) {
      return idbTx('readonly', (store, resolve, reject) => {
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          const r = getReq.result;
          resolve(r ? r.value : null);
        };
        getReq.onerror = () => reject(getReq.error || new Error('IDB get failed'));
      });
    }

    function idbRemove(key) {
      return idbTx('readwrite', (store, resolve, reject) => {
        const delReq = store.delete(key);
        delReq.onsuccess = () => resolve(true);
        delReq.onerror = () => reject(delReq.error || new Error('IDB delete failed'));
      });
    }

    function idbClear() {
      return idbTx('readwrite', (store, resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onsuccess = () => resolve(true);
        clearReq.onerror = () => reject(clearReq.error || new Error('IDB clear failed'));
      });
    }

    // Public API
    return {
      isLocalAvailable,

      async setItem(key, value) {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        // Try localStorage first
        try {
          if (isLocalAvailable()) {
            window.localStorage.setItem(key, str);
            // Also best-effort write to IDB for resilience
            try { await idbSet(key, str); } catch (_) { /* ignore */ }
            return true;
          }
        } catch (e) {
          // fall through to IDB
        }
        // Try IndexedDB
        try {
          await idbSet(key, str);
          return true;
        } catch (e) {
          // fallback to cookie (small values)
          try {
            cookieSet(key, str, 365);
            return true;
          } catch (err) {
            return false;
          }
        }
      },

      async getItem(key) {
        try {
          if (isLocalAvailable()) {
            const v = window.localStorage.getItem(key);
            if (v !== null && v !== undefined) return v;
          }
        } catch (e) { /* continue to IDB */ }

        try {
          const v = await idbGet(key);
          if (v !== null && v !== undefined) return v;
        } catch (e) { /* continue to cookie */ }

        try {
          const v = cookieGet(key);
          return v;
        } catch (e) { return null; }
      },

      async removeItem(key) {
        try {
          if (isLocalAvailable()) {
            window.localStorage.removeItem(key);
          }
        } catch (e) { /* continue */ }
        try { await idbRemove(key); } catch (e) { /* continue */ }
        try { cookieRemove(key); } catch (e) { /* continue */ }
        return true;
      },

      async clear() {
        try {
          if (isLocalAvailable()) {
            window.localStorage.clear();
          }
        } catch (e) { /* continue */ }
        try { await idbClear(); } catch (e) { /* continue */ }
        // Clear cookies is left to caller if needed (can't enumerate reliably)
        return true;
      },

      // Try to migrate items from IDB to localStorage when localStorage becomes available
      async syncAll() {
        if (!isLocalAvailable()) return false;
        try {
          const db = await openDB();
          return await new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE_NAME, 'readonly');
            const store = tx.objectStore(IDB_STORE_NAME);
            const req = store.openCursor();
            req.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (cursor) {
                try {
                  window.localStorage.setItem(cursor.key, cursor.value.value);
                } catch (e) {
                  // If localStorage fails midway, stop and resolve false
                  resolve(false);
                  db.close();
                  return;
                }
                cursor.continue();
              } else {
                resolve(true);
                db.close();
              }
            };
            req.onerror = () => { resolve(false); db.close(); };
          });
        } catch (e) {
          return false;
        }
      }
    };
  })();

  // Expose to global
  if (typeof window !== 'undefined') {
    window.StorageFallback = StorageFallback;
  }

  // Usage examples (commented):
  // await window.StorageFallback.setItem('foo', { bar: 1 });
  // const v = await window.StorageFallback.getItem('foo'); // string -> JSON.parse if needed
  // await window.StorageFallback.syncAll();

})();