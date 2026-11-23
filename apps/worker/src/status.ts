/** prisma RenderStatus 와 같은 값 */
export type RenderStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'PROCESSING'
  | 'UPLOADING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
