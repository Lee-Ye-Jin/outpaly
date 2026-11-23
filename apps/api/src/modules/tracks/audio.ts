// 업로드된 파일을 직접 읽어 실제 형식·길이·태그를 확인한다. 확장자나 브라우저가 보낸 Content-Type 은 믿지 않는다.

import { parseFile } from 'music-metadata';

export interface AudioInfo {
  mimeType: 'audio/mpeg' | 'audio/wav';
  /** 초 */
  duration: number;
  title: string | null;
  artist: string | null;
}

export class UnsupportedAudioError extends Error {}

const clean = (v: string | undefined | null) => {
  const t = v?.replace(/\0/g, '').trim();
  return t ? t.slice(0, 200) : null;
};

export async function analyzeAudio(filePath: string): Promise<AudioInfo> {
  let meta;
  try {
    // duration: true → VBR MP3 도 전체를 훑어 정확한 길이를 계산
    meta = await parseFile(filePath, { duration: true, skipCovers: true });
  } catch {
    throw new UnsupportedAudioError('오디오 파일을 읽을 수 없어요. 손상됐거나 지원하지 않는 형식이에요.');
  }

  const { container, codec, duration } = meta.format;
  const c = (container ?? '').toUpperCase();
  let mimeType: AudioInfo['mimeType'];
  if (c === 'MPEG' && /layer 3|mp3/i.test(codec ?? 'layer 3')) mimeType = 'audio/mpeg';
  else if (c === 'WAVE') mimeType = 'audio/wav';
  else throw new UnsupportedAudioError(`MP3 또는 WAV 파일만 올릴 수 있어요. (감지된 형식: ${container ?? '알 수 없음'})`);

  if (!duration || !Number.isFinite(duration) || duration < 1) {
    throw new UnsupportedAudioError('곡 길이를 확인할 수 없거나 1초보다 짧아요.');
  }
  if (duration > 3 * 60 * 60) {
    throw new UnsupportedAudioError('한 곡은 3시간 이하여야 해요.');
  }

  return {
    mimeType,
    duration: Math.round(duration * 1000) / 1000,
    title: clean(meta.common.title),
    artist: clean(meta.common.artist ?? meta.common.artists?.[0])
  };
}
