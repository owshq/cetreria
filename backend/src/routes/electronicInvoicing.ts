import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';
import { getElectronicInvoicingProviderHealth } from '../services/electronicInvoicing/electronicInvoicingGate.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/providers/es_verifactu/health', workspaceAdminRequired, async (req, res) => {
  try {
    const health = await getElectronicInvoicingProviderHealth(
      req.workspaceId!,
      'es_verifactu',
    );
    res.json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo leer el health del provider';
    res.status(400).json({ error: message });
  }
});

export default router;
