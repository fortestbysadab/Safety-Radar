/**
 * services/votes.js
 * -----------------
 * Upvote / downvote / clear operations. The atomic work lives in Postgres
 * functions (`fn_cast_vote`, `fn_clear_report`) to avoid race conditions —
 * these helpers just validate inputs and return the updated report.
 */
import { pool } from '../config/db.js';
import { AppError } from '../middleware/validate.js';

async function getReportOr404(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppError(400, 'Invalid report id');
  }
  const { rows } = await pool.query(
    `SELECT id, status, upvotes, downvotes, expires_at
       FROM public.safety_reports
      WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw new AppError(404, 'Report not found');
  return rows[0];
}

export async function castVote({ reportId, userHash, voteType }) {
  if (voteType !== 'up' && voteType !== 'down') {
    throw new AppError(400, "voteType must be 'up' or 'down'");
  }
  await getReportOr404(reportId);

  await pool.query(
    `SELECT public.fn_cast_vote($1, $2, $3)`,
    [reportId, userHash, voteType]
  );
  return getReportOr404(reportId);
}

export async function clearReport({ reportId, userHash }) {
  await getReportOr404(reportId);
  await pool.query(
    `SELECT public.fn_clear_report($1, $2)`,
    [reportId, userHash]
  );
  return getReportOr404(reportId);
}
