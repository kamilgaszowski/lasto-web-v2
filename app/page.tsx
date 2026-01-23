"use client";

import { useState, useEffect, useRef } from 'react';
import './lasto.css';

// Importy Komponentów
import { 
  RuneArrowLeft, 
  RuneArrowRight, 
  SettingsIcon, 
  EditIcon, 
  CheckIcon, 
  CloseIcon, 
  TrashIcon, 
  IconCopy,
  LinkIcon,
  IconTextMode,
  IconSpeakerMode
} from '../components/Icons';

import { DeleteModal, InfoModal, AddSpeakerModal } from '../components/CommonModals';
import { SettingsModal } from '../components/SettingsModal';
import { ContextMenu } from '../components/ContextMenu';

// Importy Typów i Logiki
import { HistoryItem } from '../types';
import { dbSave, dbGetAll, dbDelete } from '../lib/storage';

const TypewriterLoader = ({ message }: { message: string }) => {
  const [text, setText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const isDeleting = useRef(false);

  useEffect(() => {
    let speed = 50; 
    
    if (!message.startsWith(text) && text.length > 0) {
       isDeleting.current = true;
       speed = 30; 
    }
    else if (text === message && !isDeleting.current) {
       isDeleting.current = true;
       speed = 2000; 
    }
    else if (text.length === 0 && isDeleting.current) {
       isDeleting.current = false;
       speed = 200; 
    }
    else if (isDeleting.current) {
       speed = 25; 
    }

    const timer = setTimeout(() => {
      setText(current => {
        if (isDeleting.current) {
          return current.length > 0 ? current.slice(0, -1) : '';
        } else {
          return message.slice(0, current.length + 1);
        }
      });
    }, speed);

    return () => clearTimeout(timer);
  }, [text, message]);

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 150); 
    return () => clearInterval(blinkInterval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-16 w-full">
      <div className="min-w-[100px] flex items-center justify-start"> 
        <div className="font-mono text-md md:text-md font-light opacity-80 tracking-widest text-white/90 min-h-[3rem] flex items-center">
          {text}
          <span 
            className={`inline-block w-1 h-4 md:h-5 bg-white ml-1 transition-opacity duration-200 ${showCursor ? 'opacity-100' : 'opacity-0'}`}
          ></span>
        </div>
      </div>
    </div>
  );
};

// --- GŁÓWNY KOMPONENT ---
export default function LastoWeb() {
  // --- STATE ---
  const [apiKey, setApiKey] = useState('');
  const [pantryId, setPantryId] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [importUrl, setImportUrl] = useState('');
  
  const [editorMode, setEditorMode] = useState<'text' | 'speaker'>('text');
  
  // Refy
  const lastCursorPos = useRef<number>(0);
  const selectedItemRef = useRef<HistoryItem | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestTextRef = useRef<string>(''); 
  const isUserTypingRef = useRef<boolean>(false); 
  const historyRef = useRef<HistoryItem[]>([]);
  
  // UI State
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isDragging, setIsDragging] = useState(false);
  
  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isAddSpeakerModalOpen, setIsAddSpeakerModalOpen] = useState(false);
  
  const [itemToDelete, setItemToDelete] = useState<HistoryItem | null>(null);
  const [speakerToDelete, setSpeakerToDelete] = useState<string | null>(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [copyState, setCopyState] = useState(false);
  const [pobierzState, setPobierzState] = useState(false);
  const [settingsStartTab, setSettingsStartTab] = useState<'guide' | 'form'>('form');

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; cursorIndex: number; selectedText: string | null } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- FUNKCJA ODŚWIEŻAJĄCA Z BAZY (Musi być tutaj, na górze) ---
  const refreshFromDb = async () => {
    try {
      const saved = await dbGetAll();
      const sorted = saved.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(sorted);
    } catch (e) {
      console.error("Błąd odświeżania bazy:", e);
    }
  };

  // --- CHECK STATUS (Musi być zdefiniowany przed użyciem w processUrl) ---
// --- CHECK STATUS (Musi być zdefiniowany przed użyciem w processUrl) ---
  const checkStatus = async (assemblyId: string, localDbId: string, rawFileName: string, currentApiKey: string) => {
    
    const fileName = rawFileName.replace(/[^\w\s\-\.ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\(\)]/g, "").trim() || "Nagranie";
    console.log(`[TŁO] Start pętli dla DB ID: ${localDbId}`);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://api.assemblyai.com/v2/transcript/${assemblyId}`, { 
            headers: { 'Authorization': currentApiKey } 
        });
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) clearInterval(interval);
            return;
        }

        const result = await res.json();

        // 1. SUKCES - MAMY TEKST!
        if (result.status === 'completed') {
          clearInterval(interval);
          
          // Formatowanie tekstu...
          const initialSpeakerMap: Record<string, string> = {};
          let finalContent = "";

          if (result.utterances && result.utterances.length > 0) {
            const uniqueSpeakersInOrder = Array.from(new Set(result.utterances.map((u: any) => u.speaker)));
            const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            uniqueSpeakersInOrder.forEach((lbl: any, idx) => {
                initialSpeakerMap[lbl] = `ROZMÓWCA ${alphabet[idx] || lbl}`;
            });
            finalContent = result.utterances
              .map((u: any) => {
                const clean = cleanTranscript(u.text);
                return clean ? `${initialSpeakerMap[u.speaker]}:\n${clean}\n` : null;
              })
              .filter(Boolean).join('\n');
          } else {
            finalContent = cleanTranscript(result.text);
          }

          // TWORZYMY GOTOWY OBIEKT
          const finalItem: HistoryItem = { 
              id: localDbId, 
              title: fileName, 
              date: new Date().toISOString(), 
              content: finalContent, 
              utterances: [], 
              speakerNames: initialSpeakerMap,
              isProcessing: false 
          };
          
          // 1. ZAPISUJEMY DO BAZY LOKALNEJ
          await dbSave(finalItem);
          
          // 2. ODŚWIEŻAMY WIDOK
          await refreshFromDb();
          
          // 3. --- NOWOŚĆ: WYMUSZAMY ZAPIS DO PANTRY ---
          // Pobieramy najnowszą wersję z bazy i wysyłamy do chmury
          const allItems = await dbGetAll();
          // Sortujemy tak samo jak przy wyświetlaniu
          const sorted = allItems.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          // Wywołujemy triggerAutoSave ręcznie, przekazując posortowaną listę
          await triggerAutoSave(sorted);
          
          console.log("[TŁO] Zapisano do Pantry!");

          // Jeśli użytkownik akurat ma to wybrane, odświeżamy też edytor
          setSelectedItem(prev => prev?.id === localDbId ? finalItem : prev);
          
        } 
        // 2. BŁĄD AI
        else if (result.status === 'error') {
            clearInterval(interval);
            const errorItem = {
                id: localDbId,
                title: `${fileName} (Błąd AI)`,
                date: new Date().toISOString(),
                content: `Błąd transkrypcji: ${result.error}`,
                utterances: [],
                speakerNames: {},
                isProcessing: false
            };
            await dbSave(errorItem);
            await refreshFromDb();
            // Też wysyłamy do chmury, żeby błąd się zapisał
            const allItems = await dbGetAll();
            await triggerAutoSave(allItems);
        }

      } catch (err) { 
          console.error("Błąd w pętli sprawdzania:", err);
      }
    }, 5000); 
  };

// --- INIT ---
  useEffect(() => {
    setApiKey(localStorage.getItem('assemblyAIKey') || '');
    const savedPantryId = localStorage.getItem('pantryId') || '';
    setPantryId(savedPantryId);

    // Ładujemy dane z bazy przy starcie
    refreshFromDb();

    if (savedPantryId) {
        // Opcjonalnie: Załaduj z chmury, ale nie blokuj widoku lokalnego
        loadFromCloud(true);
    }
  }, []);

  // --- KOMPRESJA LOKALNA ---
  const localCompressHistory = (historyData: HistoryItem[]) => {
    return historyData.map(item => ({
        id: item.id,
        ti: item.title,
        da: item.date,
        sn: item.speakerNames,
        c: item.content, 
        u: item.utterances?.map(u => ({ s: u.speaker, t: u.text })) || []
    }));
  };

  const localDecompressHistory = (compressed: any[]): HistoryItem[] => {
    return compressed.map(item => {
        const utterances = item.u?.map((u: any) => ({ speaker: u.s, text: u.t })) || [];
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

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (isProcessing) return;
        if (infoModal.isOpen && (e.key === 'Enter' || e.key === 'Escape')) setInfoModal(prev => ({ ...prev, isOpen: false }));
        if (isDeleteModalOpen) {
            if (e.key === 'Enter') executeDeleteFile();
            if (e.key === 'Escape') setIsDeleteModalOpen(false);
        }
        if (isDeleteAllModalOpen) {
            if (e.key === 'Enter') executeDeleteAll();
            if (e.key === 'Escape') setIsDeleteAllModalOpen(false);
        }
        if (speakerToDelete) {
            if (e.key === 'Enter') confirmSpeakerDeletion();
            if (e.key === 'Escape') setSpeakerToDelete(null);
        }
        if (isSettingsOpen && e.key === 'Escape') setIsSettingsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, infoModal.isOpen, isDeleteModalOpen, isDeleteAllModalOpen, speakerToDelete, isSettingsOpen]);

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

    const knownIds = Object.keys(selectedItem.speakerNames || {});
    const knownNames = Object.values(selectedItem.speakerNames || {});

    const text = getDisplayText(selectedItem);
    const regex = /^([^\n:]+):/gm;
    const foundNamesInText = new Set<string>();
    let match;
    while ((match = regex.exec(text)) !== null) {
        const name = match[1].trim();
        if (!knownNames.includes(name) && name.length < 50) {
            foundNamesInText.add(name);
        }
    }
    return Array.from(new Set([...knownIds, ...foundNamesInText])).sort();
  };

  const getSpeakerName = (id: string): string => {
    if (!selectedItem) return id;
    if (selectedItem.speakerNames && selectedItem.speakerNames[id]) {
        return selectedItem.speakerNames[id];
    }
    if (id === 'A') return 'Speaker A';
    if (id === 'B') return 'Speaker B';
    return id;
  };

  const getDisplayText = (item: HistoryItem) => {
    if (!item.content && item.utterances && item.utterances.length > 0) {
        return item.utterances.map(u => {
            const speaker = u.speaker === 'A' ? 'ROZMÓWCA A' : (u.speaker === 'B' ? 'ROZMÓWCA B' : u.speaker);
            return `${speaker}:\n${u.text}\n`;
        }).join('\n');
    }
    return item.content || "";
  };

  // --- CLOUD SYNC ---
  const triggerAutoSave = async (overrideHistory?: HistoryItem[]) => {
    const cleanId = pantryId?.trim();
    if (!cleanId) return;

    setCloudStatus('saving'); 
    const dataToSave = overrideHistory || history;

    try {
        const compressed = localCompressHistory(dataToSave);
        if (compressed.length === 0) {
             const response = await fetch('/api/pantry', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cleanId, data: { history: [] } })
            });
            if (!response.ok && response.status !== 429) throw new Error(response.statusText);
        } else {
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
        }
        setCloudStatus('saved'); 
        setTimeout(() => setCloudStatus('idle'), 3000); 
    } catch (e) { 
        console.warn("Auto-save skipped:", e); 
        setCloudStatus('error');
    }
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

        if (remoteCompressed.length >= 0) {
             const remoteHistory = localDecompressHistory(remoteCompressed);
             const sortedRemote = remoteHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

             // UWAGA: Tu też używamy bazy jako źródła
             const currentLocalItems = await dbGetAll();
             const processingItems = currentLocalItems.filter(item => item.isProcessing);
            
             for (const item of currentLocalItems) { await dbDelete(item); }
             for (const item of processingItems) { await dbSave(item); }
             for (const item of sortedRemote) { await dbSave(item); }

             for (const item of sortedRemote) { 
    // Jeśli ID z chmury koliduje z procesującym się plikiem, to ignorujemy chmurę na rzecz lokalnego procesu
    if (!processingItems.find(p => p.id === item.id)) {
        await dbSave(item); 
    }
}

             await refreshFromDb();

             if (selectedItemRef.current) {
                 const exists = sortedRemote.find(i => i.id === selectedItemRef.current?.id);
                 if (!exists) setSelectedItem(null);
                 else setSelectedItem(exists);
             }

             if (!isSilent) {
                 setInfoModal({ isOpen: true, title: 'Zaktualizowano', message: 'Lista jest zgodna z chmurą.' });
             }
             
             setPobierzState(true);
             setTimeout(() => setPobierzState(false), 2000);
             setIsSettingsOpen(false);
        }
    } catch (e: any) { 
        console.error(e);
        if (!isSilent) setInfoModal({ isOpen: true, title: 'Błąd', message: e.message }); 
    }
    finally { setIsProcessing(false); }
  };

  // --- ACTIONS: ZAPIS TEKSTU ---
  const performSaveText = (itemId: string, textToSave: string) => {
      // Pobieramy aktualny stan z bazy, żeby nie nadpisać czegoś starego
      dbGetAll().then(currentHistory => {
          const itemIndex = currentHistory.findIndex(i => i.id === itemId);
          if (itemIndex === -1) return;

          const existingItem = currentHistory[itemIndex];
          const finalItemToSave = { 
              ...existingItem, 
              content: textToSave, 
              utterances: undefined as any,
              date: new Date().toISOString()
          };

          dbSave(finalItemToSave).then(() => {
              refreshFromDb(); // Odświeżamy widok po zapisie
              triggerAutoSave(); // Wyślij do chmury (opcjonalnie całą listę)
          });

          if (selectedItemRef.current?.id === itemId) {
              setSelectedItem(finalItemToSave);
          }
          
          isUserTypingRef.current = false;
      });
  };

  const handleCursorActivity = () => {
    if (textareaRef.current) {
      lastCursorPos.current = textareaRef.current.selectionStart;
    }
  };

  const handleTextChange = async (newText: string) => {
    if (!selectedItem) return;
    
    isUserTypingRef.current = true;
    
    const updatedItem = { 
        ...selectedItem, 
        content: newText, 
        utterances: [], 
        date: new Date().toISOString() 
    };

    // Aktualizujemy tylko lokalny stan edytora dla płynności
    setSelectedItem(updatedItem); 
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setCloudStatus('saving');

    saveTimeoutRef.current = setTimeout(() => {
        performSaveText(selectedItem.id, newText);
    }, 2000); 
  };

  const handleTextBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (selectedItem) {
          performSaveText(selectedItem.id, e.target.value);
      }
  };

  // --- PROCESS FILE / URL ---
 
const processFile = async (file: File) => {
    if (!apiKey) return;
    setIsProcessing(true);
    setStatus('Wysyłanie pliku...');

    // 1. WPIS TYMCZASOWY OD RAZU
    const tempId = `file-pending-${Date.now()}`;
    const tempItem: HistoryItem = {
        id: tempId,
        title: `${file.name} (Przetwarzanie...)`,
        date: new Date().toISOString(),
        content: "Trwa transkrypcja w tle...",
        utterances: [],
        speakerNames: {},
        isProcessing: true 
    };

    await dbSave(tempItem);
    await refreshFromDb(); 

    try {
      // 2. UPLOAD PLIKU (BEZ FormData!)
      // AssemblyAI wymaga surowego pliku w body
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream' // Kluczowa zmiana
        },
        body: file // Wysyłamy plik bezpośrednio, nie przez FormData
      });

      if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || "Błąd uploadu do AssemblyAI");
      }
      
      const { upload_url } = await uploadRes.json();

      setStatus('Zlecanie transkrypcji...');

      // 3. Start transkrypcji
      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            audio_url: upload_url, 
            language_code: 'pl', 
            speaker_labels: true 
        })
      });

      if (!transcriptRes.ok) throw new Error("Błąd startu transkrypcji");
      const { id } = await transcriptRes.json();

      // --- ZAPISUJEMY ID ASSEMBLY DO BAZY (DLA WZNAWIANIA) ---
      const processingItem = { ...tempItem, assemblyId: id };
      await dbSave(processingItem);

      setIsProcessing(false); 
      setStatus('');

      // Przekazujemy pałeczkę
      checkStatus(id, tempId, file.name, apiKey);

    } catch (e: any) {
      console.error(e);
      const errorItem = { ...tempItem, title: "BŁĄD PLIKU", content: e.message, isProcessing: false };
      await dbSave(errorItem);
      await refreshFromDb();

      setStatus(`Błąd: ${e.message}`);
      setTimeout(() => {
          setIsProcessing(false);
          setStatus('');
      }, 3000);
    }
  };
 

const processUrl = async () => {
    if (!apiKey || !importUrl.trim()) return;
    
    const urlToProcess = importUrl.trim();
    setImportUrl(''); 
    setIsProcessing(true);
    setStatus('Inicjowanie...');

    const tempId = `pending-${Date.now()}`;
    // Tworzymy obiekt - na razie bez assemblyId
    const tempItem: HistoryItem = {
        id: tempId,
        title: "Pobieranie...",
        date: new Date().toISOString(),
        content: "Oczekiwanie na pobranie pliku i transkrypcję...",
        utterances: [],
        speakerNames: {},
        isProcessing: true 
    };

    await dbSave(tempItem);
    await refreshFromDb(); 

    try {
      let finalAudioUrl = urlToProcess;
      let videoTitle = 'Import z linku';
      const isYoutube = urlToProcess.includes('youtube.com') || urlToProcess.includes('youtu.be');

      if (isYoutube) {
        setStatus('Pobieranie audio...');
        tempItem.title = "Pobieranie z YouTube...";
        await dbSave(tempItem);
        refreshFromDb();

        const ytRes = await fetch('/api/get-youtube-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ url: urlToProcess })
        });

        if (!ytRes.ok) throw new Error("Błąd pobierania (YouTube/WWW)");
        
        const ytData = await ytRes.json();
        finalAudioUrl = ytData.uploadUrl; 
        videoTitle = ytData.title || 'Import z YouTube';
        
        tempItem.title = `${videoTitle} (Przetwarzanie...)`;
        await dbSave(tempItem);
        refreshFromDb();
      }

      setStatus('Wysyłanie do AI...');

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST', 
        headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            audio_url: finalAudioUrl, 
            language_code: 'pl', 
            speaker_labels: true 
        })
      });
      
      if (!transcriptRes.ok) throw new Error("Błąd AssemblyAI");
      const { id } = await transcriptRes.json(); // To jest AssemblyID

      // --- KLUCZOWA ZMIANA: ZAPISUJEMY ASSEMBLY ID DO BAZY ---
      // Dzięki temu po odświeżeniu wiemy co sprawdzać
      const processingItem = { ...tempItem, assemblyId: id };
      await dbSave(processingItem);
      
      setIsProcessing(false); 
      setStatus('');

      checkStatus(id, tempId, videoTitle, apiKey);
      
    } catch (e: any) { 
        console.error(e);
        const errorItem = { ...tempItem, title: "BŁĄD IMPORTU", content: e.message, isProcessing: false };
        await dbSave(errorItem);
        await refreshFromDb();
        
        setIsProcessing(false);
        setStatus(`Błąd: ${e.message}`); 
        setTimeout(() => setStatus(''), 4000);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = '';
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
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) { e.preventDefault(); processFile(file); } 
        else { setInfoModal({ isOpen: true, title: 'Błąd', message: 'To nie audio.' }); }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isSettingsOpen, selectedItem, apiKey]);

  // --- ACTIONS (Other) ---
  const updateAndSave = async (updatedItem: HistoryItem) => {
      const itemWithNewDate = { ...updatedItem, date: new Date().toISOString() };
      await dbSave(itemWithNewDate);
      await refreshFromDb(); // Odśwież widok z bazy
      setSelectedItem(itemWithNewDate);
      triggerAutoSave(); 
  };

  const saveNewTitle = async () => {
    if (!selectedItem) { setIsEditingTitle(false); return; }
    const finalTitle = editedTitle.trim() || selectedItem.title; 
    const updatedItem = { ...selectedItem, title: finalTitle };
    await updateAndSave(updatedItem);
    setIsEditingTitle(false);
  };

  // --- EDITOR KEYDOWN ---
  const handleEditorKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (editorMode !== 'speaker' || e.key !== 'Enter') {
        if (editorMode === 'speaker' && e.key === 'Escape') setEditorMode('text');
        return;
    }

    e.preventDefault(); 

    const textarea = e.currentTarget;
    const cursor = textarea.selectionStart;
    const text = textarea.value;

    const lastNewLine = text.lastIndexOf('\n', cursor - 1);
    const startOfLine = lastNewLine === -1 ? 0 : lastNewLine + 1;
    const rawName = text.substring(startOfLine, cursor).trim();

    if (!rawName) {
        setEditorMode('text');
        return;
    }

    let finalName = rawName.toUpperCase();
    const existingSpeakers = getAllSpeakers().map(id => getSpeakerName(id).toUpperCase());
    
    let counter = 1;
    const baseName = finalName;
    while (existingSpeakers.includes(finalName)) {
        finalName = `${baseName}_${counter}`;
        counter++;
    }

    if (selectedItem) {
        const newId = `SPK_${Math.floor(Math.random() * 10000)}`;
        const newSpeakerNames = { ...(selectedItem.speakerNames || {}), [newId]: finalName };

        const textBeforeLine = text.substring(0, startOfLine);
        const textAfterCursor = text.substring(cursor);
        const prefix = startOfLine === 0 ? "" : "\n\n";
        const formattedBlock = `${prefix}${finalName}:\n`;
        const newContent = textBeforeLine + formattedBlock + textAfterCursor;

        const updatedItem = { 
            ...selectedItem, 
            speakerNames: newSpeakerNames,
            content: newContent 
        };
        
        await updateAndSave(updatedItem);
        
        const newCursorPos = startOfLine + formattedBlock.length;
        
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.value = newContent; 
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        });
    }

    setEditorMode('text');
  };

  // --- SPEAKER MANAGEMENT ---
  const handleSpeakerNameChange = async (speakerId: string, newName: string) => {
    if (!selectedItem) return;
    const currentDisplayName = getSpeakerName(speakerId);
    let finalNewName = newName.trim(); 
    if (!finalNewName || currentDisplayName === finalNewName) return;

    const otherSpeakersNames = getAllSpeakers()
        .filter(id => id !== speakerId)
        .map(id => getSpeakerName(id).toUpperCase());

    let counter = 1;
    const baseName = finalNewName;
    while (otherSpeakersNames.includes(finalNewName.toUpperCase())) {
        finalNewName = `${baseName}_${counter}`;
        counter++;
    }
    await executeRename(speakerId, finalNewName);
  };

  const executeRename = async (id: string, name: string) => {
      if (!selectedItem) return;
      const currentDisplayName = getSpeakerName(id);
      
      const newSpeakerNames = { ...(selectedItem.speakerNames || {}), [id]: name };
      
      let newContent = getDisplayText(selectedItem);
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapeRegExp(currentDisplayName)}\\s*:`, 'gm');
      newContent = newContent.replace(regex, `${name}:`);

      await updateAndSave({ 
          ...selectedItem, speakerNames: newSpeakerNames, content: newContent, utterances: [] 
      });
  };

const handleAddSpeaker = (name: string) => {
    if (!selectedItem) return;
    const finalName = name.trim().toUpperCase();
    if (!finalName) return;

    const newId = `SPK_${Math.floor(Math.random() * 10000)}`;
    const newSpeakerNames = { ...(selectedItem.speakerNames || {}), [newId]: finalName };

    const currentText = getDisplayText(selectedItem);
    const cursorPosition = lastCursorPos.current !== null ? lastCursorPos.current : currentText.length;
    const prefix = cursorPosition === 0 ? "" : "\n\n";
    const textToInsert = `${prefix}${finalName}:\n`;

    const newContent = 
        currentText.substring(0, cursorPosition) + 
        textToInsert + 
        currentText.substring(cursorPosition);

    const updatedItem = { 
        ...selectedItem, 
        speakerNames: newSpeakerNames,
        content: newContent 
    };
    
    updateAndSave(updatedItem);
    setIsAddSpeakerModalOpen(false);

    const newCursorPos = cursorPosition + textToInsert.length;
    setTimeout(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            textareaRef.current.blur();
            textareaRef.current.focus();
        }
    }, 100);
  };

  const handleDeleteSpeakerClick = (speakerId: string) => { setSpeakerToDelete(speakerId); };

  const confirmSpeakerDeletion = async () => {
    if (!selectedItem || !speakerToDelete) return;
    const displayName = getSpeakerName(speakerToDelete);
    const newSpeakerNames = { ...(selectedItem.speakerNames || {}) };
    delete newSpeakerNames[speakerToDelete];

    let newContent = getDisplayText(selectedItem);
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapeRegExp(displayName)}\\s*:\\s*`, 'gm');
    newContent = newContent.replace(regex, '');

    await updateAndSave({ 
        ...selectedItem, speakerNames: newSpeakerNames, content: newContent, utterances: [] 
    });
    setSpeakerToDelete(null);
  };

  const insertSpeakerAtCursor = async (speakerName: string) => {
    if (!textareaRef.current || !selectedItem) return;
    const textarea = textareaRef.current;
    const cursorPosition = (document.activeElement === textarea) ? textarea.selectionStart : lastCursorPos.current;
    const scrollTop = textarea.scrollTop;
    const currentText = getDisplayText(selectedItem);
    const textToInsert = `\n\n${speakerName}:\n`;

    const newContent = 
      currentText.substring(0, cursorPosition) + 
      textToInsert + 
      currentText.substring(cursorPosition);

    const updatedItem = { ...selectedItem, content: newContent, utterances: [] };
    await updateAndSave(updatedItem);

    const newCursorPos = cursorPosition + textToInsert.length;
    lastCursorPos.current = newCursorPos;

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.scrollTop = scrollTop;
      }
    });
  };

  const executeDeleteFile = async () => {
    if (!itemToDelete) return; 
    setIsProcessing(true);
    try {
        await dbDelete(itemToDelete);
        await refreshFromDb(); // Odśwież z bazy zamiast filtrować history
        triggerAutoSave(); 

        if (selectedItem?.id === itemToDelete.id) setSelectedItem(null);
        setIsDeleteModalOpen(false); 
        setItemToDelete(null);
    } catch (e) { console.error(e); } 
    finally { setIsProcessing(false); }
  };

  const executeDeleteAll = async () => {
    setIsProcessing(true);
    try {
        const allItems = await dbGetAll();
        for (const item of allItems) await dbDelete(item);
        
        await refreshFromDb(); // Baza pusta -> stan pusty
        setSelectedItem(null);
        await triggerAutoSave([]); 

        setIsDeleteAllModalOpen(false);
        setInfoModal({ isOpen: true, title: 'Gotowe', message: 'Wyczyszczono wszystko.' });
    } catch(e) { console.error(e); }
    finally { setIsProcessing(false); }
  };

  // --- CONTEXT MENU & DRAG ---
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); 
    const textarea = e.target as HTMLTextAreaElement;
    const selection = window.getSelection()?.toString().trim();

    setContextMenu({ 
        visible: true, 
        x: e.clientX, 
        y: e.clientY, 
        cursorIndex: textarea.selectionStart || 0,
        selectedText: selection && selection.length < 50 ? selection : null
    });
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
              <button onClick={() => loadFromCloud(false)} disabled={!pantryId || isProcessing} className={`flex-1 relative overflow-hidden flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${pobierzState ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 active:scale-95'}`}>
                {isProcessing && !status && !isDeleteModalOpen && !isDeleteAllModalOpen && (
                  <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                <span className={isProcessing && !status && !isDeleteModalOpen && !isDeleteAllModalOpen ? "animate-pulse" : ""}>{pobierzState ? 'Gotowe' : (isProcessing && !status ? 'Pobieranie...' : 'Aktualizuj')}</span>
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
                <div className="hero-subtitle"><span>Słuchaj</span> <span className="rune-divider">ᛟ</span> <span>Nagraj</span> <span className="rune-divider">ᛟ</span> <span>Twórz</span></div>
              </div>

              <div className="import-zone">
                {isProcessing && status ? (
                  <div className="flex flex-col items-center justify-center space-y-2 py-2 animate-in fade-in zoom-in duration-2000">
                    <TypewriterLoader message={status}/>
                  </div>
              ) : !apiKey ? (
                  <button onClick={() => { setSettingsStartTab('guide'); setIsSettingsOpen(true); }} className="btn-primary">Dodaj pierwsze nagranie</button>
                ) : (
                  <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
                    
                    <label onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} className={`btn-import w-full ${isDragging ? 'import-dragging' : ''}`}>
                      {isDragging ? 'Upuść tutaj!' : 'Wybierz plik audio'}
                      <input type="file"  className="hidden" accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.ogg,.aac,.wma,.aiff,.aif,.mov,.mp4,.m4v,.wmv,.avi,.webm" onChange={handleFileInput}  />
                    </label>

                    <div className="flex items-center gap-3 w-full opacity-30">
                        <div className="h-px bg-white flex-1"></div>
                        <span className="text-xs uppercase tracking-widest font-light">LUB Z LINKU</span>
                        <div className="h-px bg-white flex-1"></div>
                    </div>

                    <div className="flex w-full gap-2">
                        <div className="relative flex-1">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <LinkIcon />
                            </div>
                            <input 
                                type="text" 
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && processUrl()}
                                placeholder="YouTube, MP3 URL..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-white/30 focus:bg-white/10 transition-all outline-none"
                            />
                        </div>
                        <button 
                            onClick={processUrl}
                            disabled={!importUrl}
                            className="px-6 py-2 bg-white text-black font-bold rounded-xl text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Wczytaj
                        </button>
                    </div>

                  </div>
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

            <div className="speaker-list flex flex-wrap gap-2 mb-4">
            {getAllSpeakers().map((speakerId) => {
                const displayName = getSpeakerName(speakerId);
                return (
                <div key={speakerId} className="speaker-badge flex items-center gap-1 bg-white/5 p-1 rounded-md border border-white/10">
                    <button 
                        onMouseDown={(e) => { e.preventDefault(); insertSpeakerAtCursor(displayName); }}
                        className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold text-xl shadow-md transition-all active:scale-95 cursor-pointer" 
                        title="Wstaw nazwę w miejscu kursora"
                    >
                    +
                    </button>
                    
                    <button 
                        onClick={() => handleDeleteSpeakerClick(speakerId)} 
                        className="flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded transition-colors" 
                        title="Usuń rozmówcę z tekstu"
                    >
                        <TrashIcon /> 
                    </button>

                    <SpeakerRenameInput 
                        initialName={displayName}
                        onRename={(oldVal, newVal) => handleSpeakerNameChange(speakerId, newVal)}
                    />
                </div>
                );
            })}
            </div>

              <div className="flex items-center gap-1 mb-2 px-1">
                <button 
                    onClick={() => setEditorMode('text')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium transition-all ${
                        editorMode === 'text' 
                        ? 'bg-gray-100/40 dark:bg-gray-800 text-white border-b-2 border-blue-500' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <IconTextMode /> Edycja
                </button>

                <button 
                    onClick={() => {
                        setEditorMode('speaker');
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium transition-all ${
                        editorMode === 'speaker' 
                        ? 'bg-blue-600/20 text-blue-300 border-b-2 border-blue-500' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title="Kliknij, wpisz imię w tekście i wciśnij Enter"
                >
                    <IconSpeakerMode /> Nowy rozmówca
                </button>
                
                {editorMode === 'speaker' && (
                    <span className="ml-2 text-xs text-blue-400 animate-pulse">
                        Wpisz nazwę w edytorze i wciśnij Enter...
                    </span>
                )}
              </div>

              <div className="relative flex-1 w-full min-h-0">
               <textarea 
    key={selectedItem.id} 
    ref={textareaRef} 
    className={`w-full h-full p-8 pb-24 rounded-b-2xl rounded-tr-2xl font-mono text-base md:text-sm leading-relaxed border-2 focus:ring-0 resize-none outline-none transition-all duration-300
        ${editorMode === 'speaker' 
            ? 'border-transparent bg-gray-100/10 dark:bg-white-500/35' 
            : 'border-transparent bg-gray-100/40 dark:bg-gray-900/40'
        }`}
    value={getDisplayText(selectedItem)} 
    onChange={(e) => handleTextChange(e.target.value)} 
    
    onKeyDown={(e) => {
        handleEditorKeyDown(e);
    }}

    onSelect={handleCursorActivity}
    onClick={handleCursorActivity}
    onKeyUp={handleCursorActivity}
    onBlur={handleTextBlur}
    onContextMenu={handleContextMenu} 
    
    placeholder={editorMode === 'speaker' ? "WPISZ IMIĘ I WCIŚNIJ ENTER..." : "Treść nagrania..."}
/>
                <button onClick={() => { navigator.clipboard.writeText(getDisplayText(selectedItem)); setCopyState(true); setTimeout(() => setCopyState(false), 2000); }} className={`absolute top-4 right-4 p-2 rounded-lg transition-all ${copyState ? 'text-green-500' : 'text-gray-400'}`}>{copyState ? <CheckIcon /> : <IconCopy />}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} apiKey={apiKey} setApiKey={setApiKey} pantryId={pantryId} setPantryId={setPantryId} exportKeys={exportKeys} importKeys={importKeys} initialTab={settingsStartTab} />   
      <DeleteModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={executeDeleteFile} title={itemToDelete?.title} isLoading={isProcessing} />
      
      <DeleteModal 
          isOpen={!!speakerToDelete} 
          onClose={() => setSpeakerToDelete(null)} 
          onConfirm={confirmSpeakerDeletion} 
          title={speakerToDelete ? getSpeakerName(speakerToDelete) : ""} 
          header="Usuń rozmówcę"
          confirmLabel="Usuń"
          isLoading={isProcessing} 
      />

      <DeleteModal isOpen={isDeleteAllModalOpen} onClose={() => setIsDeleteAllModalOpen(false)} onConfirm={executeDeleteAll} title="WSZYSTKO" isLoading={isProcessing} />
      <InfoModal isOpen={infoModal.isOpen} title={infoModal.title} message={infoModal.message} onClose={() => setInfoModal({ ...infoModal, isOpen: false })} />
      <AddSpeakerModal isOpen={isAddSpeakerModalOpen} onClose={() => setIsAddSpeakerModalOpen(false)} onConfirm={handleAddSpeaker} />
    
    {contextMenu && contextMenu.visible && (
        <ContextMenu 
            x={contextMenu.x} 
            y={contextMenu.y} 
            speakers={getAllSpeakers()} 
            getSpeakerName={getSpeakerName} 
            onInsert={(speakerId) => insertSpeakerAtCursor(getSpeakerName(speakerId))} 
            onClose={() => setContextMenu(null)} 
            onNewSpeaker={() => setIsAddSpeakerModalOpen(true)} 
            onDragStart={startDrag} 
            selectedText={contextMenu.selectedText}
            onNewSpeakerFromSelection={(name) => {
                handleAddSpeaker(name);
                setContextMenu(null);
            }}
        />
      )}
    </main>
  );
}

// --- SPEAKER RENAME INPUT ---
const SpeakerRenameInput = ({ 
  initialName, 
  onRename 
}: { 
  initialName: string, 
  onRename: (oldName: string, newName: string) => void 
}) => {
  const [value, setValue] = useState(initialName);

  useEffect(() => {
    setValue(initialName);
  }, [initialName]);

  const handleBlur = () => {
    if (value !== initialName) {
      onRename(initialName, value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); 
    }
  };

  return (
    <input 
      className="speaker-input" 
      value={value} 
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="Nazwa..." 
    />
  );
};

// --- FUNKCJA CZYSZCZĄCA TEKST ---
const cleanTranscript = (text: string) => {
  if (!text) return "";

  let cleaned = text;

  const phrasesToRemove = [
    /Twój rozmówca zawiesił połączenie.*?rozmowę\./gi,
    /Prosimy poczekać\./gi,
    /Twój rozmówca zawiesił połączenie\./gi,
    /Wkrótce będziesz mógł kontynuować rozmowę\./gi,
    /Please wait\. Your call will be continued in a moment\./gi,
    /Please wait\./gi
  ];

  phrasesToRemove.forEach((regex) => {
    cleaned = cleaned.replace(regex, "");
  });

  const fillerWords = [
    "aha", "mhm", "yhm", "yyy", "eee", "umm"
  ];

  if (fillerWords.length > 0) {
    const fillerRegex = new RegExp(`\\b(${fillerWords.join('|')})[.,?!]?\\s*`, 'gi');
    cleaned = cleaned.replace(fillerRegex, "");
  }

  cleaned = cleaned
    .replace(/\s+/g, " ")          
    .replace(/\s+([.,?!])/g, "$1") 
    .replace(/,\s*,/g, ",")       
    .trim();

  return cleaned;
};