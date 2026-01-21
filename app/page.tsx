"use client";

import { useState, useEffect, useRef } from 'react';
import './lasto.css';

// Importy Komponentów
import { RuneArrowLeft, RuneArrowRight, SettingsIcon, EditIcon, CheckIcon, CloseIcon, TrashIcon, IconCopy } from '../components/Icons';
import { DeleteModal, InfoModal, AddSpeakerModal, MergeModal } from '../components/CommonModals';
import { SettingsModal } from '../components/SettingsModal';
import { ContextMenu } from '../components/ContextMenu';

// Importy Typów i Logiki
import { HistoryItem } from '../types';
import { dbSave, dbGetAll, dbDelete } from '../lib/storage'; // USUNĄŁEM IMPORT compressHistory/decompressHistory bo są wadliwe

export default function LastoWeb() {
  // --- STATE ---
  const [apiKey, setApiKey] = useState('');
  const [pantryId, setPantryId] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  
  // Refy
  const selectedItemRef = useRef<HistoryItem | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestTextRef = useRef<string>(''); 
  const isUserTypingRef = useRef<boolean>(false); 
  
  // UI State
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [status, setStatus] = useState('');
  const [uploadStatus, setUploadStatus] = useState(''); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isDragging, setIsDragging] = useState(false);
  
  // Modals & Feedback
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isAddSpeakerModalOpen, setIsAddSpeakerModalOpen] = useState(false);
  
  const [itemToDelete, setItemToDelete] = useState<HistoryItem | null>(null);
  const [speakerToDelete, setSpeakerToDelete] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [copyState, setCopyState] = useState(false);
  const [pobierzState, setPobierzState] = useState(false);
  const [settingsStartTab, setSettingsStartTab] = useState<'guide' | 'form'>('form');

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; cursorIndex: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- POPRAWIONA KOMPRESJA DANYCH (LOCAL) ---
  // To naprawia błąd pustego textarea: dodajemy pole 'c' (content)
  const localCompressHistory = (historyData: HistoryItem[]) => {
    return historyData.map(item => ({
        id: item.id,
        ti: item.title,
        da: item.date,
        sn: item.speakerNames,
        c: item.content, // <--- TO JEST KLUCZOWE! Zapisujemy treść edytowaną
        u: item.utterances?.map(u => ({ s: u.speaker, t: u.text })) || []
    }));
  };

  const localDecompressHistory = (compressed: any[]): HistoryItem[] => {
    return compressed.map(item => {
        const utterances = item.u?.map((u: any) => ({ speaker: u.s, text: u.t })) || [];
        // Jeśli jest 'c' (zapisana edycja), użyj jej. Jeśli nie, spróbuj złożyć z transkrypcji.
        const content = item.c || utterances.map((u: any) => u.text).join('\n');
        
        return {
            id: item.id,
            title: item.ti,
            date: item.da,
            content: content,
            utterances: utterances,
            speakerNames: item.sn
        };
    });
  };

  // --- REFS SYNC ---
  useEffect(() => {
    selectedItemRef.current = selectedItem;
    if (selectedItem && !isUserTypingRef.current) {
        latestTextRef.current = getDisplayText(selectedItem);
    }
  }, [selectedItem]);

  // --- INIT ---
  useEffect(() => {
    setApiKey(localStorage.getItem('assemblyAIKey') || '');
    const savedPantryId = localStorage.getItem('pantryId') || '';
    setPantryId(savedPantryId);

    const initData = async () => {
        try {
            const items = await dbGetAll();
            const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(sorted);
            if (savedPantryId) loadFromCloud(true);
        } catch (e) { console.error("Błąd bazy danych:", e); }
    };
    initData();
  }, []); 

  // --- POLLING ---
  useEffect(() => {
    if (!pantryId) return;
    const interval = setInterval(() => {
        if (!isEditingTitle && !isUserTypingRef.current && cloudStatus !== 'saving') {
            loadFromCloud(true);
        }
    }, 60000); 
    return () => clearInterval(interval);
  }, [pantryId, isEditingTitle, cloudStatus]);

  useEffect(() => {
    const handleClickOutside = () => { if (contextMenu) setContextMenu(null); };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  // --- HELPERS ---
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
    if (!item.utterances || item.utterances.length === 0) {
        return item.content || "";
    }
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

  // --- SYNC ENGINE ---
  const triggerAutoSave = async (overrideHistory?: HistoryItem[]) => {
    const cleanId = pantryId?.trim();
    if (!cleanId) return;

    setCloudStatus('saving'); 
    const dataToSave = overrideHistory || history;

    try {
        // UŻYWAMY POPRAWIONEJ LOKALNEJ KOMPRESJI
        const compressed = localCompressHistory(dataToSave);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
            const response = await fetch('/api/pantry', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: cleanId,
                    data: {
                        [`chunk_${Math.floor(i/CHUNK_SIZE)}`]: compressed.slice(i, i + CHUNK_SIZE), 
                        manifest: { totalChunks: Math.ceil(compressed.length/CHUNK_SIZE), timestamp: Date.now() } 
                    }
                })
            });
            if (!response.ok && response.status !== 429) throw new Error(response.statusText);
        }
        setCloudStatus('saved'); 
        setTimeout(() => setCloudStatus('idle'), 3000); 
    } catch (e) { 
        console.warn("Auto-save skipped:", e); 
        setCloudStatus('error');
    }
  };

  const saveToCloudImmediately = async (dataToSave: HistoryItem[]) => {
    const cleanId = pantryId?.trim();
    if (!cleanId) return;
    try {
        const compressed = localCompressHistory(dataToSave);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
            await fetch('/api/pantry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: cleanId,
                    data: {
                        [`chunk_${Math.floor(i/CHUNK_SIZE)}`]: compressed.slice(i, i + CHUNK_SIZE), 
                        manifest: { totalChunks: Math.ceil(compressed.length/CHUNK_SIZE), timestamp: Date.now() } 
                    }
                })
            });
        }
    } catch (e) { console.error("Cloud upload failed", e); }
  };

  const loadFromCloud = async (isSilent = false) => {
    if (isUserTypingRef.current) return;

    const cleanId = pantryId?.trim();
    if (!cleanId) {
        if (!isSilent) setInfoModal({ isOpen: true, title: 'Brak ID', message: 'Wpisz Pantry ID w ustawieniach.' });
        return;
    }
    
    if (!isSilent) setIsProcessing(true);
    
    try {
        const res = await fetch(`/api/pantry?id=${cleanId}&t=${Date.now()}`, { 
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });
        
        if (res.status === 429) {
            if (!isSilent) setInfoModal({ isOpen: true, title: 'Zwolnij', message: 'Za dużo zapytań. Odczekaj chwilę.' });
            setIsProcessing(false);
            return; 
        }

        if (res.status === 404) {
             if (!isSilent) setInfoModal({ isOpen: true, title: 'Info', message: 'Chmura jest pusta.' });
             setIsProcessing(false);
             return;
        }

        if (!res.ok) throw new Error(`Błąd: ${res.status}`);
        
        const data = await res.json();
        let remoteCompressed: any[] = [];

        if (data.manifest && data.manifest.totalChunks) {
            for (let i = 0; i < data.manifest.totalChunks; i++) {
                if (data[`chunk_${i}`]) remoteCompressed = [...remoteCompressed, ...data[`chunk_${i}`]];
            }
        }
        else if (Array.isArray(data)) { remoteCompressed = data; }
        else if (data.history && Array.isArray(data.history)) { remoteCompressed = data.history; }

        if (remoteCompressed.length > 0) {
             // UŻYWAMY POPRAWIONEJ LOKALNEJ DEKOMPRESJI
             const remoteHistory = localDecompressHistory(remoteCompressed);
             
             setHistory(prev => {
                if (isUserTypingRef.current) return prev;

                const localMap = new Map(prev.map(item => [item.id, item]));
                let updatesCount = 0;
                let newCount = 0;
                
                const currentOpenItem = selectedItemRef.current;

                remoteHistory.forEach(remoteItem => {
                    const localItem = localMap.get(remoteItem.id);

                    if (!localItem) {
                        localMap.set(remoteItem.id, remoteItem);
                        newCount++;
                        dbSave(remoteItem);
                    } else {
                        const remoteDate = new Date(remoteItem.date).getTime();
                        const localDate = new Date(localItem.date).getTime();

                        if (remoteDate > localDate) {
                            localMap.set(remoteItem.id, remoteItem);
                            updatesCount++;
                            dbSave(remoteItem);
                            if (currentOpenItem?.id === remoteItem.id) setSelectedItem(remoteItem);
                        }
                    }
                });

                if (!isSilent) {
                    if (newCount > 0 || updatesCount > 0) {
                        setInfoModal({ isOpen: true, title: 'Sukces', message: `Pobrano: ${newCount}, Zaktualizowano: ${updatesCount}` });
                    } else {
                        setInfoModal({ isOpen: true, title: 'Aktualne', message: 'Wszystko aktualne.' });
                    }
                }
                
                if (newCount > 0 || updatesCount > 0) {
                     setPobierzState(true);
                     setTimeout(() => setPobierzState(false), 2000);
                }

                return Array.from(localMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            });
            setIsSettingsOpen(false);
        } else {
            if (!isSilent) setInfoModal({ isOpen: true, title: 'Pusto', message: 'Brak danych w chmurze.' });
        }
    } catch (e: any) { 
        console.error(e);
        if (!isSilent) setInfoModal({ isOpen: true, title: 'Błąd', message: e.message }); 
    }
    finally { setIsProcessing(false); }
  };

  // --- ACTIONS: ZAPIS TEKSTU ---
  
  const performSaveText = (itemId: string, textToSave: string) => {
      setHistory(currentHistory => {
          const itemIndex = currentHistory.findIndex(i => i.id === itemId);
          if (itemIndex === -1) return currentHistory;

          const existingItem = currentHistory[itemIndex];
          
          const finalItemToSave = { 
              ...existingItem, 
              content: textToSave, 
              utterances: [], // Czyścimy transkrypcję
              date: new Date().toISOString()
          };

          const newHistory = [...currentHistory];
          newHistory[itemIndex] = finalItemToSave;
          const sortedHistory = newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          triggerAutoSave(sortedHistory);
          dbSave(finalItemToSave);

          if (selectedItemRef.current?.id === itemId) {
              setSelectedItem(finalItemToSave);
          }
          
          isUserTypingRef.current = false;
          return sortedHistory;
      });
  };

  const handleTextChange = async (newText: string) => {
    if (!selectedItem) return;
    
    isUserTypingRef.current = true;
    const editingId = selectedItem.id;

    // Szybki update lokalny
    const updatedItem = { 
        ...selectedItem, 
        content: newText, 
        utterances: [], 
        date: new Date().toISOString() 
    };

    setSelectedItem(updatedItem);
    setHistory(prev => prev.map(item => item.id === editingId ? updatedItem : item));
    await dbSave(updatedItem);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setCloudStatus('saving');

    saveTimeoutRef.current = setTimeout(() => {
        performSaveText(editingId, newText);
    }, 2000); 
  };

  const handleTextBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (selectedItem) {
          performSaveText(selectedItem.id, e.target.value);
      }
  };

  // --- KEYS MANAGEMENT ---
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
          if (imported.assemblyAIKey) { setApiKey(imported.assemblyAIKey); localStorage.setItem('assemblyAIKey', imported.assemblyAIKey); }
          if (imported.pantryId) { setPantryId(imported.pantryId); localStorage.setItem('pantryId', imported.pantryId); setTimeout(() => loadFromCloud(false), 500); }
          setInfoModal({ isOpen: true, title: 'Sukces', message: 'Klucze zaimportowane.' });
        } else { throw new Error("Brak kluczy"); }
      } catch (err) { setInfoModal({ isOpen: true, title: 'Błąd', message: 'Zły format pliku.' }); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // --- UPLOAD & AI ---
  const checkStatus = async (id: string, fileName: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers: { 'Authorization': apiKey } });
        if (!res.ok) return;
        const result = await res.json();
        if (result.status === 'completed') {
          clearInterval(interval);
          const uniqueId = `${id}-${Date.now()}`;
          const newItem: HistoryItem = { id: uniqueId, title: fileName, date: new Date().toISOString(), content: result.text, utterances: result.utterances, speakerNames: { "A": "Rozmówca A", "B": "Rozmówca B" } };
          await dbSave(newItem);
          setHistory(prev => {
             const exists = prev.some(item => item.id === uniqueId || item.id.startsWith(id));
             if (exists) return prev; 
             const updated = [newItem, ...prev];
             saveToCloudImmediately(updated);
             return updated;
          });
          setSelectedItem(newItem);
          setIsProcessing(false);
          setStatus('');
        } else if (result.status === 'error') { clearInterval(interval); setStatus('Błąd AI'); setIsProcessing(false); }
      } catch (err) { clearInterval(interval); setIsProcessing(false); }
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
    event.preventDefault(); setIsDragging(false);
    const file = event.dataTransfer.files?.[0]; if (file && apiKey) processFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isSettingsOpen || selectedItem) return;
      if (e.clipboardData && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('audio/')) { e.preventDefault(); processFile(file); } 
        else { setInfoModal({ isOpen: true, title: 'Błąd', message: 'To nie audio.' }); }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isSettingsOpen, selectedItem, apiKey]);

  const updateAndSave = async (updatedItem: HistoryItem) => {
      const itemWithNewDate = { ...updatedItem, date: new Date().toISOString() };
      setHistory(prev => {
          const newHistory = prev.map(item => item.id === itemWithNewDate.id ? itemWithNewDate : item);
          const sorted = newHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          triggerAutoSave(sorted); 
          return sorted;
      });
      setSelectedItem(itemWithNewDate);
      await dbSave(itemWithNewDate);
  };

  const saveNewTitle = async () => {
    if (!selectedItem) { setIsEditingTitle(false); return; }
    const finalTitle = editedTitle.trim() || selectedItem.title; 
    const updatedItem = { ...selectedItem, title: finalTitle };
    await updateAndSave(updatedItem);
    setIsEditingTitle(false);
  };

  const handleSpeakerNameChange = async (speakerKey: string, newName: string) => {
    if (!selectedItem) return;
    const updatedItem = { ...selectedItem, speakerNames: { ...selectedItem.speakerNames, [speakerKey]: newName } };
    await updateAndSave(updatedItem);
  };

  const handleAddSpeaker = (name: string) => {
    if (!selectedItem) return;
    const currentKeys = getAllSpeakers();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let newKey = "";
    for (let char of alphabet) { if (!currentKeys.includes(char)) { newKey = char; break; } }
    if (!newKey) newKey = `S${currentKeys.length + 1}`;
    handleSpeakerNameChange(newKey, name || newKey);
    setIsAddSpeakerModalOpen(false);
  };

  const handleDeleteSpeakerClick = (speakerKey: string) => { setSpeakerToDelete(speakerKey); };

  const executeMerge = async (source: string, target: string) => {
    if (!selectedItem) return;
    const newUtterances = selectedItem.utterances?.map(u => ({ ...u, speaker: u.speaker === source ? target : u.speaker })) || [];
    const newNames = { ...selectedItem.speakerNames }; delete newNames[source]; 
    const updatedItem = { ...selectedItem, speakerNames: newNames, utterances: newUtterances };
    await updateAndSave(updatedItem);
    setIsMergeModalOpen(false);
  };

  const insertSpeakerAtCursor = (speakerKey: string) => {
    if (!textareaRef.current || !selectedItem) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart; const end = textarea.selectionEnd;
    const currentText = getDisplayText(selectedItem!);
    const name = getSpeakerName(speakerKey) || speakerKey;
    const insertText = `\n${name.toUpperCase()}:\n`;
    const newText = currentText.substring(0, start) + insertText + currentText.substring(end);
    
    // Zapis natychmiastowy
    const updatedItem = { ...selectedItem, content: newText, utterances: [] };
    updateAndSave(updatedItem);
    
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + insertText.length, start + insertText.length); }, 0);
  };

  const executeDeleteFile = async () => {
    if (!itemToDelete) return; setIsProcessing(true);
    try {
        await dbDelete(itemToDelete);
        const updatedHistory = history.filter(item => item.id !== itemToDelete.id);
        setHistory(updatedHistory);
        triggerAutoSave(updatedHistory); 
        if (selectedItem?.id === itemToDelete.id) setSelectedItem(null);
        setIsDeleteModalOpen(false); setItemToDelete(null);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const confirmSpeakerDeletion = async () => {
    if (!selectedItem || !speakerToDelete) return;
    const newNames = { ...selectedItem.speakerNames }; delete newNames[speakerToDelete]; 
    const newUtterances = selectedItem.utterances?.filter(u => u.speaker !== speakerToDelete) || [];
    await updateAndSave({ ...selectedItem, speakerNames: newNames, utterances: newUtterances });
    setSpeakerToDelete(null);
  };

  const executeDeleteAll = async () => {
    setHistory([]); setSelectedItem(null); setIsDeleteAllModalOpen(false); triggerAutoSave([]); 
    setInfoModal({ isOpen: true, title: 'Gotowe', message: 'Usunięto wszystko.' });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); 
    const textarea = e.target as HTMLTextAreaElement;
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, cursorIndex: textarea.selectionStart || 0 });
  };
  const startDrag = (e: React.MouseEvent) => {
     if (!contextMenu) return; e.preventDefault(); e.stopPropagation();
     dragRef.current = { startX: e.clientX, startY: e.clientY, initialX: contextMenu.x, initialY: contextMenu.y };
     window.addEventListener('mousemove', handleDragMove); window.addEventListener('mouseup', stopDrag);
  };
  const handleDragMove = (e: MouseEvent) => {
      const dragData = dragRef.current; if (!dragData) return;
      const dx = e.clientX - dragData.startX; const dy = e.clientY - dragData.startY;
      setContextMenu(prev => prev ? { ...prev, x: dragData.initialX + dx, y: dragData.initialY + dy } : null);
  };
  const stopDrag = () => { dragRef.current = null; window.removeEventListener('mousemove', handleDragMove); window.removeEventListener('mouseup', stopDrag); };

  // --- RENDER ---
  return (
    <main className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans transition-colors duration-300">
      <div className={`lasto-sidebar ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <h2 onClick={() => { setIsSidebarOpen(false); }} className="text-2xl font-light tracking-tight cursor-pointer">Archiwum</h2>
            <button onClick={() => { setIsSidebarOpen(false); }} className="icon-button"><RuneArrowLeft /></button>
          </div>
          <div className="archive-list">
            {history.map((item) => (
              <div key={item.id} onClick={() => { setSelectedItem(item); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`archive-item cursor-pointer ${selectedItem?.id === item.id ? 'archive-item-active' : ''}`}>
                <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); setIsDeleteModalOpen(true); }} className="archive-delete-btn"><CloseIcon /></button>
                <div className="archive-item-title">{item.title || "Bez tytułu"}</div>
                <div className="archive-item-date">{new Date(item.date).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
          <div className="sidebar-footer flex gap-2">
              <button onClick={() => loadFromCloud(false)} disabled={!pantryId || isProcessing} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${pobierzState ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-gray-800 text-gray-500 hover:text-white hover:border-gray-600'}`}>
                <span>{pobierzState ? 'Pobrano' : 'Pobierz'}</span>
              </button>
              {history.length > 0 && <button onClick={() => setIsDeleteAllModalOpen(true)} className="btn-clear-archive flex-shrink-0" title="Wyczyść archiwum"><TrashIcon /></button>}
          </div>
        </div>
      </div>
      <div className={`lasto-main-panel ${isSidebarOpen ? 'md:ml-80 ml-0' : 'ml-0'}`}>
        <div className="top-bar">
          <div className="top-bar-left">
            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="icon-button"><RuneArrowRight /></button>}
            {selectedItem && <button onClick={() => { setSelectedItem(null); }} className="btn-logo">Lasto</button>}
          </div>
          <button onClick={() => { setIsSettingsOpen(true); }} className="settings-trigger"><SettingsIcon /></button>
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
                  <button onClick={() => { setSettingsStartTab('guide'); setIsSettingsOpen(true); }} className="btn-primary">Dodaj pierwsze nagranie</button>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-4">
                      <label onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`btn-import ${isDragging ? 'import-dragging' : ''}`}>
                        {isDragging ? 'Upuść tutaj!' : 'Wybierz lub nagraj'}
                        <input type="file" className="hidden" accept="audio/*" onChange={handleFileInput} />
                      </label>
                    </div>
                    <p className="format-hint mt-4 text-[10px] text-gray-500 text-center leading-relaxed opacity-60">PC: Przeciągnij plik tutaj<br/>iOS: Dyktafon → Udostępnij → Zachowaj w plikach</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="editor-container">
              <div className="flex items-center justify-between pb-6 border-b border-gray-800/50 mb-6">
                {isEditingTitle ? (
                  <div className="flex items-center w-full min-w-0">
                    <input className="bg-transparent text-xl md:text-2xl font-light text-white tracking-wide border-b border-gray-600 focus:border-white outline-none w-full p-0 m-0" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNewTitle()} onBlur={saveNewTitle} autoFocus />
                    <button onClick={saveNewTitle} className="ml-4 text-green-600 p-2"><CheckIcon /></button>
                  </div>
                ) : (
                  <div className="flex items-center w-full min-w-0">
                    <button onClick={() => { setItemToDelete(selectedItem); setIsDeleteModalOpen(true); }} className="mr-4 text-gray-400 hover:text-red-500 p-2 transition-colors flex-shrink-0"><TrashIcon /></button>
                    <div className="flex items-center gap-3 cursor-pointer hover:text-gray-300 transition-colors min-w-0 overflow-hidden" onClick={() => { setEditedTitle(selectedItem.title || ""); setIsEditingTitle(true); }}>
                      <h1 className="text-xl md:text-2xl font-light text-white tracking-wide truncate">{selectedItem.title || "Bez tytułu"}</h1>
                      {cloudStatus === 'saving' && <span className="ml-3 text-[10px] text-gray-500 animate-pulse uppercase tracking-wider">Zapisywanie...</span>}
                      {cloudStatus === 'saved' && <span className="ml-3 text-[10px] text-green-500 uppercase tracking-wider">Zapisano</span>}
                      {cloudStatus === 'error' && <span className="ml-3 text-[10px] text-red-500 uppercase tracking-wider">Błąd zapisu</span>}
                      <span className="opacity-50 text-sm flex-shrink-0 ml-2"><EditIcon /></span>
                    </div>
                  </div>
                )}
              </div>
            <div className="speaker-list">
              {getAllSpeakers().map((speakerKey) => {
                const displayValue = selectedItem?.speakerNames?.[speakerKey] !== undefined ? selectedItem.speakerNames[speakerKey] : speakerKey;
                return (
                  <div key={speakerKey} className="speaker-badge">
                    <button onMouseDown={(e) => { e.preventDefault(); insertSpeakerAtCursor(speakerKey); }} className="speaker-action-btn btn-insert" title="Wstaw do tekstu">+</button>
                    <input className="speaker-input" value={displayValue} onChange={(e) => handleSpeakerNameChange(speakerKey, e.target.value)} placeholder="Nazwa..." />
                    <button onClick={() => handleDeleteSpeakerClick(speakerKey)} className="speaker-action-btn btn-delete" title="Usuń rozmówcę"><CloseIcon /></button>
                  </div>
                );
              })}
             <button onClick={() => setIsAddSpeakerModalOpen(true)} className="btn-add-speaker mr-2">Nowy</button>
             {getAllSpeakers().length > 1 && <button onClick={() => setIsMergeModalOpen(true)} className="btn-add-speaker" title="Scal rozmówców">Scal rozmówców</button>}
            </div>
              <div className="relative flex-1 w-full min-h-0">
                <textarea 
                    key={selectedItem.id} 
                    ref={textareaRef} 
                    className="w-full h-full p-8 bg-gray-100/40 dark:bg-gray-900/40 pb-24 dark:text-gray-200 rounded-2xl font-mono text-base md:text-sm leading-relaxed border-none focus:ring-0 resize-none outline-none"
                    value={getDisplayText(selectedItem)} 
                    onChange={(e) => handleTextChange(e.target.value)} 
                    onBlur={handleTextBlur}
                    onContextMenu={handleContextMenu} 
                />
                <button onClick={() => { navigator.clipboard.writeText(getDisplayText(selectedItem)); setCopyState(true); setTimeout(() => setCopyState(false), 2000); }} className={`absolute top-4 right-4 p-2 rounded-lg transition-all ${copyState ? 'text-green-500' : 'text-gray-400'}`}>{copyState ? <CheckIcon /> : <IconCopy />}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} apiKey={apiKey} setApiKey={setApiKey} pantryId={pantryId} setPantryId={setPantryId} exportKeys={exportKeys} importKeys={importKeys} initialTab={settingsStartTab} />   
      <DeleteModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={executeDeleteFile} title={itemToDelete?.title} />
      <DeleteModal isOpen={!!speakerToDelete} onClose={() => setSpeakerToDelete(null)} onConfirm={confirmSpeakerDeletion} title={speakerToDelete ? getSpeakerName(speakerToDelete) || speakerToDelete : ""} />
      <DeleteModal isOpen={isDeleteAllModalOpen} onClose={() => setIsDeleteAllModalOpen(false)} onConfirm={executeDeleteAll} title="WSZYSTKO" />
      <InfoModal isOpen={infoModal.isOpen} title={infoModal.title} message={infoModal.message} onClose={() => setInfoModal({ ...infoModal, isOpen: false })} />
      <MergeModal isOpen={isMergeModalOpen} onClose={() => setIsMergeModalOpen(false)} onConfirm={executeMerge} speakers={getAllSpeakers()} getSpeakerName={getSpeakerName} />
      <AddSpeakerModal isOpen={isAddSpeakerModalOpen} onClose={() => setIsAddSpeakerModalOpen(false)} onConfirm={handleAddSpeaker} />
      {contextMenu && contextMenu.visible && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} speakers={getAllSpeakers()} getSpeakerName={getSpeakerName} onInsert={(key) => insertSpeakerAtCursor(key)} onClose={() => setContextMenu(null)} onNewSpeaker={() => setIsAddSpeakerModalOpen(true)} onDragStart={startDrag} />
      )}
    </main>
  );
}