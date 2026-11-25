// 렌더링 작업 타입. API·Worker·웹이 함께 쓴다.

import { z } from 'zod';
import type { ProjectDoc } from './project-doc.ts';
import type { RenderBackgroundSource } from './assets.ts';

export const RENDER_STATUSES = ['QUEUED', 'PREPARING', 'PROCESSING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

/** 아직 끝나지 않은 상태. 프로젝트당 하나만 있을 수 있다 */
export const ACTIVE_RENDER_STATUSES = ['QUEUED', 'PREPARING', 'PROCESSING', 'UPLOADING'] as const satisfies readonly RenderStatus[];
export const isActiveRender = (s: RenderStatus) => (ACTIVE_RENDER_STATUSES as readonly RenderStatus[]).includes(s);

export const RENDER_STATUS_LABEL: Record<RenderStatus, string> = {
  QUEUED: '대기 중',
  PREPARING: '파일 준비 중',
  PROCESSING: '영상 제작 중',
  UPLOADING: '결과 저장 중',
  COMPLETED: '완료',
  FAILED: '실패',
  CANCELLED: '취소됨'
};

/** 전체 진행률(0~100)에서 단계별 구간 */
export const RENDER_PROGRESS = {
  PREPARING: [0, 10],
  PROCESSING: [10, 95],
  UPLOADING: [95, 100]
} as const;

/** 렌더 요청 시점의 프로젝트. Worker 는 이것만 보고 만든다 (요청 뒤 편집해도 결과물이 바뀌지 않음) */
export interface RenderSnapshot {
  version: 1;
  doc: ProjectDoc;
  /** project_tracks.id → 원본 파일 */
  sources: Record<string, { storageKey: string; mimeType: string }>;
  /** 배경 이미지 원본 (없으면 단색). Phase 5 이전 스냅샷에는 이 칸이 없다 */
  background?: RenderBackgroundSource | null;
}

export const CreateRenderInput = z.object({
  projectId: z.uuid({ error: '프로젝트 id 형식이 올바르지 않아요.' })
});
export type CreateRenderInput = z.input<typeof CreateRenderInput>;

export interface RenderOutputDto {
  id: string;
  sizeBytes: number;
  /** 초 */
  duration: number;
  width: number;
  height: number;
  /** 유튜브 설명란용 */
  timestamps: string;
  downloadUrl: string;
  createdAt: string;
}

export interface RenderJobDto {
  id: string;
  projectId: string;
  status: RenderStatus;
  /** 0~100 */
  progress: number;
  error: string | null;
  /** 요청 시점 기준 */
  trackCount: number;
  expectedDuration: number;
  width: number;
  height: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  output: RenderOutputDto | null;
}

export interface RenderJobResponse {
  render: RenderJobDto;
}
export interface RenderJobListResponse {
  renders: RenderJobDto[];
}
