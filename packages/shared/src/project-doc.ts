// ProjectDoc: 편집기·미리보기·렌더러가 함께 쓰는 데이터 계약 (기획안 "Project JSON 초안")
// 좌표와 크기는 모두 1920x1080 기준. 시간은 초 단위.

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** 서버에 설치된 글꼴만 고를 수 있다 (미리보기와 렌더 결과를 맞추기 위해) */
export const FONT_IDS = ['noto-sans-kr', 'noto-serif-kr'] as const;
export const FontId = z.enum(FONT_IDS);
export type FontId = z.infer<typeof FontId>;

export const OutputSettings = z.object({
  width: z.union([z.literal(1920), z.literal(1280)]),
  height: z.union([z.literal(1080), z.literal(720)]),
  fps: z.literal(30)
});

export const BackgroundSettings = z.object({
  assetId: z.string().uuid().nullable(),
  fit: z.enum(['cover', 'contain']),
  color: hexColor,
  dim: z.number().min(0).max(0.8),
  blur: z.number().min(0).max(20)
});

export const TitleLayer = z.object({
  visible: z.boolean(),
  text: z.string().max(120),
  subtitle: z.string().max(200),
  font: FontId,
  size: z.number().min(24).max(200),
  color: hexColor,
  position: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
});

export const TracklistLayer = z.object({
  visible: z.boolean(),
  position: z.enum(['left', 'right', 'bottom']),
  highlightCurrent: z.boolean(),
  showTimestamps: z.boolean(),
  font: FontId,
  size: z.number().min(14).max(64),
  color: hexColor
});

/** projects.settings(JSONB) 에 저장되는 부분. 곡 목록은 project_tracks 테이블에 따로 저장한다. */
export const ProjectSettings = z.object({
  version: z.literal(1),
  output: OutputSettings,
  background: BackgroundSettings,
  titleLayer: TitleLayer,
  tracklistLayer: TracklistLayer
});
export type ProjectSettings = z.infer<typeof ProjectSettings>;

export const ProjectTrackDoc = z.object({
  id: z.string(),
  trackId: z.string(),
  displayTitle: z.string().max(200),
  displayArtist: z.string().max(200),
  /** 원본 음원 길이 (tracks.duration) */
  sourceDuration: z.number().positive(),
  trimStart: z.number().min(0),
  /** null = 끝까지 */
  trimEnd: z.number().positive().nullable(),
  gain: z.number().min(-12).max(6),
  gapAfter: z.number().min(0).max(10)
});
export type ProjectTrackDoc = z.infer<typeof ProjectTrackDoc>;

/** 편집기가 다루고 렌더 작업에 스냅샷으로 넘기는 전체 문서 */
export const ProjectDoc = ProjectSettings.extend({
  title: z.string().max(120),
  tracks: z.array(ProjectTrackDoc).max(100)
});
export type ProjectDoc = z.infer<typeof ProjectDoc>;

export function createDefaultSettings(title = '새 플레이리스트'): ProjectSettings {
  return {
    version: 1,
    output: { width: 1920, height: 1080, fps: 30 },
    background: { assetId: null, fit: 'cover', color: '#101014', dim: 0.3, blur: 0 },
    titleLayer: {
      visible: true,
      text: title,
      subtitle: '',
      font: 'noto-sans-kr',
      size: 84,
      color: '#FFFFFF',
      position: { x: 0.05, y: 0.09 }
    },
    tracklistLayer: {
      visible: true,
      position: 'right',
      highlightCurrent: true,
      showTimestamps: true,
      font: 'noto-sans-kr',
      size: 27,
      color: '#FFFFFF'
    }
  };
}
