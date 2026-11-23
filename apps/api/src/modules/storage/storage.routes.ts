// 로컬 저장소의 업로드 받기 (S3 presigned PUT 대신). 서명된 토큰이 곧 권한이다.
import { Router } from 'express';
import { storage } from '../../lib/storage/index.ts';

export const storageRouter = Router();

storageRouter.put('/upload/:token', async (req, res) => {
  await storage.receiveUpload(req, req.params.token);
  res.status(204).end();
});
