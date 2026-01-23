import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';
import { Readable } from 'stream';

export const runtime = 'nodejs';

// UWAGA: Na Windows upewnij się, że 'yt-dlp' jest w PATH lub podaj pełną ścieżkę do pliku .exe
// np. const YT_DLP_PATH = 'C:\\Tools\\yt-dlp.exe';
const YT_DLP_PATH = 'yt-dlp'; 

export async function POST(req: Request) {
  let browser = null;
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Local-Power] Start dla: ${url}`);
    
    // --- ŚCIEŻKA 1: YouTube (Używa systemowego yt-dlp) ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return await handleYoutubeWithYtDlp(url, apiKey, YT_DLP_PATH);
    }

    // --- ŚCIEŻKA 2: Reszta świata (Używa pełnego Puppeteera) ---
    // To obsłuży Google Drive, TapeACall i każdą inną stronę
    console.log("   Uruchamianie pełnej przeglądarki (Puppeteer)...");
    
 browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ]
    });
    
    const page = await browser.newPage();
    // Udajemy zwykłego użytkownika
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("   Wchodzę na stronę...");
    // Długi timeout dla ciężkich stron
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wyciąganie linku bezpośredniego
    const audioSrc = await page.evaluate(() => {
        // Funkcja pomocnicza do bezpiecznego pobierania src
        const getSrc = (el: any) => el?.src || el?.href || null;

        // 1. Szukamy w <audio source> (częste w Drive/TapeACall)
        const audioSource = document.querySelector('audio source');
        if (audioSource) return (audioSource as HTMLSourceElement).src;

        // 2. Szukamy w <audio>
        const audio = document.querySelector('audio');
        if (audio) return (audio as HTMLAudioElement).src;
        
        // 3. Szukamy w <video> (czasem audio jest w playerze wideo)
        const video = document.querySelector('video');
        if (video) return (video as HTMLVideoElement).src;

        // 4. Szukamy przycisków pobierania (np. Google Drive "Download anyway")
        const links = Array.from(document.querySelectorAll('a'));
        const directLink = links.find(a => {
            const href = (a as HTMLAnchorElement).href || '';
            // Szukamy linków, które wyglądają na pliki lub akcje pobierania
            return (href.includes('export=download') || href.includes('.mp3') || href.includes('.m4a')) 
                && !href.includes('google.com/url?');
        });
        
        if (directLink) return (directLink as HTMLAnchorElement).href;

        return null;
    });

    const pageTitle = await page.title();

    if (!audioSrc) {
        throw new Error('Nie znaleziono pliku audio na stronie (Puppeteer nie widzi playera ani linku).');
    }

    console.log(`   ✅ Znaleziono link źródłowy: ${audioSrc.substring(0, 60)}...`);

    // Pobieramy ciasteczka z Puppeteera i przekazujemy do fetch
    // To KLUCZOWE dla Google Drive, żeby autoryzacja przeszła
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    browser = null;

    console.log("   Pobieranie strumienia z ciasteczkami...");
    
    const audioRes = await fetch(audioSrc, {
        headers: { 
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!audioRes.ok || !audioRes.body) throw new Error(`Serwer źródłowy odrzucił połączenie: ${audioRes.status}`);

    // Przekazujemy strumień (body) bezpośrednio do AssemblyAI
    return await uploadStreamToAssembly(audioRes.body, pageTitle || 'Import WWW', apiKey);

  } catch (error: any) {
    if (browser) await browser.close();
    console.error('Błąd Backend:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- HELPER: STRUMIENIOWY UPLOAD ---
async function uploadStreamToAssembly(stream: ReadableStream<Uint8Array> | Readable | null, title: string, apiKey: string) {
    if (!stream) throw new Error("Brak strumienia danych.");

    // Konwersja Web Stream na Node Stream (dla fetch w Node.js)
    // @ts-ignore
    const nodeStream = stream.pipe ? stream : Readable.fromWeb(stream);

    console.log("   Wysyłanie do AssemblyAI...");

    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream'
        },
        body: nodeStream as any, // 'as any' naprawia błędy typów TS
        // @ts-ignore - wymagane w Node.js
        duplex: 'half' 
    });

    if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`AssemblyAI Error: ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("   ✅ Upload zakończony!");

    return NextResponse.json({ 
        uploadUrl: uploadData.upload_url,
        title: title
    });
}

// --- HELPER: YOUTUBE (Lokalny yt-dlp) ---
async function handleYoutubeWithYtDlp(url: string, apiKey: string, ytPath: string) {
    console.log("   Uruchamianie lokalnego yt-dlp...");
    
    // 1. Pobieranie tytułu
    let title = 'YouTube Video';
    try {
        const titleProcess = spawn(ytPath, ['--print', 'title', url]);
        titleProcess.stdout.on('data', (d) => { title = d.toString().trim(); });
        await new Promise((resolve) => titleProcess.on('close', resolve));
    } catch(e) {}

    // 2. Pobieranie audio na stdout (strumień)
    const process = spawn(ytPath, [
        '-f', 'bestaudio/best', // Najlepsze audio
        '--no-playlist',
        '-o', '-', // Wypisz na standardowe wyjście (pipe)
        url
    ]);

    // Przekazujemy strumień z yt-dlp prosto do funkcji uploadu
    return await uploadStreamToAssembly(process.stdout, title, apiKey);
}