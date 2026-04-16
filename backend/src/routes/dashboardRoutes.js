const express = require('express');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('lideranca', 'operadora'));

router.get('/leadership', async (req, res, next) => {
  try {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    const filterSql = [];
    const params = [];

    if (startDate) {
      params.push(startDate);
      filterSql.push(`r.created_at::date >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      filterSql.push(`r.created_at::date <= $${params.length}::date`);
    }

    const where = filterSql.length ? `where ${filterSql.join(' and ')}` : '';

    const totalsPromise = db.query(`
      select
        count(*)::int as total,
        count(*) filter (where r.status = 'PENDENTE')::int as pendente,
        count(*) filter (where r.status = 'TRATATIVA')::int as tratativa,
        count(*) filter (where r.status = 'FINALIZADO')::int as finalizado,
        count(*) filter (where r.status = 'CANCELADO')::int as cancelado,
        count(*) filter (where r.status = 'AUDITORIA')::int as auditoria,
        count(*) filter (where r.is_emergency = true)::int as emergencia
      from app.v_records_dashboard r
      ${where}
    `, params);

    const rankingPromise = db.query(`
      select coalesce(provider_name, 'Sem prestador') as provider_name, count(*)::int as total
      from app.v_records_dashboard r
      ${where}
      group by provider_name
      order by total desc, provider_name asc
      limit 10
    `, params);

    const statusByOperatorPromise = db.query(`
      select coalesce(created_by_name, 'Sem operador') as operator_name, count(*)::int as total
      from app.v_records_dashboard r
      ${where}
      group by created_by_name
      order by total desc, operator_name asc
      limit 10
    `, params);

    const [totalsResult, rankingResult, operatorResult] = await Promise.all([
      totalsPromise,
      rankingPromise,
      statusByOperatorPromise
    ]);

    res.json({
      ok: true,
      data: {
        totals: totalsResult.rows[0],
        rankingProviders: rankingResult.rows,
        rankingOperators: operatorResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
