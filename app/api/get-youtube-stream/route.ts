import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';
import { Readable } from 'stream';

export const runtime = 'nodejs';

// Na Renderze (Docker) yt-dlp jest w PATH. 
// Na Windows lokalnie upewnij się, że masz yt-dlp.exe w folderze lub w PATH.
const YT_DLP_PATH = 'yt-dlp'; 

// Helper: Sprawdza czy jesteśmy w Dockerze i czy mamy podaną ścieżkę do Chrome
const getBrowserPath = () => {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    return null; // Lokalnie zwróci null, więc Puppeteer użyje swojej domyślnej wersji
};

export async function POST(req: Request) {
  let browser = null;
  
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Hybrid-Backend] Start dla: ${url}`);
    
    // --- ŚCIEŻKA 1: YouTube (Używa systemowego yt-dlp - najstabilniejsze) ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return await handleYoutubeWithYtDlp(url, apiKey, YT_DLP_PATH);
    }

    // --- ŚCIEŻKA 2: Reszta świata (Puppeteer) ---
    // Google Drive, TapeACall, inne strony
    console.log("   Uruchamianie przeglądarki (Puppeteer)...");
    
    const launchOptions: any = {
        headless: true,
        args: [
            '--no-sandbox',               // WYMAGANE dla Dockera/Render
            '--disable-setuid-sandbox',   // WYMAGANE dla Dockera
            '--disable-dev-shm-usage',    // Zapobiega wywalaniu się pamięci w kontenerze
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ]
    };

    // Jeśli Dockerfile ustawił ścieżkę do Chrome, używamy jej
    const sysChrome = getBrowserPath();
    if (sysChrome) {
        console.log(`   [Docker] Używam systemowego Chrome: ${sysChrome}`);
        launchOptions.executablePath = sysChrome;
    } else {
        console.log("   [Local] Używam domyślnego Chrome z Puppeteer");
    }

    browser = await puppeteer.launch(launchOptions);
    
    const page = await browser.newPage();
    // Udajemy zwykłego użytkownika Windowsa (omija proste blokady botów)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("   Wchodzę na stronę...");
    // Dajemy mu chwilę (timeout 60s), bo Render czasem muli
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Skrypt wstrzykiwany w stronę, szuka linku audio
    const audioSrc = await page.evaluate(() => {
        const getSrc = (el: any) => el?.src || el?.href || null;

        // 1. Tag <source>
        const audioSource = document.querySelector('audio source');
        if (audioSource) return (audioSource as HTMLSourceElement).src;

        // 2. Tag <audio>
        const audio = document.querySelector('audio');
        if (audio) return (audio as HTMLAudioElement).src;
        
        // 3. Tag <video>
        const video = document.querySelector('video');
        if (video) return (video as HTMLVideoElement).src;

        // 4. Linki "Pobierz" (np. Google Drive export)
        const links = Array.from(document.querySelectorAll('a'));
        const directLink = links.find(a => {
            const href = (a as HTMLAnchorElement).href || '';
            return (href.includes('export=download') || href.includes('.mp3') || href.includes('.m4a')) 
                && !href.includes('google.com/url?');
        });
        
        if (directLink) return (directLink as HTMLAnchorElement).href;

        return null;
    });

    const pageTitle = await page.title();

    if (!audioSrc) {
        throw new Error('Nie znaleziono pliku audio na stronie (Puppeteer).');
    }

    console.log(`   ✅ Znaleziono link: ${audioSrc.substring(0, 50)}...`);

    // Pobieramy ciasteczka, żeby autoryzacja Drive przeszła dalej
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    browser = null;

    console.log("   Pobieranie strumienia (Fetch)...");
    
    const audioRes = await fetch(audioSrc, {
        headers: { 
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!audioRes.ok || !audioRes.body) throw new Error(`Serwer źródłowy odrzucił połączenie: ${audioRes.status}`);

    return await uploadStreamToAssembly(audioRes.body, pageTitle || 'Import WWW', apiKey);

  } catch (error: any) {
    if (browser) await browser.close();
    console.error('Błąd Backend:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- HELPER: STRUMIENIOWY UPLOAD DO ASSEMBLY ---
async function uploadStreamToAssembly(stream: ReadableStream<Uint8Array> | Readable | null, title: string, apiKey: string) {
    if (!stream) throw new Error("Brak strumienia danych.");

    // Konwersja Web Stream -> Node Stream
    // @ts-ignore
    const nodeStream = stream.pipe ? stream : Readable.fromWeb(stream);

    console.log("   Wysyłanie do AssemblyAI...");

    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream'
        },
        body: nodeStream as any, // 'as any' naprawia błąd typów przy buildzie
        // @ts-ignore - wymagane dla Node.js
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

// --- HELPER: YOUTUBE (yt-dlp binary) ---
async function handleYoutubeWithYtDlp(url: string, apiKey: string, ytPath: string) {
    console.log("   Uruchamianie yt-dlp...");
    
    // 1. Pobieranie tytułu
    let title = 'YouTube Video';
    try {
        const titleProcess = spawn(ytPath, ['--print', 'title', url]);
        titleProcess.stdout.on('data', (d) => { title = d.toString().trim(); });
        await new Promise((resolve) => titleProcess.on('close', resolve));
    } catch(e) {}

    // 2. Pobieranie strumienia audio
    const process = spawn(ytPath, [
        '-f', 'bestaudio/best',
        '--no-playlist',
        '-o', '-', // stdout
        url
    ]);

    // Logowanie błędów yt-dlp (pomocne na Renderze)
    process.stderr.on('data', (data) => {
        const msg = data.toString();
        // Ignorujemy paski postępu, pokazujemy tylko błędy
        if (msg.includes('ERROR') || msg.includes('WARNING')) console.log(`[yt-dlp] ${msg}`);
    });

    return await uploadStreamToAssembly(process.stdout, title, apiKey);
}