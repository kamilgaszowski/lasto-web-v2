import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';

const YT_DLP_PATH = 'yt-dlp'; 

export async function POST(req: Request) {
  let browser = null;
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Smart-Import] Start dla: ${url}`);
    
    // --- ŚCIEŻKA 1: YouTube ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return await handleYoutubeWithYtDlp(url, apiKey, YT_DLP_PATH);
    }

    // --- ŚCIEŻKA 2: Google Drive (Szybka ścieżka bez przeglądarki) ---
    if (url.includes('drive.google.com')) {
        console.log("   Wykryto Google Drive - próba szybkiego pobierania...");
        try {
            const idMatch = url.match(/[-\w]{25,}/);
            if (idMatch) {
                const fileId = idMatch[0];
                const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                
                const res = await fetch(directUrl);
                const contentType = res.headers.get('content-type') || '';
                
                // Jeśli dostaliśmy plik audio/video/strumień, a nie HTML
                if (res.ok && (contentType.includes('audio') || contentType.includes('video') || contentType.includes('octet-stream'))) {
                    console.log("   ✅ Udało się pobrać bezpośrednio z Drive!");
                    const arrayBuf = await res.arrayBuffer();
                    return await uploadToAssembly(Buffer.from(arrayBuf), "Nagranie Google Drive", apiKey);
                }
                console.log("   ⚠️ Szybkie pobieranie zwróciło HTML. Przełączam na Puppeteer.");
            }
        } catch (e) {
            console.warn("   Błąd szybkiej ścieżki Drive:", e);
        }
    }

    // --- ŚCIEŻKA 3: Puppeteer (Wszystkie inne strony + trudny Drive/TapeACall) ---
    console.log("   Uruchamianie przeglądarki (Puppeteer)...");
    
    browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    // Udajemy Chrome na Windows dla maksymalnej zgodności
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("   Wchodzę na stronę...");
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // --- EKSTRAKCJA LINKU (NAPRAWIONE TYPY TYPESCRIPT) ---
    const audioSrc = await page.evaluate(() => {
        // 1. Sprawdź tag <source> wewnątrz <audio> (Dysk Google tak robi)
        const audioSource = document.querySelector('audio source');
        if (audioSource) {
            const src = (audioSource as HTMLSourceElement).src;
            if (src) return src;
        }

        // 2. Sprawdź tag <audio> bezpośrednio
        const audio = document.querySelector('audio');
        if (audio) {
            const src = (audio as HTMLAudioElement).src;
            if (src) return src;
        }
        
        // 3. Sprawdź tag <video>
        const video = document.querySelector('video');
        if (video) {
            const src = (video as HTMLVideoElement).src;
            if (src) return src;
        }

        // 4. Szukaj linków "Pobierz" (Anchor tags)
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
        throw new Error('Nie znaleziono pliku audio (sprawdzono audio, source, video i linki).');
    }

    console.log(`   ✅ Znaleziono link źródłowy: ${audioSrc.substring(0, 60)}...`);

    // Pobieramy ciasteczka (krytyczne dla Drive, aby utrzymać sesję)
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    browser = null;

    console.log("   Pobieranie pliku z użyciem ciasteczek sesji...");
    
    const audioRes = await fetch(audioSrc, {
        headers: { 
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!audioRes.ok) throw new Error(`Serwer źródłowy odrzucił pobieranie: ${audioRes.status}`);
    
    const arrayBuf = await audioRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);

    // BRAMKARZ HTML: Sprawdzamy czy nie pobraliśmy strony błędu
    const header = audioBuffer.subarray(0, 50).toString().trim().toLowerCase();
    if (header.startsWith('<!doctype') || header.startsWith('<html')) {
        throw new Error('Pobrano stronę HTML zamiast pliku audio. Link może wymagać interakcji użytkownika (np. skan antywirusowy).');
    }

    return await uploadToAssembly(audioBuffer, pageTitle || 'Import WWW', apiKey);

  } catch (error: any) {
    if (browser) await browser.close();
    console.error('Błąd Backend:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- Helper: Upload do AssemblyAI ---
async function uploadToAssembly(buffer: Buffer, title: string, apiKey: string) {
    console.log(`2. Upload do AssemblyAI (${(buffer.length / 1024 / 1024).toFixed(2)} MB)...`);
    
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream'
        },
        // Rzutowanie na any, aby uniknąć błędu TS "BodyInit" przy Bufferze w Node.js
        body: buffer as any
    });

    if (!uploadResponse.ok) throw new Error(await uploadResponse.text());
    const uploadData = await uploadResponse.json();

    return NextResponse.json({ 
        uploadUrl: uploadData.upload_url,
        title: title
    });
}

// --- Helper: YouTube (bez zmian) ---
async function handleYoutubeWithYtDlp(url: string, apiKey: string, ytPath: string) {
    const runYtDlp = (args: string[]): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
            const process = spawn(ytPath, args);
            const chunks: Uint8Array[] = [];
            process.stdout.on('data', (c) => chunks.push(c));
            process.on('close', () => chunks.length ? resolve(Buffer.concat(chunks)) : resolve(Buffer.from([])));
        });
    };

    let title = 'YouTube Video';
    try {
        const t = await runYtDlp(['--print', 'title', url]);
        if(t.length) title = t.toString().trim();
    } catch(e){}

    const audioBuffer = await runYtDlp(['-f', 'bestaudio', '--no-playlist', '-o', '-', url]);
    if (audioBuffer.length === 0) throw new Error('yt-dlp nie pobrał danych.');

    return await uploadToAssembly(audioBuffer, title, apiKey);
}