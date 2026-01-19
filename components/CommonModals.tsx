import React from 'react';
import { TrashIcon, InfoIcon, CloseIcon } from './Icons';
import { HistoryItem } from '../types';

// --- MODAL USUWANIA ---
export const DeleteModal = ({ isOpen, onClose, onConfirm, title }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, title?: string }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop-high" onClick={onClose}>
      <div className="modal-box text-center" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon-wrapper icon-theme-danger"><TrashIcon /></div>
        <h3 className="modal-title-bold mb-2">Usunąć?</h3>
        <p className="modal-desc mb-6">
          Czy na pewno chcesz usunąć: <strong className="text-white">{title || "Element"}</strong>?
          <br />Tej operacji nie można cofnąć.
        </p>
        <div className="modal-actions-row">
          <button onClick={onClose} className="btn-modal-cancel">Anuluj</button>
          <button onClick={onConfirm} className="btn-modal-delete">Usuń</button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL INFO ---
export const InfoModal = ({ isOpen, title, message, onClose }: { isOpen: boolean, title: string, message: string, onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop-light" onClick={onClose}>
      <div className="modal-box space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon-wrapper icon-theme-neutral"><InfoIcon /></div>
        <div className="space-y-2">
            <h3 className="modal-title-sm">{title}</h3>
            <p className="modal-desc">{message}</p>
        </div>
        <div className="pt-2">
            <button onClick={onClose} className="btn-modal-ok">OK</button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DODAWANIA ROZMÓWCY ---
export const AddSpeakerModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (name: string) => void }) => {
    const [name, setName] = React.useState('');
    if (!isOpen) return null;
    
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-box text-left" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title-bold mb-4 text-center">Nowy Rozmówca</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Nazwa (Imię)</label>
              <input 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-xl focus:ring-1 focus:ring-white outline-none placeholder-gray-600"
                placeholder="np. Marek, Lektor, Gość..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { onConfirm(name); setName(''); } }}
              />
            </div>
          </div>
          <div className="modal-actions-row mt-6">
            <button onClick={onClose} className="btn-modal-cancel">Anuluj</button>
            <button onClick={() => { onConfirm(name); setName(''); }} className="btn-modal-ok">Dodaj</button>
          </div>
        </div>
      </div>
    );
};

// --- MODAL SCALANIA ---
export const MergeModal = ({ isOpen, onClose, onConfirm, speakers, getSpeakerName }: any) => {
    const [source, setSource] = React.useState('');
    const [target, setTarget] = React.useState('');

    if (!isOpen) return null;

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-box text-left" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title-bold mb-6 text-center">Scalanie rozmówców</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Kogo scalić? (Zniknie)</label>
              <select className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-xl focus:ring-1 focus:ring-white outline-none" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Wybierz...</option>
                {speakers.map((s: string) => s !== target && <option key={s} value={s}>{getSpeakerName(s) || s}</option>)}
              </select>
            </div>
            <div className="flex justify-center text-gray-500">↓</div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Z kim? (Pozostanie)</label>
              <select className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-xl focus:ring-1 focus:ring-white outline-none" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Wybierz...</option>
                {speakers.map((s: string) => s !== source && <option key={s} value={s}>{getSpeakerName(s) || s}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-actions-row mt-8">
            <button onClick={onClose} className="btn-modal-cancel">Anuluj</button>
            <button onClick={() => { onConfirm(source, target); setSource(''); setTarget(''); }} disabled={!source || !target} className="btn-modal-ok disabled:opacity-50">Scal</button>
          </div>
        </div>
      </div>
    );
};