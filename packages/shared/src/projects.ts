import { z } from 'zod';
import type { ProjectSettings } from './project-doc.ts';

export const CreateProjectInput = z.object({
  title: z
    .string({ error: '제목을 입력해 주세요.' })
    .trim()
    .min(1, { error: '제목을 입력해 주세요.' })
    .max(120, { error: '제목은 120자 이하여야 해요.' })
});
export type CreateProjectInput = z.input<typeof CreateProjectInput>;

export interface ProjectSummary {
  id: string;
  title: string;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  settings: ProjectSettings;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

export interface ProjectResponse {
  project: ProjectDetail;
}
