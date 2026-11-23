// 음원(tracks)과 프로젝트 안의 곡(project_tracks) 타입과 입력 검증

import { z } from 'zod';
import type { ProjectTrackDoc } from './project-doc.ts';

export const MAX_TRACK_BYTES = 100 * 1024 * 1024; // 곡당 100MB
export const MAX_TRACKS_PER_PROJECT = 50;
export const ACCEPTED_AUDIO = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/wave': ['.wav']
} as const;
export type AcceptedAudioMime = keyof typeof ACCEPTED_AUDIO;
export const ACCEPTED_AUDIO_MIMES = Object.keys(ACCEPTED_AUDIO) as AcceptedAudioMime[];
/** <input accept> 용 */
export const AUDIO_ACCEPT_ATTR = '.mp3,.wav,audio/mpeg,audio/wav';

const uuid = z.uuid({ error: 'id 형식이 올바르지 않아요.' });

// ---------- 업로드 ----------

export const RequestTrackUploadInput = z.object({
  filename: z.string().trim().min(1).max(255),
  /** 브라우저가 알려준 형식. 실제 형식은 업로드 후 서버가 파일 내용으로 다시 확인한다 */
  mimeType: z.enum(ACCEPTED_AUDIO_MIMES as [AcceptedAudioMime, ...AcceptedAudioMime[]], {
    error: 'MP3 또는 WAV 파일만 올릴 수 있어요.'
  }),
  sizeBytes: z
    .number()
    .int()
    .positive({ error: '빈 파일은 올릴 수 없어요.' })
    .max(MAX_TRACK_BYTES, { error: `파일이 너무 커요. 곡당 최대 ${MAX_TRACK_BYTES / 1024 / 1024}MB 예요.` })
});
export type RequestTrackUploadInput = z.input<typeof RequestTrackUploadInput>;

export interface UploadTarget {
  /** 이 키로 complete 를 호출한다 */
  key: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export const CompleteTrackUploadInput = z.object({
  key: z.string().min(1).max(500),
  /** 원래 파일 이름. 태그에 제목이 없으면 이것으로 제목을 만든다 */
  filename: z.string().trim().min(1).max(255)
});
export type CompleteTrackUploadInput = z.input<typeof CompleteTrackUploadInput>;

// ---------- 응답 ----------

export interface TrackDto {
  id: string;
  title: string;
  artist: string | null;
  /** 초 */
  duration: number;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ProjectTrackDto {
  id: string;
  trackId: string;
  sortOrder: number;
  /** null = 원본 음원의 제목/아티스트를 쓴다 */
  displayTitle: string | null;
  displayArtist: string | null;
  trimStart: number;
  trimEnd: number | null;
  gain: number;
  gapAfter: number;
  track: TrackDto;
}

export interface TrackListResponse {
  tracks: TrackDto[];
}
export interface TrackResponse {
  track: TrackDto;
}
export interface ProjectTracksResponse {
  tracks: ProjectTrackDto[];
}

// ---------- 프로젝트 곡 편집 ----------

export const AddProjectTracksInput = z.object({
  trackIds: z.array(uuid).min(1).max(MAX_TRACKS_PER_PROJECT)
});
export type AddProjectTracksInput = z.input<typeof AddProjectTracksInput>;

export const ReorderProjectTracksInput = z.object({
  /** project_tracks.id 를 새 순서대로. 현재 곡 전체를 빠짐없이 보내야 한다 */
  order: z.array(uuid).max(MAX_TRACKS_PER_PROJECT)
});
export type ReorderProjectTracksInput = z.input<typeof ReorderProjectTracksInput>;

const optionalText = z
  .string()
  .trim()
  .max(200, { error: '200자 이하로 입력해 주세요.' })
  .nullable()
  .transform((v) => (v ? v : null));

export const UpdateProjectTrackInput = z
  .object({
    displayTitle: optionalText.optional(),
    displayArtist: optionalText.optional(),
    trimStart: z.number().min(0, { error: '시작은 0초 이상이어야 해요.' }).optional(),
    trimEnd: z.number().positive().nullable().optional(),
    gain: z.number().min(-12).max(6).optional(),
    gapAfter: z.number().min(0).max(10).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { error: '변경할 내용이 없어요.' });
export type UpdateProjectTrackInput = z.input<typeof UpdateProjectTrackInput>;

/** 구간을 자를 때 남겨야 하는 최소 길이 (초) */
export const MIN_TRIMMED_SECONDS = 1;

/** DTO → 미리보기·렌더러가 쓰는 ProjectTrackDoc */
export function toProjectTrackDoc(pt: ProjectTrackDto): ProjectTrackDoc {
  return {
    id: pt.id,
    trackId: pt.trackId,
    displayTitle: pt.displayTitle ?? pt.track.title,
    displayArtist: pt.displayArtist ?? pt.track.artist ?? '',
    sourceDuration: pt.track.duration,
    trimStart: pt.trimStart,
    trimEnd: pt.trimEnd,
    gain: pt.gain,
    gapAfter: pt.gapAfter
  };
}

/** 파일 이름에서 제목 만들기: "01 - Artist - Title.mp3" → "Artist - Title" */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/^\d{1,3}[\s._-]+/, '').replace(/_/g, ' ').trim();
  return (base || filename).slice(0, 200);
}
