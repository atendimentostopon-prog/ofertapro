import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

/**
 * Utilitário de timeout para envolver Promises e evitar loading infinito
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`A operação (${label}) demorou muito tempo (limite de ${ms / 1000}s). Tente novamente com um arquivo menor.`)), ms)
    )
  ]);
}

/**
 * Comprime uma imagem antes do upload sem travar a thread (WebWorker desativado para compatibilidade)
 * @param file Arquivo original
 */
export const compressImage = async (file: File): Promise<File> => {
  const options = {
    maxSizeMB: 0.8, // Menos de 1MB
    maxWidthOrHeight: 1200,
    useWebWorker: false, // IMPORTANTE: useWebWorker true causa travamentos em Electron/Ambientes de sandbox
    fileType: 'image/jpeg'
  };

  console.log("[IMAGE_UPLOAD] compression start", { name: file.name, size: file.size });
  try {
    // Timeout de 15 segundos para a compressão
    const compressedFile = await withTimeout(
      imageCompression(file, options),
      15000,
      "Compressão da imagem"
    );
    console.log("[IMAGE_UPLOAD] compression success", { originalSize: file.size, compressedSize: compressedFile.size });
    return compressedFile;
  } catch (error: any) {
    console.error('[IMAGE_UPLOAD] Erro ou timeout na compressão:', error);
    // Se a compressão falhar ou estourar timeout, mas o arquivo original estiver dentro do aceitável, usa o original
    if (file.size <= 5 * 1024 * 1024) {
      console.log("[IMAGE_UPLOAD] Usando arquivo original devido a falha/timeout na compressão:", file.size);
      return file;
    }
    // eslint-disable-next-line preserve-caught-error
    throw new Error('A imagem demorou muito para processar ou a compressão falhou, e o arquivo original excede 5MB. Tente uma imagem menor.');
  }
};

/**
 * Valida o tamanho e tipo do arquivo
 * @param file Arquivo a ser validado
 * @returns true se válido, ou lança um erro
 */
export const validateImage = (file: File) => {
  console.log("[IMAGE_UPLOAD] validation start", { name: file.name, size: file.size, type: file.type });
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  if (file.size > MAX_SIZE) {
    console.error("[IMAGE_UPLOAD] validation failed: file too large", file.size);
    throw new Error('A imagem precisa ter no máximo 5MB.');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    console.error("[IMAGE_UPLOAD] validation failed: invalid format", file.type);
    throw new Error('Formato inválido. Use JPG, PNG ou WEBP.');
  }

  console.log("[IMAGE_UPLOAD] validation success");
  return true;
};

/**
 * Faz o upload de uma imagem para o Supabase Storage com timeout e fallback em Base64
 * @param file Arquivo (Blob ou File)
 * @param userId ID do usuário para organizar as pastas
 * @param bucket Nome do bucket (offers ou avatars)
 * @param subPath Subpasta opcional dentro da pasta do usuário (ex: 'profile' ou 'public')
 */
export const uploadImage = async (
  file: Blob | File,
  userId: string,
  bucket: 'offers' | 'avatars' = 'offers',
  subPath?: string
): Promise<string> => {
  const fileExt = 'jpg';
  const folderPath = subPath ? `${userId}/${subPath}` : userId;
  const fileName = `${folderPath}/${Date.now()}.${fileExt}`;
  
  console.log("[IMAGE_UPLOAD] upload start", { bucket, fileName });
  try {
    // Timeout de 20 segundos para o upload no Supabase Storage
    const uploadPromise = supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        contentType: 'image/jpeg',
        upsert: true
      });

    const { error: uploadError } = await withTimeout(
      uploadPromise,
      20000,
      "Upload para o Supabase Storage"
    );

    if (uploadError) {
      throw uploadError;
    }

    console.log("[IMAGE_UPLOAD] upload success, generating public URL");
    
    // Timeout de 5 segundos para a URL pública
    const publicUrlPromise = Promise.resolve(
      supabase.storage
        .from(bucket)
        .getPublicUrl(fileName)
    );

    const { data } = await withTimeout(
      publicUrlPromise,
      5000,
      "Geração da URL pública"
    );

    console.log("[IMAGE_UPLOAD] public url generated", data.publicUrl);
    return data.publicUrl;
  } catch (err: any) {
    console.error(`[IMAGE_UPLOAD] Falha no upload para o bucket '${bucket}':`, err.message || err);
    const uploadErr = new Error(`Falha ao fazer upload da imagem no Supabase Storage: ${err.message || 'Erro desconhecido'}`);
    (uploadErr as any).cause = err;
    throw uploadErr;
  }
};

export const uploadOfferImage = (file: Blob | File, userId: string) => uploadImage(file, userId, 'offers');
export const uploadAvatarImage = (file: Blob | File, userId: string, subPath?: 'profile' | 'public') => uploadImage(file, userId, 'avatars', subPath);
