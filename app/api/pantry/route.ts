import { NextResponse } from 'next/server';

// 1. WYMUSZENIE BRAKU CACHE W NEXT.JS
export const dynamic = 'force-dynamic';
export const revalidate = 0; 

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  try {
    // 2. Pobieramy z Pantry z unikalnym timestampem
    const res = await fetch(`https://getpantry.cloud/apiv1/pantry/${id}/basket/lastoHistory?t=${Date.now()}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      next: { revalidate: 0 } // Dodatkowe zabezpieczenie dla Next.js fetch
    });

    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ empty: true }, { status: 404 });
      return NextResponse.json({ error: 'Pantry error' }, { status: res.status });
    }

    const data = await res.json();

    // 3. Odsyłamy dane z "Atomowymi" nagłówkami anty-cache
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'CDN-Cache-Control': 'no-store', // Dla Vercel/Cloudflare
        'Vercel-CDN-Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, data } = body;

    if (!id || !data) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    const res = await fetch(`https://getpantry.cloud/apiv1/pantry/${id}/basket/lastoHistory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        cache: 'no-store'
    });

    if (!res.ok) return NextResponse.json({ error: 'Save failed' }, { status: res.status });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}