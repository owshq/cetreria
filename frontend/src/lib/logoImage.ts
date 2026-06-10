const MAX_LOGO_BYTES = 400_000;
const LOGO_MAX_SIZE = 512;
const MAX_FAVICON_BYTES = 100_000;
const FAVICON_MAX_SIZE = 128;

async function readImageFile(file: File, maxSize: number, maxBytes: number): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen valido.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });

  const compressed = await compressImageDataUrl(dataUrl, file.type, maxSize);
  if (compressed.length > maxBytes * 1.37) {
    throw new Error('La imagen es demasiado grande. Prueba con otra mas pequena.');
  }
  return compressed;
}

export async function readLogoFile(file: File): Promise<string> {
  return readImageFile(file, LOGO_MAX_SIZE, MAX_LOGO_BYTES);
}

export async function readFaviconFile(file: File): Promise<string> {
  return readImageFile(file, FAVICON_MAX_SIZE, MAX_FAVICON_BYTES);
}

function compressImageDataUrl(dataUrl: string, mimeType: string, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const usePng = mimeType.includes('png') || mimeType.includes('webp') || mimeType.includes('gif');
      resolve(canvas.toDataURL(usePng ? 'image/png' : 'image/jpeg', usePng ? undefined : 0.9));
    };
    image.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
    image.src = dataUrl;
  });
}
