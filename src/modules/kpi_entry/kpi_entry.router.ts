import { createRouter } from '@/configs/server.config';
import { KpiEntryHandler } from './kpi_entry.handler';

const router = createRouter();

// Generate default KPI entries for a template
router.post('/generate-default', KpiEntryHandler.generateDefaultEntries);

// Update KPI entry values
router.put('/:entryId/values', KpiEntryHandler.updateEntryValues);

// Get KPI entries for current user
router.get('/my-entries', KpiEntryHandler.getMyEntries);
router.get('/user-entries', KpiEntryHandler.getEntriesByUser);

// Get KPI entry by jurisdiction
router.get(
  '/jurisdiction/:jurisdiction',
  KpiEntryHandler.getEntryByJurisdiction
);

// Generate final KPI reports
router.post('/generate-final-reports', KpiEntryHandler.generateFinalReports);

// Get KPI entries statistics
router.get('/statistics', KpiEntryHandler.getKpiEntriesStatistics);

export default router;
