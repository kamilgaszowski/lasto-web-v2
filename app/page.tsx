"use client";

import { useState, useEffect, useRef } from 'react';
import './lasto.css';


import { 
  RuneArrowLeft, RuneArrowRight, SettingsIcon, EditIcon, 
  CheckIcon, CloseIcon, TrashIcon, InfoIcon, IconCopy, MergeIcon
} from './components/Icons';

// --- MODELE DANYCH ---
interface Utterance {
  speaker: string;
  text: string;
  [key: string]: any; 
}

interface SpeakerMap {
  [key: string]: string;
}

interface HistoryItem {
  id: string;
  title: string;
  date: string;
  content: string;
  utterances?: Utterance[];
  speakerNames?: SpeakerMap;
  [key: string]: any;
}

// --- INDEXED DB UTILITIES ---
const DB_NAME = 'LastoDB';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
  if (typeof window === 'undefined') return Promise.reject("Server side");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbSave = async (item: HistoryItem) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const dbGetAll = async (): Promise<HistoryItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbDelete = async (id: string) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- KOMPRESJA DANYCH ---
const compressHistory = (history: HistoryItem[]) => {
    return history.map(item => ({
        id: item.id,
        ti: item.title,
        da: item.date,
        sn: item.speakerNames,
        u: item.utterances?.map(u => ({ s: u.speaker, t: u.text })) || [] 
    }));
};

const decompressHistory = (compressed: any[]): HistoryItem[] => {
    return compressed.map(item => {
        const utterances = item.u?.map((u: any) => ({ speaker: u.s, text: u.t })) || [];
        const content = utterances.map((u: any) => u.text).join('\n');
        return {
            id: item.id,
            title: item.ti,
            date: item.da,
            content: item.c || content,
            utterances: utterances,
            speakerNames: item.sn
        };
    });
};

export default function LastoWeb() {
  const [apiKey, setApiKey] = useState('');
  const [pantryId, setPantryId] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>(''); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [settingsTab, setSettingsTab] = useState<'guide' | 'form'>('form');
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState(''); 
  const [mergeTarget, setMergeTarget] = useState(''); 
const textareaRef = useRef<HTMLTextAreaElement>(null);
const [isAddSpeakerModalOpen, setIsAddSpeakerModalOpen] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  // Stany chwilowych zmian przycisków
  const [copyState, setCopyState] = useState(false);
  const [saveState, setSaveState] = useState(false);
  const [pobierzState, setPobierzState] = useState(false);
  const [wyslijState, setWyslijState] = useState(false);

  const deleteModalRef = useRef<HTMLDivElement>(null);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const deleteAllModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem('assemblyAIKey') || '');
    setPantryId(localStorage.getItem('pantryId') || '');
    const initData = async () => {
        try {
            const oldHistoryRaw = localStorage.getItem('lastoHistory');
            if (oldHistoryRaw) {
                try {
                    const parsed = JSON.parse(oldHistoryRaw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        for (const item of parsed) await dbSave(item);
                    }
                } catch(e) {}
                localStorage.removeItem('lastoHistory');
            }
            const items = await dbGetAll();
            const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(sorted);
        } catch (e) { console.error("Błąd bazy danych:", e); }
    };
    initData();
  }, []);

  useEffect(() => {
    if (isDeleteModalOpen) deleteModalRef.current?.focus();
    if (isDeleteAllModalOpen) deleteAllModalRef.current?.focus();
  }, [isDeleteModalOpen, isDeleteAllModalOpen]);

  // --- FUNKCJE LOGICZNE ---
 // --- FUNKCJE LOGICZNE (Zaktualizowane) ---
  
  // Pobieramy listę wszystkich kluczy głośników (z transkrypcji + te dodane ręcznie)
  const getAllSpeakers = () => {
    if (!selectedItem) return [];
    const fromTranscript = selectedItem.utterances?.map(u => u.speaker) || [];
    const fromNames = Object.keys(selectedItem.speakerNames || {});
    // Używamy Set, żeby usunąć duplikaty i sortujemy alfabetycznie
    return Array.from(new Set([...fromTranscript, ...fromNames])).sort();
  };

  const getSpeakerName = (item: HistoryItem, speakerKey: string): string => {
    // Jeśli mamy nazwę w mapie, zwracamy ją. Jeśli nie, zwracamy pusty string (placeholder załatwi sprawę)
    if (item.speakerNames && item.speakerNames[speakerKey]) return item.speakerNames[speakerKey];
    return "";
  };

  const handleSpeakerNameChange = async (speakerKey: string, newName: string) => {
    if (!selectedItem) return;
    const updatedItem = {
        ...selectedItem,
        speakerNames: { ...selectedItem.speakerNames, [speakerKey]: newName }
    };
    setHistory(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    await dbSave(updatedItem);
  };

  const handleAddSpeaker = () => {
    // Prosty prompt (można to zrobić ładniej, ale to najszybsza metoda)
    const newKey = prompt("Podaj identyfikator nowego rozmówcy (np. C, D, Moderator):");
    if (newKey && selectedItem) {
        // Dodajemy pusty wpis, żeby pojawił się na liście
        handleSpeakerNameChange(newKey.toUpperCase(), "Nowa Osoba");
    }
  };

const handleDeleteSpeaker = async (speakerKey: string) => {
    if (!selectedItem) return;

    // Pytamy o potwierdzenie, bo to usunie fragmenty tekstu
    if (!window.confirm(`Czy na pewno chcesz usunąć rozmówcę ${speakerKey}? Usunie to również wszystkie przypisane do niego wypowiedzi z tekstu.`)) {
      return;
    }

    // 1. Usuwamy przypisanie imienia (jeśli było)
    const newNames = { ...selectedItem.speakerNames };
    delete newNames[speakerKey]; 
    
    // 2. KLUCZOWE: Usuwamy wypowiedzi tego rozmówcy z transkrypcji
    // Dzięki temu 'getAllSpeakers' przestanie go wykrywać
    const newUtterances = selectedItem.utterances?.filter(u => u.speaker !== speakerKey) || [];

    const updatedItem = { 
        ...selectedItem, 
        speakerNames: newNames,
        utterances: newUtterances
    };



    setHistory(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    await dbSave(updatedItem);
  };

  const executeMergeSpeakers = async () => {
    if (!selectedItem || !mergeSource || !mergeTarget || mergeSource === mergeTarget) return;

    // 1. Aktualizujemy transkrypcję: Wszędzie gdzie mówi Source, wstawiamy Target
    const newUtterances = selectedItem.utterances?.map(u => ({
        ...u,
        speaker: u.speaker === mergeSource ? mergeTarget : u.speaker
    })) || [];

    // 2. Aktualizujemy nazwy: Usuwamy wpis dla Source (bo już nie istnieje)
    const newNames = { ...selectedItem.speakerNames };
    delete newNames[mergeSource]; 
    // (Opcjonalnie: upewniamy się, że Target ma nazwę)

    const updatedItem = {
        ...selectedItem,
        speakerNames: newNames,
        utterances: newUtterances
    };

    setHistory(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    await dbSave(updatedItem);
    
    setIsMergeModalOpen(false);
    setMergeSource('');
    setMergeTarget('');
  };

  const confirmAddSpeaker = async () => {
    if (!selectedItem) return;

    // 1. Znajdź pierwszą wolną literę (klucz)
    const currentKeys = getAllSpeakers();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let newKey = "";
    
    for (let char of alphabet) {
      if (!currentKeys.includes(char)) {
        newKey = char;
        break;
      }
    }
    // Jeśli alfabet się skończył (mało prawdopodobne), daj losowy ID
    if (!newKey) newKey = `S${currentKeys.length + 1}`;

    // 2. Przypisz wpisaną nazwę do tego klucza
    // Jeśli użytkownik nic nie wpisał, użyj samego klucza jako nazwy
    const nameToSave = newSpeakerName.trim() || newKey;
    
    await handleSpeakerNameChange(newKey, nameToSave);
    
    // 3. Posprzątaj
    setNewSpeakerName('');
    setIsAddSpeakerModalOpen(false);
  };
  // --- FUNKCJE EDYCJI TEKSTU ---

  // Funkcja, która obsługuje ręczne wpisywanie tekstu
  const handleTextChange = async (newText: string) => {
    if (!selectedItem) return;

    // WAŻNE: Jeśli użytkownik edytuje tekst ręcznie, musimy wyczyścić 'utterances' (klocki AI),
    // w przeciwnym razie funkcja getDisplayText ciągle nadpisywałaby zmiany użytkownika starą wersją z AI.
    // Przechodzimy w "Tryb Ręczny".
    const updatedItem = {
      ...selectedItem,
      content: newText,
      utterances: [] // Czyścimy klocki AI, polegamy teraz na 'content'
    };

    // Aktualizujemy stan lokalny (szybko)
    setHistory(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    
    // Zapisujemy do bazy (można dodać debounce dla wydajności, ale na razie save bezpośredni)
    await dbSave(updatedItem);
  };

  // Funkcja wstawiająca tag rozmówcy w miejscu kursora
  const insertSpeakerAtCursor = (speakerKey: string) => {
    if (!textareaRef.current || !selectedItem) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Pobieramy aktualny tekst
    const currentText = getDisplayText(selectedItem);
    
    // Tworzymy wstawkę, np. "\nROZMÓWCA A:\n"
    const insertText = `\n${getSpeakerName(selectedItem, speakerKey).toUpperCase() || speakerKey}:\n`;
    
    // Sklejamy tekst: Przed kursorem + Wstawka + Po kursorze
    const newText = currentText.substring(0, start) + insertText + currentText.substring(end);

    // Aktualizujemy tekst
    handleTextChange(newText);

    // Przywracamy focus na textarea i ustawiamy kursor po wstawce (opcjonalne, ale wygodne)
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertText.length, start + insertText.length);
    }, 0);
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    setIsProcessing(true);
    try {
        await dbDelete(itemToDelete);
        const updatedHistory = history.filter(item => item.id !== itemToDelete);
        setHistory(updatedHistory);
        if (selectedItem?.id === itemToDelete) setSelectedItem(null);
        setIsDeleteModalOpen(false);
        setItemToDelete(null);

        if (pantryId) {
            const compressed = compressHistory(updatedHistory);
            await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chunk_0: compressed.slice(0, 50),
                    manifest: { totalChunks: Math.ceil(compressed.length / 50), timestamp: Date.now() }
                })
            });
        }
    } catch (e) { console.error(e); } 
    finally { setIsProcessing(false); }
  };

  const executeDeleteAll = async () => {
    setIsProcessing(true);
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        setHistory([]);
        setSelectedItem(null);
        setIsDeleteAllModalOpen(false);

        if (pantryId) {
            await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chunk_0: [], manifest: { totalChunks: 0, timestamp: Date.now() } })
            });
        }
        setInfoModal({ isOpen: true, title: 'Gotowe', message: 'Wszystkie nagrania zostały usunięte.' });
    } catch (e) { console.error(e); } 
    finally { setIsProcessing(false); }
  };

  const saveNewTitle = async () => {
    if (!selectedItem || !editedTitle.trim()) { setIsEditingTitle(false); return; }
    const updatedItem = { ...selectedItem, title: editedTitle };
    setHistory(prev => prev.map(item => item.id === selectedItem.id ? updatedItem : item));
    setSelectedItem(updatedItem);
    setIsEditingTitle(false);
    await dbSave(updatedItem);
  };

  // --- AUTOMATYKA PANTRY ---
  const saveToCloudWithData = async (dataToSave: HistoryItem[]) => {
    if (!pantryId) return;
    try {
        const compressed = compressHistory(dataToSave);
        await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chunk_0: compressed.slice(0, 50), 
                manifest: { totalChunks: Math.ceil(compressed.length / 50), timestamp: Date.now() } 
            })
        });
    } catch (e) { console.error("Auto-backup failed", e); }
  };

  // --- UPLOAD (ASSEMBLY AI) ---
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
             setTimeout(() => saveToCloudWithData(updated), 500);
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

  // --- MANUALNA SYNCHRONIZACJA ---
  const saveToCloud = async () => {
    if (!pantryId || !apiKey) {
        setInfoModal({ isOpen: true, title: 'Brak kluczy', message: 'Upewnij się, że wpisałeś oba klucze w ustawieniach.' });
        return;
    }
    setIsProcessing(true);
    try {
        const compressedHistory = compressHistory(history);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < compressedHistory.length; i += CHUNK_SIZE) {
            await fetch(`https://getpantry.cloud/apiv1/pantry/${pantryId.trim()}/basket/lastoHistory`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [`chunk_${Math.floor(i/CHUNK_SIZE)}`]: compressedHistory.slice(i, i + CHUNK_SIZE), manifest: { totalChunks: Math.ceil(compressedHistory.length/CHUNK_SIZE), timestamp: Date.now() } })
            });
        }
        
        setWyslijState(true);
        setSaveState(true);
        setTimeout(() => {
            setWyslijState(false);
            setSaveState(false);
        }, 2000);

    } catch (e: any) { 
        setInfoModal({ isOpen: true, title: 'Błąd', message: e.message }); 
    }
    finally { setIsProcessing(false); }
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

  // --- OBSŁUGA DYSKU ---
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
          if (imported.pantryId) { setPantryId(imported.pantryId); localStorage.setItem('pantryId', imported.pantryId); }
          setInfoModal({ isOpen: true, title: 'Sukces', message: 'Klucze zostały zaimportowane.' });
        }
      } catch (err) { setInfoModal({ isOpen: true, title: 'Błąd', message: 'Nieprawidłowy format pliku.' }); }
    };
    reader.readAsText(file);
  };

  const getDisplayText = (item: HistoryItem) => {
    if (!item.utterances || item.utterances.length === 0) return item.content;
    const isJunk = (text: string, index: number) => {
        const badWords = ["prosimy", "poczekać", "zawiesił", "połączenie", "kontynuować", "wkrótce", "rozmowę", "będziesz", "mógł", "oczekiwanie"];
        const lowerText = text.toLowerCase();
        if (index < 2) return badWords.some(word => lowerText.includes(word));
        let hitCount = 0;
        badWords.forEach(word => { if (lowerText.includes(word)) hitCount++; });
        return hitCount >= 3;
    };
    return item.utterances.filter((u, index) => !isJunk(u.text, index)).map(u => {
        const speakerKey = (u.speaker === 'A' || u.speaker === '1') ? 'A' : 'B';
        return `${getSpeakerName(item, speakerKey).toUpperCase()}:\n${u.text}\n`;
    }).join('\n');
  };

  const copyToClipboard = () => {
    if (!selectedItem) return;
    navigator.clipboard.writeText(getDisplayText(selectedItem));
    setCopyState(true);
    setTimeout(() => setCopyState(false), 2000);
  };

  return (
    <main className="flex h-screen bg-gray-950 text-white overflow-hidden font-sans transition-colors duration-300">
      
    {/* SIDEBAR */}
    <div className={`lasto-sidebar ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <div className="sidebar-content">
        
        <div className="sidebar-header">
          <h2 onClick={() => setIsSidebarOpen(false)} className="text-2xl font-light tracking-tight cursor-pointer">
            Archiwum
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="icon-button">
            <RuneArrowLeft />
          </button>
        </div>

        <div className="sidebar-actions-grid">
            <button 
              onClick={loadFromCloud} 
              disabled={!pantryId || isProcessing} 
              className={`btn-action-base ${pobierzState ? 'btn-status-success' : 'btn-pobierz'}`}
            >
              {!pobierzState && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>}
              <span>{pobierzState ? 'Pobrano' : 'Pobierz'}</span>
            </button>

            <button 
              onClick={saveToCloud} 
              disabled={!pantryId || isProcessing} 
              className={`btn-action-base ${wyslijState ? 'btn-status-success' : 'btn-wyslij'}`}
            >
              {!wyslijState && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>}
              <span>{wyslijState ? 'Wysłano' : 'Wyślij'}</span>
            </button>
        </div>

        <div className="archive-list">
          {history.map((item) => (
            <button 
              key={item.id} 
              onClick={() => { 
                setSelectedItem(item);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }} 
              className={`archive-item ${selectedItem?.id === item.id ? 'archive-item-active' : ''}`}
            >
              <div 
                onClick={(e) => { e.stopPropagation(); confirmDelete(item.id); }} 
                className="archive-delete-btn"
              >
                <CloseIcon />
              </div>
              <div className="archive-item-title">{item.title}</div>
              <div className="archive-item-date">
                {new Date(item.date).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="sidebar-footer">
              <button onClick={() => setIsDeleteAllModalOpen(true)} className="btn-clear-archive">
                <TrashIcon />
                <span>Wyczyść Archiwum</span>
              </button>
          </div>
        )}
      </div>
    </div>

    {/* SEKCJA GŁÓWNY PANEL START ---*/}
    <div className={`lasto-main-panel ${isSidebarOpen ? 'md:ml-80 ml-0' : 'ml-0'}`}>
      
      {/* PASEK GÓRNY */}
      <div className="top-bar">
        <div className="top-bar-left">
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="icon-button">
              <RuneArrowRight />
            </button>
          )}
          {selectedItem && (
            <button onClick={() => setSelectedItem(null)} className="btn-logo">
              Lasto
            </button>
          )}
        </div>
        <button onClick={() => setIsSettingsOpen(true)} className="settings-trigger">
          <SettingsIcon />
        </button>
      </div>

      {/* OBSZAR ROBOCZY */}
      <div className="workspace-area">
        {!selectedItem ? (
          /* EKRAN POWITALNY (HERO) */
          <div className="hero-container">
            <div className="hero-content">
              <div className="hero-title">Lasto</div>
              <div className="hero-subtitle">
                <span>Słuchaj</span> <span className="rune-divider">ᛟ</span>
                <span>Nagraj</span> <span className="rune-divider">ᛟ</span>
                <span>Pisz</span>
              </div>
            </div>

            <div className="import-zone">
              {isProcessing ? (
                <div className="flex flex-col items-center space-y-3 animate-in fade-in zoom-in duration-300">
                   <div className="loader-spin" />
                   <span className="loader-text">{uploadStatus || status || 'Przetwarzanie...'}</span>
                </div>
              ) : !apiKey ? (
                <button onClick={() => setIsSettingsOpen(true)} className="btn-primary">
                  Dodaj pierwsze nagranie
                </button>
              ) : (
                <>
                  <label 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} 
                    onDragLeave={() => setIsDragging(false)} 
                    onDrop={handleDrop} 
                    className={`btn-import ${isDragging ? 'import-dragging' : ''}`}
                  >
                    {isDragging ? 'Upuść tutaj!' : 'Importuj nagranie'}
                    <input type="file" className="hidden" accept="audio/*" onChange={handleFileInput} />
                  </label>
                  <p className="format-hint">WAV • MP3 • M4A</p>
                </>
              )}
            </div>
          </div>
        ) : (
          /* EDYTOR TRANSKRYPCJI */
          <div className="editor-container">
            <div className="editor-header">
              {isEditingTitle ? (
                <div className="title-view-mode">
                  <input 
                    className="title-input" 
                    value={editedTitle} 
                    onChange={(e) => setEditedTitle(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && saveNewTitle()} 
                    autoFocus 
                  />
                  <button onClick={saveNewTitle} className="ml-4 text-green-600 hover:text-green-800 p-2"><CheckIcon /></button>
                </div>
              ) : (
                <div className="title-view-mode">
                  <button onClick={() => confirmDelete(selectedItem.id)} className="mr-4 text-gray-400 hover:text-red-500 transition-colors p-2" title="Usuń nagranie">
                    <TrashIcon />
                  </button>
                  <div className="title-clickable" onClick={() => { setEditedTitle(selectedItem.title); setIsEditingTitle(true); }}>
                    <h1 className="title-text">{selectedItem.title}</h1>
                    <span className="edit-indicator"><EditIcon /></span>
                  </div>
                  <div className="ml-auto">
                    <button 
                      onClick={saveToCloud} 
                      disabled={!pantryId || isProcessing} 
                      className={`btn-save-cloud ${saveState ? 'btn-status-success' : ''}`}
                    >
                      {isProcessing ? <div className="loader-spin-xs" /> : !saveState && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" /></svg>
                      )}
                      <span>{saveState ? 'Zapisano' : 'Zapisz'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

        {/* ZMIANA: Dynamiczna lista rozmówców */}
            
            <div className="speaker-list">
              {getAllSpeakers().map((speakerKey) => {
                // Logika: Jeśli jest nazwa, pokaż nazwę. Jeśli nie, pokaż klucz (np. "A")
                const displayValue = selectedItem?.speakerNames?.[speakerKey] !== undefined 
                  ? selectedItem.speakerNames[speakerKey] 
                  : speakerKey;

                return (
                  <div key={speakerKey} className="speaker-badge">
                    {/* INPUT: Zmienia nazwę */}
                    {/* PRZYCISK + : Wstawia do tekstu */}
                    <button 
                      onClick={() => insertSpeakerAtCursor(speakerKey)}
                      className="speaker-action-btn btn-insert"
                      title="Wstaw do tekstu"
                    >
                      +
                    </button>
                    <input 
                      className="speaker-input" 
                      value={displayValue} 
                      onChange={(e) => handleSpeakerNameChange(speakerKey, e.target.value)} 
                      placeholder="Nazwa..." 
                    />
                    
                    

                    {/* PRZYCISK X : Usuwa */}
                    <button 
                      onClick={() => handleDeleteSpeaker(speakerKey)}
                      className="speaker-action-btn btn-delete"
                      title="Usuń rozmówcę"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                );
              })}
              
             <button onClick={() => setIsAddSpeakerModalOpen(true)} className="btn-add-speaker mr-2">
                Nowy
              </button>
              
              {/* PRZYCISK SCALANIA */}
              {getAllSpeakers().length > 1 && (
                 <button onClick={() => setIsMergeModalOpen(true)} className="btn-add-speaker" title="Scal rozmówców">
                   Scal rozmówców
                 </button>
              )}
            </div>
         {/* ZMIANA: Kontener relative dla textarea i pływającego przycisku */}
            <div className="relative flex-1 w-full min-h-0">
              <textarea 
              ref={textareaRef}
                className="w-full h-full p-8 bg-gray-100/40 dark:bg-gray-900/40 dark:text-gray-200 rounded-2xl font-mono text-sm leading-relaxed border-none focus:ring-0 resize-none selection:bg-blue-50 dark:selection:bg-blue-900 pr-16" // Dodano pr-16 żeby tekst nie wchodził pod guzik
                value={getDisplayText(selectedItem)} 
                onChange={(e) => handleTextChange(e.target.value)} // Obsługa pisania 
              />
              
              {/* Pływający przycisk kopiowania (jak w code blocks) */}
              <button 
                onClick={copyToClipboard} 
                className={`absolute top-4 right-4 p-2 rounded-lg transition-all backdrop-blur-sm border border-transparent ${
                  copyState 
                    ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                    : 'bg-gray-200/50 dark:bg-gray-800/50 text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700 hover:text-black dark:hover:text-white'
                }`}
                title="Kopiuj tekst"
              >
                {copyState ? <CheckIcon /> : <IconCopy />}
              </button>
            </div>
          </div>
        )}
      </div>

     {/* STOPKA PODPISU */}
      <div className="main-footer">
        <div className="footer-signature">
          <span className="italic">Lasto beth nîn</span>
          <span className="rune-divider">ᛟ</span>
          <span>developed by Kamil Gąszowski</span>
          <span className="rune-divider">ᛟ</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
    { /*- SEKCJA GŁÓWNY PANEL END ---*/}

{/* MODAL USTAWIEŃ Z ZAKŁADKAMI MOBILE */}
    {isSettingsOpen && (
      <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          
          <button onClick={() => setIsSettingsOpen(false)} className="settings-close-btn">
            <CloseIcon />
          </button>

          {/* PASEK ZAKŁADEK (TYLKO MOBILE) */}
          <div className="flex md:hidden w-full border-b border-gray-800 bg-gray-900/50 shrink-0">
            <button 
              onClick={() => setSettingsTab('form')} 
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${settingsTab === 'form' ? 'text-white bg-gray-800 border-b-2 border-white' : 'text-gray-500'}`}
            >
              Ustawienia
            </button>
            <button 
              onClick={() => setSettingsTab('guide')} 
              className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${settingsTab === 'guide' ? 'text-white bg-gray-800 border-b-2 border-white' : 'text-gray-500'}`}
            >
              Konfiguracja
            </button>
          </div>

          {/* LEWA KOLUMNA (PRZEWODNIK) */}
          {/* Klasa `hidden md:block` ukrywa go na mobile, chyba że wybrana jest zakładka guide */}
          <div className={`guide-panel ${settingsTab === 'guide' ? 'block' : 'hidden md:block'}`}>
            <h3 className="guide-heading">Przewodnik konfiguracji</h3>
            <div className="space-y-12">
              <div className="step-container">
                <div className="step-header">
                  <span className="step-number">1</span>
                  <h4 className="step-title">Transkrypcja (AssemblyAI)</h4>
                </div>
                <div className="step-content">
                  <p>Klucz API pozwala SI zamienić Twoje nagrania na tekst.</p>
                  <ul className="list-disc space-y-3 pl-4 font-medium">
                    <li>Zarejestruj się na <a href="https://www.assemblyai.com/" target="_blank" className="step-link">assemblyai.com</a></li>
                    <li>Wejdź do <span className="highlight-text">Dashboard</span> i skopiuj <span className="highlight-text">Your API Key</span></li>
                  </ul>
                </div>
              </div>

              <div className="step-container">
                <div className="step-header">
                  <span className="step-number">2</span>
                  <h4 className="step-title">Synchronizacja (Pantry)</h4>
                </div>
                <div className="step-content">
                  <p>Pantry ID chroni historię przed wyczyszczeniem danych przeglądarki.</p>
                  <ul className="list-disc space-y-3 pl-4 font-medium">
                    <li>Wejdź na <a href="https://getpantry.cloud/" target="_blank" className="step-link">getpantry.cloud</a></li>
                    <li>ID znajdziesz w Dashboardzie po stworzeniu nowej Spiżarni.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* PRAWA KOLUMNA (FORMULARZ) */}
          {/* Klasa `hidden md:block` ukrywa go na mobile, chyba że wybrana jest zakładka form */}
          <div className={`form-panel ${settingsTab === 'form' ? 'block' : 'hidden md:block'}`}>
            <h3 className="settings-heading">Ustawienia</h3>
            <div className="space-y-12">
              
              <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); setIsSettingsOpen(false); }}>
                <div className="space-y-6">
                  <div className="input-group">
                    <label className="input-label">AssemblyAI Key</label>
                    <input 
                      type="password" 
                      name="assembly-key" 
                      autoComplete="current-password" 
                      className="settings-input" 
                      value={apiKey} 
                      onChange={(e) => { setApiKey(e.target.value); localStorage.setItem('assemblyAIKey', e.target.value); }} 
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Pantry ID</label>
                    <input type="text" name="username" value="LastoUser" autoComplete="username" className="hidden" readOnly />
                    <input 
                      type="password" 
                      name="password" 
                      autoComplete="current-password" 
                      className="settings-input" 
                      value={pantryId} 
                      onChange={(e) => { setPantryId(e.target.value); localStorage.setItem('pantryId', e.target.value); }} 
                    />
                  </div>
                </div>
              </form>

              <div className="backup-section">
                <label className="settings-label">Backup kluczy</label>
                <div className="backup-grid">
                  <button onClick={exportKeys} className="btn-backup">Zapisz do pliku</button>
                  <label className="btn-backup">
                    Wczytaj plik
                    <input type="file" className="hidden" accept=".json" onChange={importKeys} />
                  </label>
                </div>
              </div>

              <button onClick={() => setIsSettingsOpen(false)} className="btn-submit">Gotowe</button>
            </div>
          </div>
        </div>
      </div>
    )}
    {/* MODAL USUWANIA JEDNEGO */}
    {isDeleteModalOpen && (
      <div 
        ref={deleteModalRef} 
        className="modal-backdrop" 
        onClick={() => setIsDeleteModalOpen(false)} 
        onKeyDown={(e) => { 
          if (e.key === 'Enter') { e.preventDefault(); executeDelete(); } 
          if (e.key === 'Escape') setIsDeleteModalOpen(false); 
        }} 
        tabIndex={-1}
      >
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon-wrapper icon-theme-red">
            <TrashIcon />
          </div>
          <div className="space-y-2">
            <h3 className="modal-title-sm">Usunąć nagranie?</h3>
            <p className="modal-desc">Tej operacji nie można cofnąć.</p>
          </div>
          <div className="modal-actions-row">
            <button onClick={() => setIsDeleteModalOpen(false)} className="btn-modal-cancel">Anuluj</button>
            <button onClick={executeDelete} className="btn-modal-delete">Usuń (Enter)</button>
          </div>
        </div>
      </div>
    )}

    {/* MODAL USUWANIA WSZYSTKIEGO */}
    {isDeleteAllModalOpen && (
      <div 
        ref={deleteAllModalRef} 
        className="modal-backdrop-high" 
        onClick={() => setIsDeleteAllModalOpen(false)} 
        onKeyDown={(e) => { 
          if (e.key === 'Enter') executeDeleteAll(); 
          if (e.key === 'Escape') setIsDeleteAllModalOpen(false); 
        }} 
        tabIndex={-1}
      >
        <div className="modal-box" onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon-wrapper icon-theme-danger">
            <TrashIcon />
          </div>
          <div className="space-y-2">
            <h3 className="modal-title-bold">Usunąć wszystko?</h3>
            <p className="modal-desc">Stracisz bezpowrotnie wszystkie nagrania lokalne i w chmurze Pantry.</p>
          </div>
          <div className="modal-actions-col">
            <button onClick={executeDeleteAll} className="btn-modal-delete-all">Tak, usuń wszystko (Enter)</button>
            <button onClick={() => setIsDeleteAllModalOpen(false)} className="btn-modal-cancel-text">Anuluj (Esc)</button>
          </div>
        </div>
      </div>
    )}

    {/* MODAL INFORMACYJNY */}
    {infoModal.isOpen && (
      <div className="modal-backdrop-light" onClick={() => setInfoModal({ ...infoModal, isOpen: false })}>
        <div className="modal-box space-y-6" onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon-wrapper icon-theme-neutral">
            <InfoIcon />
          </div>
          <div className="space-y-2">
            <h3 className="modal-title-sm">{infoModal.title}</h3>
            <p className="modal-desc">{infoModal.message}</p>
          </div>
          <div className="pt-2">
            <button onClick={() => setInfoModal({ ...infoModal, isOpen: false })} className="btn-modal-ok">OK</button>
          </div>
        </div>
      </div>
    )}
  
   {/* MODAL SCALANIA ROZMÓWCÓW */}
    {isMergeModalOpen && (
      <div className="modal-backdrop" onClick={() => setIsMergeModalOpen(false)}>
        <div className="modal-box text-left" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title-bold mb-6 text-center">Scalanie rozmówców</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Kogo scalić? (Zniknie)</label>
              <select 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-xl focus:ring-1 focus:ring-white outline-none"
                value={mergeSource}
                onChange={(e) => setMergeSource(e.target.value)}
              >
                <option value="">Wybierz...</option>
                {getAllSpeakers().map(s => {
                    if (s === mergeTarget) return null;
                    // ZMIANA: Wyświetlamy tylko imię, a jak go brak to literę (s)
                    const label = getSpeakerName(selectedItem!, s) || s;
                    return <option key={s} value={s}>{label}</option>;
                })}
              </select>
            </div>

            <div className="flex justify-center text-gray-500">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" /></svg>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Z kim? (Pozostanie)</label>
              <select 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-xl focus:ring-1 focus:ring-white outline-none"
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
              >
                <option value="">Wybierz...</option>
                {getAllSpeakers().map(s => {
                    if (s === mergeSource) return null;
                    // ZMIANA: To samo tutaj
                    const label = getSpeakerName(selectedItem!, s) || s;
                    return <option key={s} value={s}>{label}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="modal-actions-row mt-8">
            <button onClick={() => setIsMergeModalOpen(false)} className="btn-modal-cancel">Anuluj</button>
            <button 
                onClick={executeMergeSpeakers} 
                disabled={!mergeSource || !mergeTarget}
                className="btn-modal-ok disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Scal
            </button>
          </div>
        </div>
      </div>
    )}
    {/* MODAL DODAWANIA ROZMÓWCY */}
    {isAddSpeakerModalOpen && (
      <div className="modal-backdrop" onClick={() => setIsAddSpeakerModalOpen(false)}>
        <div className="modal-box text-left" onClick={(e) => e.stopPropagation()}>
          <h3 className="modal-title-bold mb-4 text-center">Nowy Rozmówca</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Nazwa (Imię)</label>
              <input 
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-xl focus:ring-1 focus:ring-white outline-none placeholder-gray-600"
                placeholder="np. Marek, Lektor, Gość..."
                value={newSpeakerName}
                onChange={(e) => setNewSpeakerName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && confirmAddSpeaker()}
              />
            </div>
          </div>

          <div className="modal-actions-row mt-6">
            <button onClick={() => setIsAddSpeakerModalOpen(false)} className="btn-modal-cancel">Anuluj</button>
            <button onClick={confirmAddSpeaker} className="btn-modal-ok">Dodaj</button>
          </div>
        </div>
      </div>
    )}
    </main>
  );
}