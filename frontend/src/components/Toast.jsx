import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, opts = {}) => {
    const id = ++idCounter;
    const ttl = opts.ttl ?? 3000;
    setToasts((prev) => [...prev, { id, message, type: opts.type ?? 'default' }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  }, []);

  const value = {
    show: push,
    success: (m) => push(m, { type: 'success' }),
    error: (m) => push(m, { type: 'error' }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// small hook: auto-dismiss errors from promises and surface them as toasts
export function useErrorToast() {
  const toast = useToast();
  return useCallback(
    async (promise, { loading, success } = {}) => {
      if (loading) toast.show(loading);
      try {
        const result = await promise;
        if (success) toast.success(success);
        return result;
      } catch (err) {
        toast.error(err.message || 'Something went wrong');
        throw err;
      }
    },
    [toast]
  );
}

// Auto-removes toasts on unmount
export function withToasts(Component) {
  return function Wrapped(props) {
    const toast = useToast();
    useEffect(() => () => {}, []); // noop, ensures provider is present
    return <Component {...props} toast={toast} />;
  };
}
