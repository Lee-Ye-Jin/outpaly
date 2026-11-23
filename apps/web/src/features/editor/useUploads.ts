// 음악 파일 업로드 대기열
// 파일마다: 형식·크기 확인 → 업로드 주소 발급 → PUT (진행률) → 서버 검사(complete)
// 고른 순서대로 프로젝트에 추가한다: 앞 파일이 끝나야 뒤 파일을 추가 (실패한 파일은 건너뜀).

import { useCallback, useRef, useState } from 'react';
import { ACCEPTED_AUDIO, MAX_TRACK_BYTES, type AcceptedAudioMime, type TrackDto } from '@outpaly/shared';
import { ApiRequestError } from '../../services/api.ts';
import { putFile, tracksApi } from '../../services/tracks-api.ts';

export type UploadStatus = 'waiting' | 'uploading' | 'processing' | 'done' | 'error';
export interface UploadItem {
  id: string;
  name: string;
  status: UploadStatus;
  progress: number;
  error?: string;
}

const CONCURRENCY = 2;

/** 브라우저가 type 을 비워 보내는 경우(일부 OS의 .wav)도 확장자로 판단 */
export function detectAudioMime(file: File): AcceptedAudioMime | null {
  if (file.type in ACCEPTED_AUDIO) return file.type as AcceptedAudioMime;
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  return null;
}

export function useUploads(onUploaded: (tracks: TrackDto[]) => Promise<void> | void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const seq = useRef(0);

  const patch = (id: string, p: Partial<UploadItem>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const start = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const batch = files.map((file) => ({ file, id: `u${++seq.current}`, mime: detectAudioMime(file) }));
      setItems((prev) => [...prev, ...batch.map((b) => ({ id: b.id, name: b.file.name, status: 'waiting' as const, progress: 0 }))]);

      // 결과를 고른 순서대로 내보내기
      const results: (TrackDto | null | undefined)[] = batch.map(() => undefined);
      let emitted = 0;
      let emitting = Promise.resolve();
      const emitReady = () => {
        const ready: TrackDto[] = [];
        while (emitted < results.length && results[emitted] !== undefined) {
          const r = results[emitted++];
          if (r) ready.push(r);
        }
        if (ready.length > 0) emitting = emitting.then(() => onUploaded(ready));
      };

      const uploadOne = async (i: number) => {
        const { file, id, mime } = batch[i]!;
        try {
          if (!mime) throw new Error('MP3 또는 WAV 파일만 올릴 수 있어요.');
          if (file.size > MAX_TRACK_BYTES) throw new Error(`곡당 최대 ${MAX_TRACK_BYTES / 1024 / 1024}MB 까지 올릴 수 있어요.`);
          if (file.size === 0) throw new Error('빈 파일이에요.');
          patch(id, { status: 'uploading' });
          const target = await tracksApi.requestUpload({ filename: file.name, mimeType: mime, sizeBytes: file.size });
          await putFile(target, file, (r) => patch(id, { progress: r }));
          patch(id, { status: 'processing', progress: 1 });
          const { track } = await tracksApi.complete({ key: target.key, filename: file.name });
          results[i] = track;
          patch(id, { status: 'done' });
          // 완료 표시는 잠깐 보여 주고 목록에서 뺀다
          setTimeout(() => setItems((prev) => prev.filter((it) => it.id !== id)), 1200);
        } catch (e) {
          results[i] = null;
          patch(id, { status: 'error', error: e instanceof ApiRequestError || e instanceof Error ? e.message : '업로드하지 못했어요.' });
        }
        emitReady();
      };

      let next = 0;
      const worker = async () => {
        while (next < batch.length) await uploadOne(next++);
      };
      void Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
    },
    [onUploaded]
  );

  const dismiss = useCallback((id: string) => setItems((prev) => prev.filter((it) => it.id !== id)), []);
  return { items, start, dismiss };
}
