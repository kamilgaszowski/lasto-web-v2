import React, { useState } from 'react';
import { CloseIcon } from './Icons';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    apiKey: string;
    setApiKey: (key: string) => void;
    pantryId: string;
    setPantryId: (id: string) => void;
    exportKeys: () => void;
    importKeys: (e: React.ChangeEvent<HTMLInputElement>) => void;
    initialTab?: 'guide' | 'form'; // NOWE: Pozwala sterować zakładką startową
}

export const SettingsModal = ({ 
    isOpen, 
    onClose, 
    apiKey, 
    setApiKey, 
    pantryId, 
    setPantryId, 
    exportKeys, 
    importKeys,
    initialTab = 'form' // Domyślnie formularz
}: SettingsModalProps) => {
    // Ustawiamy stan początkowy na podstawie propsa
    const [tab, setTab] = useState<'guide' | 'form'>(initialTab);
    
    if (!isOpen) return null;

    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} className="settings-close-btn"><CloseIcon /></button>

          {/* MOBILE TABS */}
          <div className="flex md:hidden w-full border-b border-gray-800 bg-gray-900/50 shrink-0">
            <button onClick={() => setTab('form')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'form' ? 'text-white bg-gray-800 border-b-2 border-white' : 'text-gray-500'}`}>Ustawienia</button>
            <button onClick={() => setTab('guide')} className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest ${tab === 'guide' ? 'text-white bg-gray-800 border-b-2 border-white' : 'text-gray-500'}`}>Konfiguracja</button>
          </div>

          {/* GUIDE PANEL */}
         
          {/* GUIDE PANEL */}
          <div className={`guide-panel ${tab === 'guide' ? 'block' : 'hidden md:block'}`}>
            <h3 className="guide-heading">Przewodnik konfiguracji</h3>
            <div className="space-y-12">
              <div className="step-container">
                <div className="step-header"><span className="step-number">1</span><h4 className="step-title">Transkrypcja (AssemblyAI)</h4></div>
                <div className="step-content">
                  <p>Klucz API pozwala zamienić Twoje nagrania na tekst.</p>
                  <ul className="list-disc space-y-3 pl-4 font-medium">
                    <li>Zarejestruj się na <a href="https://www.assemblyai.com/" target="_blank" className="step-link">assemblyai.com. Przycisk <span>Get started</span></a></li>
                    <li>Mozesz zalogowac się swoim kontem Gmail. </li>
                     <li>Skopiuj klucz API oraz zaznacz w drugim kroku  "Notetaker", a w trzecim kroku "Test out the Playground".</li>
                    <li>Swój klucz znajdziesz tez w zakładce <span className="highlight-text">Dashboard.</span></li>
                  </ul>
                </div>
              </div>
              <div className="step-container">
                <div className="step-header"><span className="step-number">2</span><h4 className="step-title">Synchronizacja (Pantry)</h4></div>
                <div className="step-content">
                  <p>Dzięki Pantry ID historia Twoich nagrań będzie automatycznie zapisywana.</p>
                  <ul className="list-disc space-y-3 pl-4 font-medium">
                    <li>Wejdź na <a href="https://getpantry.cloud/" target="_blank" className="step-link">getpantry.cloud</a></li>
                    <li>Wpisz swój e-mail i kliknij Create a Pantry. Następnie wpisz swoje imię. Skopij ID. Po zamknięciu strony Pantry nie ma moliwośći powtórnego skopiowania ID. Zapisz je w bezpiecznym miejscu, aby mieć dostęp do historii nagrań.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>


          {/* FORM PANEL */}
          <div className={`form-panel ${tab === 'form' ? 'block' : 'hidden md:block'}`}>
            <h3 className="settings-heading">Ustawienia</h3>
            <div className="space-y-12">
              
              {/* ZMIANA: Ulepszony formularz dla menedżerów haseł */}
              <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); onClose(); }}>
                <div className="space-y-6">
                  
                  {/* AssemblyAI Input */}
                  <div className="input-group">
                    <label htmlFor="assembly-key" className="input-label">AssemblyAI Key</label>
                    <input 
                      id="assembly-key"
                      type="password" 
                      name="assembly-api-key" 
                      autoComplete="off" /* Wyłączamy auto-fill dla pierwszego klucza, żeby nie nadpisywał drugiego */
                      className="settings-input" 
                      value={apiKey} 
                      onChange={(e) => { setApiKey(e.target.value); localStorage.setItem('assemblyAIKey', e.target.value); }} 
                    />
                  </div>

                  {/* Pantry ID Input */}
                  <div className="input-group">
                    <label htmlFor="pantry-id" className="input-label">Pantry ID</label>
                    {/* Ukryty input username pomaga przeglądarce skojarzyć hasło z "kontem" */}
                    <input type="text" name="username" value="LastoUser" autoComplete="username" className="hidden" readOnly />
                    <input 
                      id="pantry-id"
                      type="password" 
                      name="pantry-cloud-id" 
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
                  <label className="btn-backup">Wczytaj plik <input type="file" className="hidden" accept=".json" onChange={importKeys} /></label>
                </div>
              </div>
              <button onClick={onClose} className="btn-submit">Gotowe</button>
            </div>
          </div>
        </div>
      </div>
    );
};