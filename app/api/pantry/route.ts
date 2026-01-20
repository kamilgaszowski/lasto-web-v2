import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

  // Serwer łączy się z Pantry (AdBlock tego nie widzi)
  const res = await fetch(`https://getpantry.cloud/apiv1/pantry/${id}/basket/lastoHistory?t=${Date.now()}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store'
  });

  if (!res.ok) {
    if (res.status === 404) return NextResponse.json({ empty: true }, { status: 404 });
    return NextResponse.json({ error: 'Pantry error' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, data } = body;

    if (!id || !data) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

    const res = await fetch(`https://getpantry.cloud/apiv1/pantry/${id}/basket/lastoHistory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!res.ok) return NextResponse.json({ error: 'Save failed' }, { status: res.status });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}