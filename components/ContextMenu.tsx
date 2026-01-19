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
}

export const ContextMenu = ({ x, y, speakers, getSpeakerName, onInsert, onClose, onNewSpeaker, onDragStart }: ContextMenuProps) => {
    return (
      <div className="context-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
        <div className="context-menu-handle" onMouseDown={onDragStart}>
          <span className="context-menu-title">Wstaw rozmówcę</span>
          <div className="context-menu-close" onClick={onClose} title="Zamknij"><CloseIcon /></div>
        </div>
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