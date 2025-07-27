import express from 'express';
import { createRouter } from '@/configs/server.config';
import kpiEntryRouter from './kpi_entry/kpi_entry.router';
import kpiTemplateRouter from './kpi_template/kpi_template.router';
import memberRouter from './members/members.route';

const router = createRouter();

// KPI Entry routes
router.use('/kpi-entries', kpiEntryRouter);

// KPI Template routes
router.use('/kpi-templates', kpiTemplateRouter);

// Member routes
router.use('/members', memberRouter);

export default router;
