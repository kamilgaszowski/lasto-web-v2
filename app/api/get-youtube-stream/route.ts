import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';
import { Readable } from 'stream';

export const runtime = 'nodejs';
// Próba zwiększenia limitu (zadziała tylko na planach Pro, na Hobby jest ignorowane i wynosi 10s)
export const maxDuration = 60; 

const YT_DLP_PATH = 'yt-dlp'; 

export async function POST(req: Request) {
  let browser = null;
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Fast-Stream] Start dla: ${url}`);
    
    // --- ŚCIEŻKA 1: YouTube (Zoptymalizowana) ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return await handleYoutubeWithYtDlp(url, apiKey, YT_DLP_PATH);
    }

    // --- ŚCIEŻKA 2: Google Drive ---
    if (url.includes('drive.google.com')) {
        console.log("   Drive: Próba bezpośrednia...");
        try {
            const idMatch = url.match(/[-\w]{25,}/);
            if (idMatch) {
                const fileId = idMatch[0];
                const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                
                const res = await fetch(directUrl);
                const contentType = res.headers.get('content-type') || '';
                
                if (res.ok && res.body && (contentType.includes('audio') || contentType.includes('video') || contentType.includes('octet-stream'))) {
                    return await uploadStreamToAssembly(res.body, "Nagranie Google Drive", apiKey);
                }
            }
        } catch (e) {
            console.warn("   Błąd Drive:", e);
        }
    }

    // --- ŚCIEŻKA 3: Puppeteer ---
    console.log("   Uruchamianie Puppeteer...");
    
    browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Timeout skrócony do 15s, żeby szybciej wykryć problem
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const audioSrc = await page.evaluate(() => {
        const audioSource = document.querySelector('audio source');
        if (audioSource) return (audioSource as HTMLSourceElement).src;
        const audio = document.querySelector('audio');
        if (audio) return (audio as HTMLAudioElement).src;
        const video = document.querySelector('video');
        if (video) return (video as HTMLVideoElement).src;
        
        // Szukanie linków
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

    if (!audioSrc) throw new Error('Nie znaleziono pliku audio.');

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    browser = null;

    console.log("   Pobieranie strumienia...");
    const audioRes = await fetch(audioSrc, {
        headers: { 'Cookie': cookieString, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!audioRes.ok || !audioRes.body) throw new Error(`Błąd źródła: ${audioRes.status}`);

    return await uploadStreamToAssembly(audioRes.body, pageTitle || 'Import WWW', apiKey);

  } catch (error: any) {
    if (browser) await browser.close();
    console.error('Błąd Backend:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- HELPER: UPLOAD ---
async function uploadStreamToAssembly(stream: ReadableStream<Uint8Array> | Readable | null, title: string, apiKey: string) {
    if (!stream) throw new Error("Brak strumienia danych.");

    // @ts-ignore
    const nodeStream = stream.pipe ? stream : Readable.fromWeb(stream);

    // Rozpoczynamy upload NATYCHMIAST
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream'
        },
        body: nodeStream as any, 
        // @ts-ignore
        duplex: 'half' 
    });

    if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Błąd AssemblyAI: ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    
    return NextResponse.json({ 
        uploadUrl: uploadData.upload_url,
        title: title
    });
}

// --- HELPER: YOUTUBE (SUPERSZYBKI) ---
async function handleYoutubeWithYtDlp(url: string, apiKey: string, ytPath: string) {
    console.log("   yt-dlp stream start...");
    
    // USUNIĘTO POBIERANIE TYTUŁU - TO BYŁO WĄSKIE GARDŁO (504 ERROR)
    // Używamy URL jako tymczasowego tytułu, użytkownik zmieni go sobie później
    // albo AssemblyAI samo coś zaproponuje w tagach (jeśli używasz ich funkcji).
    const fallbackTitle = "Import YouTube";

    const process = spawn(ytPath, [
        '-f', 'bestaudio/best',
        '--no-playlist',
        '--no-check-certificates', // Przyspiesza start
        '--no-warnings',
        '--prefer-free-formats',
        '-o', '-', // stdout
        url
    ]);

    // Jeśli yt-dlp wyrzuci błąd na starcie, chcemy o tym wiedzieć
    process.stderr.on('data', (data) => {
        const msg = data.toString();
        // Ignorujemy ostrzeżenia, reagujemy tylko na błędy krytyczne
        if (msg.includes('ERROR:')) console.error('yt-dlp error:', msg);
    });

    return await uploadStreamToAssembly(process.stdout, fallbackTitle, apiKey);
}