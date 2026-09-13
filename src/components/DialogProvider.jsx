import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Icon from './Icon';

const DialogContext = createContext();

export const useDialog = () => {
    const context = useContext(DialogContext);
    if (!context) throw new Error("useDialog must be used within a DialogProvider");
    return context;
};

export const DialogProvider = ({ children }) => {
    const [dialogState, setDialogState] = useState({
        isOpen: false,
        type: 'alert', // 'alert', 'confirm', 'prompt'
        message: '',
        defaultValue: '',
        resolve: null,
    });
    const [promptValue, setPromptValue] = useState('');
    const inputRef = useRef(null);

    const openDialog = useCallback((type, message, defaultValue = '') => {
        return new Promise((resolve) => {
            setDialogState({ isOpen: true, type, message, defaultValue, resolve });
            setPromptValue(defaultValue);
        });
    }, []);

    const alert = useCallback((message) => openDialog('alert', message), [openDialog]);
    const confirm = useCallback((message) => openDialog('confirm', message), [openDialog]);
    const prompt = useCallback((message, defaultValue = '') => openDialog('prompt', message, defaultValue), [openDialog]);

    const handleClose = (value = null) => {
        if (dialogState.resolve) {
            dialogState.resolve(value);
        }
        setDialogState(prev => ({ ...prev, isOpen: false }));
    };

    const handleConfirm = () => {
        if (dialogState.type === 'prompt') {
            handleClose(promptValue);
        } else if (dialogState.type === 'confirm') {
            handleClose(true);
        } else {
            handleClose(true); // alert
        }
    };

    const handleCancel = () => {
        if (dialogState.type === 'confirm') handleClose(false);
        else handleClose(null); // prompt cancel returns null natively
    };

    // Auto-focus prompt input
    useEffect(() => {
        if (dialogState.isOpen && dialogState.type === 'prompt' && inputRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [dialogState.isOpen, dialogState.type]);

    return (
        <DialogContext.Provider value={{ alert, confirm, prompt }}>
            {children}
            {dialogState.isOpen && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                {dialogState.type === 'alert' && <Icon name="alert-circle" size={18} className="text-amber-500"/>}
                                {dialogState.type === 'confirm' && <Icon name="help-circle" size={18} className="text-indigo-400"/>}
                                {dialogState.type === 'prompt' && <Icon name="edit-3" size={18} className="text-emerald-400"/>}
                                {dialogState.type === 'alert' ? 'Attention' : dialogState.type === 'confirm' ? 'Confirm Action' : 'Input Required'}
                            </h3>
                            <button onClick={handleCancel} className="text-slate-400 hover:text-white transition-colors">
                                <Icon name="x" size={20}/>
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <p className="text-slate-200 text-sm mb-4 whitespace-pre-wrap">{dialogState.message}</p>
                            
                            {dialogState.type === 'prompt' && (
                                <input 
                                    ref={inputRef}
                                    type="text"
                                    value={promptValue}
                                    onChange={e => setPromptValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleConfirm();
                                        if (e.key === 'Escape') handleCancel();
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            )}
                        </div>

                        <div className="p-4 bg-slate-800 border-t border-slate-700 flex justify-end gap-3">
                            {dialogState.type !== 'alert' && (
                                <button 
                                    onClick={handleCancel}
                                    className="px-4 py-2 rounded font-bold text-sm bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                            <button 
                                onClick={handleConfirm}
                                className={`px-4 py-2 rounded font-bold text-sm text-white shadow-lg transition-colors ${
                                    dialogState.type === 'alert' ? 'bg-amber-600 hover:bg-amber-500' :
                                    dialogState.type === 'confirm' ? 'bg-indigo-600 hover:bg-indigo-500' :
                                    'bg-emerald-600 hover:bg-emerald-500'
                                }`}
                            >
                                {dialogState.type === 'alert' ? 'OK' : dialogState.type === 'confirm' ? 'Confirm' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};
