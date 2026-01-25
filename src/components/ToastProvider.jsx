import React, { createContext, useContext, useState, useCallback } from 'react';
import Icon from './Icon';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    }, []);

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const getStyles = (type) => {
        switch(type) {
            case 'success': return 'bg-green-900/90 border-green-500 text-green-100';
            case 'error': return 'bg-red-900/90 border-red-500 text-red-100';
            default: return 'bg-slate-800/90 border-slate-500 text-slate-100';
        }
    };

    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map(t => (
                    <div key={t.id} className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded shadow-lg border backdrop-blur-sm animate-in slide-in-from-right fade-in duration-300 ${getStyles(t.type)}`}>
                        <Icon name={t.type === 'success' ? 'check-circle' : t.type === 'error' ? 'alert-circle' : 'info'} size={18}/>
                        <span className="text-sm font-bold">{t.message}</span>
                        <button onClick={() => removeToast(t.id)} className="opacity-50 hover:opacity-100"><Icon name="x" size={14}/></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};