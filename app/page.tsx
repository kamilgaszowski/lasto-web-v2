"use client";

import { useState, useEffect, useRef } from 'react';
import './lasto.css';

// Importy Komponentów
import { RuneArrowLeft, RuneArrowRight, SettingsIcon, EditIcon, CheckIcon, CloseIcon, TrashIcon, IconCopy } from '../components/Icons';
import { DeleteModal, InfoModal, AddSpeakerModal, MergeModal } from '../components/CommonModals';
import { SettingsModal } from '../components/SettingsModal';
import { ContextMenu } from '../components/ContextMenu';

// Importy Typów i Logiki (z nowych plików)
import { HistoryItem } from '../types';
import { dbSave, dbGetAll, dbDelete, compressHistory, decompressHistory } from '../lib/storage';

export default function LastoWeb() {
  // --- STATE ---
  const [apiKey, setApiKey] = useState('');
  const [pantryId, setPantryId] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  
  // UI State
  const [status, setStatus] = useState('');
  const [uploadStatus, setUploadStatus] = useState(''); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isDragging, setIsDragging] = useState(false);
  
  // Modals State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isAddSpeakerModalOpen, setIsAddSpeakerModalOpen] = useState(false);
  
  // Data State
  const [itemToDelete, setItemToDelete] = useState<HistoryItem | null>(null);
  const [speakerToDelete, setSpeakerToDelete] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  
  // Context Menu & Drag
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; cursorIndex: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Button Feedback
  const [copyState, setCopyState] = useState(false);
  const [pobierzState, setPobierzState] = useState(false);

  const [settingsStartTab, setSettingsStartTab] = useState<'guide' | 'form'>('form');

  // --- INIT ---
  useEffect(() => {
    setApiKey(localStorage.getItem('assemblyAIKey') || '');
    setPantryId(localStorage.getItem('pantryId') || '');
    const initData = async () => {
        try {
            const items = await dbGetAll();
            const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(sorted);
        } catch (e) { console.error("Błąd bazy danych:", e); }
    };
    initData();
  }, []);

  // --- LOGIC: HELPERS ---
  const getAllSpeakers = () => {
    if (!selectedItem) return [];
    const fromTranscript = selectedItem.utterances?.map(u => u.speaker) || [];
    const fromNames = Object.keys(selectedItem.speakerNames || {});
    return Array.from(new Set([...fromTranscript, ...fromNames])).sort();
  };

  const getSpeakerName = (key: string): string => {
    if (selectedItem?.speakerNames && selectedItem.speakerNames[key]) return selectedItem.speakerNames[key];
    return "";
  };

  const getDisplayText = (item: HistoryItem) => {
    if (!item.utterances || item.utterances.length === 0) return item.content;
    
    const isJunk = (text: string, index: number) => {
        const badWords = ["prosimy", "poczekać", "połączenie", "kontynuować", "wkrótce", "rozmowę"];
        const lowerText = text.toLowerCase();
        if (index < 2) return badWords.some(word => lowerText.includes(word));
        return false;
    };

    return item.utterances.filter((u, index) => !isJunk(u.text, index)).map(u => {
        const speakerKey = (u.speaker === 'A' || u.speaker === '1') ? 'A' : 'B'; 
        const name = item.speakerNames?.[speakerKey] || item.speakerNames?.[u.speaker] || u.speaker;
        return `${name.toUpperCase()}:\n${u.text}\n`;
    }).join('\n');
  };

  // --- LOGIC: CLOUD SYNC (AUTO) ---
  
  // 1. Zapis w tle (Triggerowany zmianami)
  const triggerAutoSave = async () => {
    if (!pantryId) return;
    try {
        const compressed = compressHistory(history);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
            await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    [`chunk_${Math.floor(i/CHUNK_SIZE)}`]: compressed.slice(i, i + CHUNK_SIZE), 
                    manifest: { totalChunks: Math.ceil(compressed.length/CHUNK_SIZE), timestamp: Date.now() } 
                })
            });
        }
        console.log("Auto-save completed");
    } catch (e) { console.error("Auto-save failed:", e); }
  };

  // 2. Zapis natychmiastowy (Dla nowych plików z AI)
  const saveToCloudImmediately = async (dataToSave: HistoryItem[]) => {
    if (!pantryId) return;
    try {
        const compressed = compressHistory(dataToSave);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
            await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    [`chunk_${Math.floor(i/CHUNK_SIZE)}`]: compressed.slice(i, i + CHUNK_SIZE), 
                    manifest: { totalChunks: Math.ceil(compressed.length/CHUNK_SIZE), timestamp: Date.now() } 
                })
            });
        }
    } catch (e) { console.error("Cloud upload failed", e); }
  };

  const loadFromCloud = async () => {
    if (!pantryId) return;
    setIsProcessing(true);
    try {
        const res = await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, { method: 'GET' });
        if (!res.ok) throw new Error("Nie znaleziono danych.");
        const data = await res.json();
        let remoteCompressed: any[] = [];
        if (data.manifest) {
            for (let i = 0; i < data.manifest.totalChunks; i++) {
                if (data[`chunk_${i}`]) remoteCompressed = [...remoteCompressed, ...data[`chunk_${i}`]];
            }
        }
        if (remoteCompressed.length > 0) {
             const remoteHistory = decompressHistory(remoteCompressed);
             setHistory(prev => {
                const newItems = remoteHistory.filter(r => !prev.some(l => l.id === r.id));
                setPobierzState(true);
                setTimeout(() => setPobierzState(false), 2000);
                if (newItems.length === 0) return prev; 
                newItems.forEach(async (item) => await dbSave(item));
                return [...newItems, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            });
            setIsSettingsOpen(false);
        }
    } catch (e: any) { setInfoModal({ isOpen: true, title: 'Błąd', message: e.message }); }
    finally { setIsProcessing(false); }
  };

  // --- KEYS MANAGEMENT (EXPORT / IMPORT) ---
  
  const exportKeys = () => {
    const keys = { assemblyAIKey: apiKey, pantryId: pantryId };
    const blob = new Blob([JSON.stringify(keys, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `lasto_keys_backup.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importKeys = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (imported.assemblyAIKey || imported.pantryId) {
          if (imported.assemblyAIKey) { 
            setApiKey(imported.assemblyAIKey); 
            localStorage.setItem('assemblyAIKey', imported.assemblyAIKey); 
          }
          if (imported.pantryId) { 
            setPantryId(imported.pantryId); 
            localStorage.setItem('pantryId', imported.pantryId); 
          }
          setInfoModal({ isOpen: true, title: 'Sukces', message: 'Klucze zostały zaimportowane.' });
        } else {
            throw new Error("Brak kluczy w pliku");
        }
      } catch (err) { 
        setInfoModal({ isOpen: true, title: 'Błąd', message: 'Nieprawidłowy format pliku.' }); 
      }
    };
    reader.readAsText(file);
    // Reset inputa, żeby można było wgrać ten sam plik ponownie w razie potrzeby
    event.target.value = '';
  };

  // --- LOGIC: UPLOAD & AI (ASSEMBLY AI) ---

  const checkStatus = async (id: string, fileName: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { 
          headers: { 'Authorization': apiKey } 
        });
        if (!res.ok) return;
        const result = await res.json();

        if (result.status === 'completed') {
          clearInterval(interval);
          
          const uniqueId = `${id}-${Date.now()}`;

          const newItem: HistoryItem = {
            id: uniqueId, 
            title: fileName, 
            date: new Date().toISOString(), 
            content: result.text, 
            utterances: result.utterances, 
            speakerNames: { "A": "Rozmówca A", "B": "Rozmówca B" } 
          };
          
          await dbSave(newItem);

          setHistory(prev => {
             const exists = prev.some(item => item.id === uniqueId || item.id.startsWith(id));
             if (exists) return prev; 
             const updated = [newItem, ...prev];
             saveToCloudImmediately(updated); // Wysyłka od razu po sukcesie
             return updated;
          });

          setSelectedItem(newItem);
          setIsProcessing(false);
          setStatus('');
        } else if (result.status === 'error') { 
          clearInterval(interval); 
          setStatus('Błąd AI'); 
          setIsProcessing(false); 
        }
      } catch (err) { 
        clearInterval(interval); 
        setIsProcessing(false); 
      }
    }, 3000);
  };

  const processFile = async (file: File) => {
    if (!apiKey) return;
    setIsProcessing(true);
    setStatus('Wysyłanie...');
    try {
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', { method: 'POST', headers: { 'Authorization': apiKey }, body: file });
      const { upload_url } = await uploadRes.json();
      setStatus('Przetwarzanie AI...');
      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST', headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url, language_code: 'pl', speaker_labels: true })
      });
      const { id } = await transcriptRes.json();
      checkStatus(id, file.name);
    } catch (e) { setStatus('Błąd połączenia'); setTimeout(() => setIsProcessing(false), 3000); }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && apiKey) processFile(file);
  };

  // --- LOGIC: ACTIONS (TEXT, SPEAKERS) ---

  const handleTextChange = async (newText: string) => {
    if (!selectedItem) return;
    const updatedItem = { ...selectedItem, content: newText, utterances: [] };
    updateAndSave(updatedItem);
  };

  const updateAndSave = async (updatedItem: HistoryItem) => {
      setHistory(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
      setSelectedItem(updatedItem);
      await dbSave(updatedItem);
  };

  const handleSpeakerNameChange = async (speakerKey: string, newName: string) => {
    if (!selectedItem) return;
    const updatedItem = {
        ...selectedItem,
        speakerNames: { ...selectedItem.speakerNames, [speakerKey]: newName }
    };
    updateAndSave(updatedItem);
  };

  const handleAddSpeaker = (name: string) => {
    if (!selectedItem) return;
    const currentKeys = getAllSpeakers();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let newKey = "";
    for (let char of alphabet) {
      if (!currentKeys.includes(char)) { newKey = char; break; }
    }
    if (!newKey) newKey = `S${currentKeys.length + 1}`;
    handleSpeakerNameChange(newKey, name || newKey);
    setIsAddSpeakerModalOpen(false);
  };

  const executeMerge = async (source: string, target: string) => {
    if (!selectedItem) return;
    const newUtterances = selectedItem.utterances?.map(u => ({ ...u, speaker: u.speaker === source ? target : u.speaker })) || [];
    const newNames = { ...selectedItem.speakerNames };
    delete newNames[source]; 
    const updatedItem = { ...selectedItem, speakerNames: newNames, utterances: newUtterances };
    updateAndSave(updatedItem);
    setIsMergeModalOpen(false);
  };

  // --- LOGIC: EDITOR INSERT ---
  const insertSpeakerAtCursor = (speakerKey: string) => {
    if (!textareaRef.current || !selectedItem) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = getDisplayText(selectedItem!);
    const name = getSpeakerName(speakerKey) || speakerKey;
    const insertText = `\n${name.toUpperCase()}:\n`;
    const newText = currentText.substring(0, start) + insertText + currentText.substring(end);
    
    handleTextChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertText.length, start + insertText.length);
    }, 0);
  };

  // --- LOGIC: DELETION ---
  const executeDeleteFile = async () => {
    if (!itemToDelete) return;
    setIsProcessing(true);
    try {
        await dbDelete(itemToDelete);
        const updatedHistory = history.filter(item => item.id !== itemToDelete.id);
        setHistory(updatedHistory);
        if (selectedItem?.id === itemToDelete.id) setSelectedItem(null);
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
        triggerAutoSave(); // Sync po usunięciu
    } catch (e) { console.error(e); } 
    finally { setIsProcessing(false); }
  };

  const confirmSpeakerDeletion = async () => {
    if (!selectedItem || !speakerToDelete) return;
    const newNames = { ...selectedItem.speakerNames };
    delete newNames[speakerToDelete]; 
    const newUtterances = selectedItem.utterances?.filter(u => u.speaker !== speakerToDelete) || [];
    updateAndSave({ ...selectedItem, speakerNames: newNames, utterances: newUtterances });
    setSpeakerToDelete(null);
  };

  const executeDeleteAll = async () => {
    setHistory([]);
    setSelectedItem(null);
    setIsDeleteAllModalOpen(false);
    triggerAutoSave(); // Sync pustej listy
    setInfoModal({ isOpen: true, title: 'Gotowe', message: 'Wszystkie nagrania usunięte.' });
  };

  // --- CONTEXT MENU HANDLERS ---
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); 
    const textarea = e.target as HTMLTextAreaElement;
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, cursorIndex: textarea.selectionStart || 0 });
  };

  const startDrag = (e: React.MouseEvent) => {
     if (!contextMenu) return;
     e.preventDefault();
     dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: contextMenu.x, initialY: contextMenu.y };
     window.addEventListener('mousemove', handleDragMove);
     window.addEventListener('mouseup', stopDrag);
  };

  const handleDragMove = (e: MouseEvent) => {
      const dragData = dragRef.current;
      if (!dragData) return;
      const dx = e.clientX - dragData.startX;
      const dy = e.clientY - dragData.startY;
      setContextMenu(prev => prev ? { ...prev, x: dragData.initialX + dx, y: dragData.initialY + dy } : null);
  };

  const stopDrag = () => { dragRef.current = null; window.removeEventListener('mousemove', handleDragMove); window.removeEventListener('mouseup', stopDrag); };

  // --- RENDER ---
  return (
    <main className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans transition-colors duration-300">
      
      {/* SIDEBAR */}
      <div className={`lasto-sidebar ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <h2 onClick={() => { triggerAutoSave(); setIsSidebarOpen(false); }} className="text-2xl font-light tracking-tight cursor-pointer">Archiwum</h2>
            <button onClick={() => { triggerAutoSave(); setIsSidebarOpen(false); }} className="icon-button"><RuneArrowLeft /></button>
          </div>

          <div className="archive-list">
            {history.map((item) => (
              <div 
                key={item.id} 
                onClick={() => { 
                    triggerAutoSave(); 
                    setSelectedItem(item); 
                    if (window.innerWidth < 768) setIsSidebarOpen(false); 
                }} 
                className={`archive-item cursor-pointer ${selectedItem?.id === item.id ? 'archive-item-active' : ''}`}
              >
                <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); setIsDeleteModalOpen(true); }} className="archive-delete-btn"><CloseIcon /></button>
                <div className="archive-item-title">{item.title || "Bez tytułu"}</div>
                <div className="archive-item-date">{new Date(item.date).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>

          <div className="sidebar-footer flex gap-2">
              <button 
                onClick={loadFromCloud} 
                disabled={!pantryId || isProcessing} 
                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${pobierzState ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-gray-800 text-gray-500 hover:text-white hover:border-gray-600'}`}
              >
                <span>{pobierzState ? 'Pobrano' : 'Pobierz'}</span>
              </button>
              
              {history.length > 0 && (
                <button onClick={() => setIsDeleteAllModalOpen(true)} className="btn-clear-archive flex-shrink-0" title="Wyczyść archiwum">
                    <TrashIcon />
                </button>
              )}
          </div>
        </div>
      </div>

      {/* MAIN PANEL */}
      <div className={`lasto-main-panel ${isSidebarOpen ? 'md:ml-80 ml-0' : 'ml-0'}`}>
        <div className="top-bar">
          <div className="top-bar-left">
            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="icon-button"><RuneArrowRight /></button>}
            
            {selectedItem && (
                <button onClick={() => { triggerAutoSave(); setSelectedItem(null); }} className="btn-logo">Lasto</button>
            )}
          </div>
          
          <button onClick={() => { triggerAutoSave(); setIsSettingsOpen(true); }} className="settings-trigger"><SettingsIcon /></button>
        </div>

        <div className="workspace-area">
          {!selectedItem ? (
            <div className="hero-container">
              <div className="hero-content">
                <div className="hero-title">Lasto</div>
                <div className="hero-subtitle"><span>Słuchaj</span> <span className="rune-divider">ᛟ</span> <span>Nagraj</span> <span className="rune-divider">ᛟ</span> <span>Pisz</span></div>
              </div>
              <div className="import-zone">
                {isProcessing ? (
                  <div className="flex flex-col items-center space-y-3"><div className="loader-spin" /><span className="loader-text">{uploadStatus || status || 'Przetwarzanie...'}</span></div>
              ) : !apiKey ? (
                  <button 
                    onClick={() => { 
                      setSettingsStartTab('guide'); // <-- Otwórz na Przewodniku
                      setIsSettingsOpen(true); 
                    }} 
                    className="btn-primary"
                  >
                    Dodaj pierwsze nagranie
                  </button>
                ) : (
                  <>
                    <label onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`btn-import ${isDragging ? 'import-dragging' : ''}`}>
                      {isDragging ? 'Upuść tutaj!' : 'Importuj nagranie'}
                      <input type="file" className="hidden" accept="audio/*" onChange={handleFileInput} />
                    </label>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="editor-container">
              <div className="editor-header">
                {isEditingTitle ? (
                  <div className="title-view-mode">
                    <input className="title-input" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)} autoFocus />
                    <button onClick={() => setIsEditingTitle(false)} className="ml-4 text-green-600 p-2"><CheckIcon /></button>
                  </div>
                ) : (
                  <div className="title-view-mode">
                    <button onClick={() => { setItemToDelete(selectedItem); setIsDeleteModalOpen(true); }} className="mr-4 text-gray-400 hover:text-red-500 p-2"><TrashIcon /></button>
                    <div className="title-clickable" onClick={() => { setEditedTitle(selectedItem.title); setIsEditingTitle(true); }}>
                      <h1 className="title-text">{selectedItem.title}</h1>
                      <span className="edit-indicator"><EditIcon /></span>
                    </div>
                  </div>
                )}
              </div>

              {/* LISTA ROZMÓWCÓW */}
              <div className="speaker-list">
                {getAllSpeakers().map((key) => (
                  <div key={key} className="speaker-badge">
                    <button onClick={() => insertSpeakerAtCursor(key)} className="speaker-action-btn btn-insert" title="Wstaw">+</button>
                    <input className="speaker-input" value={getSpeakerName(key) || key} onChange={(e) => handleSpeakerNameChange(key, e.target.value)} placeholder="Nazwa..." />
                    <button onClick={() => setSpeakerToDelete(key)} className="speaker-action-btn btn-delete"><CloseIcon /></button>
                  </div>
                ))}
                <button onClick={() => setIsAddSpeakerModalOpen(true)} className="btn-add-speaker mr-2">Nowy</button>
                {getAllSpeakers().length > 1 && <button onClick={() => setIsMergeModalOpen(true)} className="btn-add-speaker">Scal rozmówców</button>}
              </div>

              {/* EDITOR */}
              <div className="relative flex-1 w-full min-h-0">
                <textarea ref={textareaRef} className="w-full h-full p-8 bg-gray-100/40 dark:bg-gray-900/40 pb-24 dark:text-gray-200 rounded-2xl font-mono text-sm leading-relaxed border-none focus:ring-0 resize-none outline-none"
                  value={getDisplayText(selectedItem)} onChange={(e) => handleTextChange(e.target.value)} onContextMenu={handleContextMenu} />
                <button onClick={() => { navigator.clipboard.writeText(getDisplayText(selectedItem)); setCopyState(true); setTimeout(() => setCopyState(false), 2000); }} 
                  className={`absolute top-4 right-4 p-2 rounded-lg transition-all ${copyState ? 'text-green-500' : 'text-gray-400'}`}>{copyState ? <CheckIcon /> : <IconCopy />}</button>
              </div>
              {/* MOBILE TOOLBAR - Widoczny tylko na ekranach mniejszych niż md (768px) */}
              <div className="mobile-toolbar md:hidden">
                {getAllSpeakers().map((key) => (
                  <button 
                    key={key}
                    onClick={(e) => {
                      e.preventDefault(); // Żeby nie tracić focusu z klawiatury (opcjonalne, ale pomocne)
                      insertSpeakerAtCursor(key);
                    }}
                    className="mobile-toolbar-btn"
                  >
                    {getSpeakerName(key) || key}
                  </button>
                ))}
                
                <button 
                  onClick={() => setIsAddSpeakerModalOpen(true)} 
                  className="mobile-toolbar-add"
                  title="Nowy rozmówca"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODALE */}
<SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        apiKey={apiKey} 
        setApiKey={setApiKey} 
        pantryId={pantryId} 
        setPantryId={setPantryId} 
        // TUTAJ BYŁY PUSTE FUNKCJE - TERAZ SĄ PODPIĘTE:
        exportKeys={exportKeys} 
        importKeys={importKeys} 
        initialTab={settingsStartTab}
      />   
      <DeleteModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={executeDeleteFile} title={itemToDelete?.title} />
      <DeleteModal isOpen={!!speakerToDelete} onClose={() => setSpeakerToDelete(null)} onConfirm={confirmSpeakerDeletion} title={speakerToDelete ? getSpeakerName(speakerToDelete) || speakerToDelete : ""} />
      <DeleteModal isOpen={isDeleteAllModalOpen} onClose={() => setIsDeleteAllModalOpen(false)} onConfirm={executeDeleteAll} title="WSZYSTKO" />
      <InfoModal isOpen={infoModal.isOpen} title={infoModal.title} message={infoModal.message} onClose={() => setInfoModal({ ...infoModal, isOpen: false })} />
      <MergeModal isOpen={isMergeModalOpen} onClose={() => setIsMergeModalOpen(false)} onConfirm={executeMerge} speakers={getAllSpeakers()} getSpeakerName={getSpeakerName} />
      <AddSpeakerModal isOpen={isAddSpeakerModalOpen} onClose={() => setIsAddSpeakerModalOpen(false)} onConfirm={handleAddSpeaker} />
      
      {contextMenu && contextMenu.visible && (
        <ContextMenu 
            x={contextMenu.x} 
            y={contextMenu.y} 
            speakers={getAllSpeakers()} 
            getSpeakerName={getSpeakerName} 
            onInsert={(key) => insertSpeakerAtCursor(key)} 
            onClose={() => setContextMenu(null)} 
            onNewSpeaker={() => setIsAddSpeakerModalOpen(true)} 
            onDragStart={startDrag} 
        />
      )}
    </main>
  );
}