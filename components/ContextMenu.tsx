import React from 'react';
import { CloseIcon } from './Icons';

interface ContextMenuProps {
    x: number;
    y: number;
    speakers: string[];
    getSpeakerName: (key: string) => string;
    onInsert: (key: string) => void;
    onClose: () => void;
    onNewSpeaker: () => void;
    onDragStart: (e: React.MouseEvent) => void;
    // NOWE PROPSY
    selectedText?: string | null;
    onNewSpeakerFromSelection?: (name: string) => void;
}

export const ContextMenu = ({ 
  x, y, speakers, getSpeakerName, onInsert, onClose, onNewSpeaker, onDragStart, 
  selectedText, onNewSpeakerFromSelection 
}: ContextMenuProps) => {
    return (
      <div className="context-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
        <div className="context-menu-handle" onMouseDown={onDragStart}>
          <span className="context-menu-title">Wstaw rozmówcę</span>
          <div className="context-menu-close" onClick={onClose} title="Zamknij"><CloseIcon /></div>
        </div>
        
        {/* NOWA OPCJA: Utwórz z zaznaczenia */}
        {selectedText && onNewSpeakerFromSelection && (
            <div 
                onClick={() => onNewSpeakerFromSelection(selectedText)}
                className="px-4 py-2 hover:bg-white/10 cursor-pointer text-blue-300 font-bold border-b border-white/10 text-sm"
            >
            + Utwórz: "{selectedText.length > 20 ? selectedText.substring(0, 20) + '...' : selectedText}"
            </div>
        )}

        <div className="context-menu-content">
          {speakers.map((s) => (
            <button key={s} className="context-menu-item" onClick={() => onInsert(s)}>
                {getSpeakerName(s) || s}
            </button>
          ))}
          <button className="context-menu-item text-green-500 font-bold bg-gray-900/30 hover:bg-gray-900/50" onClick={() => { onClose(); onNewSpeaker(); }}>
            + Nowy rozmówca...
          </button>
        </div>
      </div>
    );
};