import { getSession } from '@/lib/api-client';
import { MemberService } from '@/modules/members/members.service';
import { AxiosHeaders } from 'axios';
import { Request, Response, NextFunction } from 'express';

export default async function sessionDeserializer(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const headers = new AxiosHeaders();
  headers.set('Cookie', req.headers.cookie as string);
  const session = await getSession(headers);
  req.session = session.session;
  if (session.user) {
    const member = await MemberService.getMemberByUserId(session.user.id);
    if (member) {
      req.user = {
        ...session.user,
        department: member.departmentSlug || '',
        departmentRole: member.role || '',
      };
    }
  }
  next();
}
