import React, { useEffect, useRef } from 'react';
import { CloseIcon } from './Icons'; 

// --- MODAL USUWANIA / POTWIERDZENIA ---
interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  header?: string;       // NOWE: Możliwość zmiany nagłówka (np. "Scalanie")
  confirmLabel?: string; // NOWE: Możliwość zmiany napisu na przycisku
  isLoading?: boolean;
}

export const DeleteModal = ({ isOpen, onClose, onConfirm, title, header, confirmLabel, isLoading }: DeleteModalProps) => {
  if (!isOpen) return null;

  const defaultHeader = "Usuń element";
  const defaultConfirm = "Usuń (Enter)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={!isLoading ? onClose : undefined}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CloseIcon />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{header || defaultHeader}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Czy na pewno chcesz wykonać akcję dla: <br/>
            {title ? <span className="font-bold text-gray-800 dark:text-gray-200">"{title}"</span> : "tego elementu"}?
            <br />Tej operacji nie można cofnąć.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={onClose} 
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Anuluj
          </button>
          <button 
            onClick={onConfirm} 
            disabled={isLoading}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center
              ${isLoading 
                ? 'bg-red-400 cursor-not-allowed' 
                : 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20'}`}
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"/>
                Przetwarzanie...
              </>
            ) : (
              confirmLabel || defaultConfirm
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL INFO ---
interface InfoModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export const InfoModal = ({ isOpen, title, message, onClose }: InfoModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        <button onClick={onClose} className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
          OK
        </button>
      </div>
    </div>
  );
};

// --- ADD SPEAKER MODAL ---
interface AddSpeakerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export const AddSpeakerModal = ({ isOpen, onClose, onConfirm }: AddSpeakerModalProps) => {
  const [name, setName] = React.useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 50); }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-full max-w-sm rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-white">Nowy rozmówca</h3>
        <input ref={inputRef} className="w-full p-3 bg-gray-100 dark:bg-black rounded-xl border border-gray-700 text-white outline-none focus:border-white" 
          placeholder="Imię..." value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm(name)} />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-400">Anuluj</button>
          <button onClick={() => onConfirm(name)} className="flex-1 py-2 rounded-xl bg-white text-black font-bold">Dodaj</button>
        </div>
      </div>
    </div>
  );
};