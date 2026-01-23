import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';
import { Readable } from 'stream';

export const runtime = 'nodejs';

// Na Macu/Linux wpisz pełną ścieżkę (np. /opt/homebrew/bin/yt-dlp), na Windows wystarczy 'yt-dlp'
const YT_DLP_PATH = 'yt-dlp'; 

export async function POST(req: Request) {
  let browser = null;
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Stream-Import] Start dla: ${url}`);
    
    // --- ŚCIEŻKA 1: YouTube ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return await handleYoutubeWithYtDlp(url, apiKey, YT_DLP_PATH);
    }

    // --- ŚCIEŻKA 2: Google Drive (Szybka ścieżka) ---
    if (url.includes('drive.google.com')) {
        console.log("   Wykryto Google Drive - próba bezpośredniego strumieniowania...");
        try {
            const idMatch = url.match(/[-\w]{25,}/);
            if (idMatch) {
                const fileId = idMatch[0];
                const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                
                const res = await fetch(directUrl);
                const contentType = res.headers.get('content-type') || '';
                
                if (res.ok && res.body && (contentType.includes('audio') || contentType.includes('video') || contentType.includes('octet-stream'))) {
                    console.log("   ✅ Rozpoczynam strumieniowanie z Drive do AssemblyAI...");
                    // Przekazujemy strumień (body) dalej, bez buforowania w RAM
                    return await uploadStreamToAssembly(res.body, "Nagranie Google Drive", apiKey);
                }
                console.log("   ⚠️ Bezpośredni link zwrócił HTML/Błąd. Przełączam na Puppeteer.");
            }
        } catch (e) {
            console.warn("   Błąd szybkiej ścieżki Drive:", e);
        }
    }

    // --- ŚCIEŻKA 3: Puppeteer (Wszystko inne + Trudny Drive) ---
    console.log("   Uruchamianie przeglądarki (Puppeteer)...");
    
    browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("   Wchodzę na stronę...");
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Ekstrakcja linku (Ta sama logika co wcześniej)
    const audioSrc = await page.evaluate(() => {
        const getSrc = (el: any) => el?.src || el?.href || null;

        const audioSource = document.querySelector('audio source');
        if (audioSource) return (audioSource as HTMLSourceElement).src;

        const audio = document.querySelector('audio');
        if (audio) return (audio as HTMLAudioElement).src;
        
        const video = document.querySelector('video');
        if (video) return (video as HTMLVideoElement).src;

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
        throw new Error('Nie znaleziono pliku audio na stronie.');
    }

    console.log(`   ✅ Znaleziono źródło: ${audioSrc.substring(0, 50)}...`);

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    browser = null;

    console.log("   Pobieranie strumienia...");
    
    // Pobieramy plik jako strumień
    const audioRes = await fetch(audioSrc, {
        headers: { 
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    if (!audioRes.ok || !audioRes.body) throw new Error(`Serwer źródłowy odrzucił połączenie: ${audioRes.status}`);

    // Sprawdzenie nagłówków (Bramkarz) - tu czytamy tylko nagłówki, nie treść
    const cType = audioRes.headers.get('content-type') || '';
    if (cType.includes('text/html')) {
        throw new Error('Pobrano stronę HTML zamiast pliku audio.');
    }

    console.log("   ✅ Strumieniowanie do AssemblyAI...");
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

    // Konwersja Web Stream na Node Stream (dla kompatybilności)
    // @ts-ignore
    const nodeStream = stream.pipe ? stream : Readable.fromWeb(stream);

    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream'
        },
        body: nodeStream,
        // @ts-ignore - 'duplex' jest wymagany w nowszych Node.js dla strumieni w fetch
        duplex: 'half' 
    });

    if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Błąd uploadu AssemblyAI: ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("   🚀 Upload zakończony sukcesem!");

    return NextResponse.json({ 
        uploadUrl: uploadData.upload_url,
        title: title
    });
}

// --- HELPER: YOUTUBE (Z yt-dlp jako strumień) ---
async function handleYoutubeWithYtDlp(url: string, apiKey: string, ytPath: string) {
    console.log("   Uruchamianie yt-dlp w trybie strumieniowym...");
    
    // Najpierw pobieramy tytuł (szybka operacja)
    let title = 'YouTube Video';
    try {
        const titleProcess = spawn(ytPath, ['--print', 'title', url]);
        titleProcess.stdout.on('data', (d) => { title = d.toString().trim(); });
        await new Promise((resolve) => titleProcess.on('close', resolve));
    } catch(e) {}

    // Główny proces - pobieranie audio na stdout
    const process = spawn(ytPath, [
        '-f', 'bestaudio/best',
        '--no-playlist',
        '-o', '-', // Wypisz na stdout
        url
    ]);

    // Przekierowujemy stdout procesu bezpośrednio do AssemblyAI
    // Nie czekamy na koniec pobierania!
    return await uploadStreamToAssembly(process.stdout, title, apiKey);
}