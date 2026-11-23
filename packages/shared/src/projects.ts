import { z } from 'zod';
import { ProjectSettings } from './project-doc.ts';

const Title = z
  .string({ error: '제목을 입력해 주세요.' })
  .trim()
  .min(1, { error: '제목을 입력해 주세요.' })
  .max(120, { error: '제목은 120자 이하여야 해요.' });

export const CreateProjectInput = z.object({ title: Title });
export type CreateProjectInput = z.input<typeof CreateProjectInput>;

export const UpdateProjectInput = z
  .object({
    title: Title.optional(),
    /** 전체 교체. 편집기는 항상 현재 설정 전체를 보낸다 */
    settings: ProjectSettings.optional(),
    /**
     * 마지막으로 받은 updatedAt. 서버 값과 다르면 409 (다른 탭·기기에서 먼저 저장함).
     * 생략하면 확인 없이 덮어쓴다.
     */
    expectedUpdatedAt: z.iso.datetime({ error: 'expectedUpdatedAt 형식이 올바르지 않아요.' }).optional()
  })
  .refine((v) => v.title !== undefined || v.settings !== undefined, { error: '변경할 내용이 없어요.' });
export type UpdateProjectInput = z.input<typeof UpdateProjectInput>;

export interface ProjectSummary {
  id: string;
  title: string;
  trackCount: number;
  /** 썸네일을 그리는 데 쓴다 */
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export type ProjectDetail = ProjectSummary;

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

export interface ProjectResponse {
  project: ProjectDetail;
}

/** 409 응답: 서버의 최신 상태를 함께 준다 */
export interface ProjectConflictResponse {
  error: { code: 'CONFLICT'; message: string };
  project: ProjectDetail;
}
