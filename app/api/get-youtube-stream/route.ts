import { NextResponse } from 'next/server';
import ytdl from 'ytdl-core'; // Wymaga: npm install ytdl-core

export const runtime = 'nodejs';
export const maxDuration = 60; 

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Vercel-Friendly] Start dla: ${url}`);

    // --- ŚCIEŻKA 1: YouTube (ytdl-core) ---
    // To rozwiązanie działa w Node.js bez zewnętrznych binarek (yt-dlp)
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        if (!ytdl.validateURL(url)) {
            throw new Error('Nieprawidłowy link YouTube');
        }

        console.log("   Pobieranie informacji o wideo...");
        const info = await ytdl.getInfo(url);
        
        // Wybieramy format audio (najlepiej mp4/audio)
        const format = ytdl.chooseFormat(info.formats, { 
            quality: 'highestaudio',
            filter: 'audioonly' 
        });

        if (!format || !format.url) {
            throw new Error('Nie znaleziono strumienia audio dla tego filmu.');
        }

        console.log("   ✅ Znaleziono bezpośredni link audio!");
        
        // Zamiast pobierać plik do nas, wysyłamy link bezpośrednio do AssemblyAI!
        // AssemblyAI potrafi pobrać plik z publicznego URL.
        const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: { 
                'Authorization': apiKey, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                audio_url: format.url, // Podajemy link do strumienia Google
                language_code: 'pl', 
                speaker_labels: true 
            })
        });

        if (!transcriptRes.ok) {
            const err = await transcriptRes.json();
            throw new Error(`AssemblyAI Error: ${err.error}`);
        }

        const transcriptData = await transcriptRes.json();
        
        // Zwracamy ID transkrypcji, ale udajemy strukturę uploadu, żeby frontend się nie pogubił
        // (Frontend oczekuje uploadUrl, ale tutaj od razu zleciliśmy transkrypcję)
        // Musimy to obsłużyć sprytnie: zwracamy specjalny sygnał.
        
        // UWAGA: To wymaga małej zmiany na frontendzie lub tutaj "oszukujemy".
        // Ponieważ Twój frontend w processUrl robi: 
        // 1. /api/get-youtube-stream -> dostaje uploadUrl
        // 2. /transcript -> zleca transkrypcję z tym URL
        
        // Żeby nie zmieniać frontendu, musimy zwrócić ten URL do audio.
        return NextResponse.json({ 
            uploadUrl: format.url,
            title: info.videoDetails.title
        });
    }

    // --- ŚCIEŻKA 2: Inne strony (Proxy) ---
    // Na Vercel nie odpalisz Puppeteera w wersji Hobby łatwo.
    // Dla Google Drive spróbujmy po prostu linku bezpośredniego.
    if (url.includes('drive.google.com')) {
         const idMatch = url.match(/[-\w]{25,}/);
         if (idMatch) {
             const fileId = idMatch[0];
             const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
             // Sprawdźmy czy to działa
             const check = await fetch(directUrl, { method: 'HEAD' });
             if (check.ok) {
                 return NextResponse.json({ 
                    uploadUrl: directUrl, 
                    title: "Google Drive Audio" 
                 });
             }
         }
    }

    throw new Error("Ten typ linku nie jest obsługiwany na serwerze Vercel (wymaga yt-dlp/puppeteer). Spróbuj pobrać plik ręcznie i użyć 'Wgraj plik'.");

  } catch (error: any) {
    console.error('Błąd Backend:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}