import { createRouter } from '@/configs/server.config';
import { MemberHandler } from './members.handler';

const router = createRouter();

router.get('/', MemberHandler.getMembers);
router.get('/me', MemberHandler.getMyMember);
router.put('/:id', MemberHandler.updateMember);

export default router;
