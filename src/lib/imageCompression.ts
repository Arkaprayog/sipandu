/** Reduce large phone photos before keeping them in browser storage or a Firestore record. */
export async function compressImageForLocalStorage(
  file: Blob,
  maxDimension = 1200,
  maxBytes = 320 * 1024,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih berkas foto dengan format gambar (JPG, PNG, atau format yang didukung browser).');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Ukuran foto terlalu besar (lebih dari 20 MB). Pilih foto atau gambar yang lebih kecil.');
  }

  let bitmap: ImageBitmap | null = null;
  let objectUrl = '';
  let imageElement: HTMLImageElement | null = null;
  let width = 0;
  let height = 0;
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        width = bitmap.width;
        height = bitmap.height;
      } catch {
        bitmap = null;
      }
    }
    if (!bitmap) {
      objectUrl = URL.createObjectURL(file);
      imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Browser tidak dapat membaca foto ini. Gunakan JPG atau PNG.'));
        image.src = objectUrl;
      });
      width = imageElement.naturalWidth;
      height = imageElement.naturalHeight;
    }
    if (!width || !height) throw new Error('Dimensi foto tidak valid atau file rusak.');

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser tidak dapat mempersiapkan kanvas foto.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap || imageElement!, 0, 0, canvas.width, canvas.height);

    let quality = 0.78;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) break;
      quality = Math.max(0.42, quality - 0.09);
    }
    if (!blob) throw new Error('Foto tidak dapat dikompres oleh browser.');
    if (blob.size > maxBytes * 1.2) {
      throw new Error('Foto masih terlalu besar setelah kompresi. Pilih foto dengan ukuran lebih kecil.');
    }

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Hasil kompresi foto tidak dapat dibaca.'));
      reader.onerror = () => reject(new Error('Gagal menyimpan foto hasil kompresi.'));
      reader.readAsDataURL(blob!);
    });
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
