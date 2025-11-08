import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const data = await request.formData();
    const file = data.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    // Crear carpeta si no existe
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const filePath = path.join(uploadDir, file.name);
    await fs.promises.writeFile(filePath, buffer);

    console.log('✅ Imagen guardada en:', filePath);

    return NextResponse.json({ url: `/uploads/${file.name}` });
  } catch (error) {
    console.error('❌ Error en subida:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
