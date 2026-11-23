import type { AuthUser } from '@outpaly/shared';

declare global {
  namespace Express {
    interface Request {
      /** loadSession 이 채운다. 로그인하지 않았으면 undefined */
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export {};
