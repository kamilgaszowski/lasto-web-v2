import { NextResponse } from 'next/server';
import ytdl from 'ytdl-core'; // Biblioteka JS do YouTube
import { Readable } from 'stream';

export const runtime = 'nodejs';
export const maxDuration = 60; // Maksymalny czas dla Vercel Pro (Hobby ma 10s)

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) return NextResponse.json({ error: 'Brak klucza API' }, { status: 401 });

    console.log(`1. [Vercel-Stream] Start dla: ${url}`);

    // --- ŚCIEŻKA 1: YouTube (Czysty Node.js) ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        if (!ytdl.validateURL(url)) {
            throw new Error('Nieprawidłowy URL YouTube');
        }

        console.log("   Pobieranie informacji o wideo (ytdl)...");
        // 1. Pobieramy informacje o wideo
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title || 'YouTube Video';

        // 2. Wybieramy format audio
        const format = ytdl.chooseFormat(info.formats, { 
            quality: 'highestaudio', 
            filter: 'audioonly' 
        });

        if (!format) throw new Error('Nie znaleziono ścieżki audio.');

        console.log(`   Start strumieniowania: ${title}`);

        // 3. Pobieramy strumień prosto z YouTube
        const ytStream = ytdl.downloadFromInfo(info, { format: format });

        // 4. Wysyłamy strumień prosto do AssemblyAI
        return await uploadStreamToAssembly(ytStream, title, apiKey);
    }

    // --- ŚCIEŻKA 2: Google Drive (Bezpośredni link) ---
    if (url.includes('drive.google.com')) {
        console.log("   Google Drive...");
        const idMatch = url.match(/[-\w]{25,}/);
        if (idMatch) {
            const fileId = idMatch[0];
            const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            
            const res = await fetch(directUrl);
            // Jeśli to plik audio, przesyłamy go dalej
            if (res.ok && res.body) {
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('audio') || contentType.includes('video') || contentType.includes('octet-stream')) {
                     return await uploadStreamToAssembly(res.body, "Nagranie Google Drive", apiKey);
                }
            }
        }
        throw new Error("Nie udało się pobrać pliku z Google Drive (może wymagać logowania/skanowania). Pobierz plik na dysk i wgraj ręcznie.");
    }

    // --- INNE STRONY ---
    throw new Error("Na serwerze Vercel obsługiwane są tylko linki YouTube i bezpośrednie pliki Google Drive. Dla innych serwisów pobierz plik i użyj opcji 'Wgraj plik'.");

  } catch (error: any) {
    console.error('Błąd Backend:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// --- HELPER: STRUMIENIOWY UPLOAD DO ASSEMBLY ---
async function uploadStreamToAssembly(stream: ReadableStream<Uint8Array> | Readable | null, title: string, apiKey: string) {
    if (!stream) throw new Error("Brak strumienia danych.");

    // Konwersja dla kompatybilności
    // @ts-ignore
    const nodeStream = stream.pipe ? stream : Readable.fromWeb(stream);

    console.log("   Wysyłanie do AssemblyAI...");

    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/octet-stream'
        },
        body: nodeStream as any, // 'as any' naprawia błąd kompilacji TS
        // @ts-ignore
        duplex: 'half' 
    });

    if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Błąd AssemblyAI: ${errText}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("   ✅ Upload zakończony!");

    return NextResponse.json({ 
        uploadUrl: uploadData.upload_url,
        title: title
    });
}