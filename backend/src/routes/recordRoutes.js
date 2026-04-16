const express = require('express');
const db = require('../config/db');
const supabase = require('../config/supabase');
const HttpError = require('../utils/httpError');
const { authenticate, authorize } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const pathLib = require('path');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
router.use(authenticate);

function canAccessRecord(user, record) {
  if (['operadora', 'auditoria', 'lideranca'].includes(user.role)) return true;
  if (user.role === 'prestador') {
    return String(user.providerId || '') === String(record.provider_id || '');
  }
  return false;
}

async function fetchRecordById(id) {
  const { rows } = await db.query(`
    select r.*, p.name as provider_name, u.full_name as created_by_name, a.full_name as assigned_to_name
    from app.records r
    left join app.providers p on p.id = r.provider_id
    left join app.users u on u.id = r.created_by
    left join app.users a on a.id = r.assigned_to
    where r.id = $1
  `, [id]);
  return rows[0] || null;
}


async function listAttachmentsForRecord(recordId) {
  const { rows } = await db.query(`
    select a.*, u.full_name as uploaded_by_name
    from app.attachments a
    left join app.users u on u.id = a.uploaded_by
    where a.record_id = $1
    order by a.created_at asc
  `, [recordId]);

  const enriched = [];
  for (const row of rows) {
    let signedUrl = row.file_url || null;
    if (row.storage_path) {
      const { data, error } = await supabase
        .storage
        .from(row.bucket_name || process.env.SUPABASE_STORAGE_BUCKET || 'medsenior-anexos')
        .createSignedUrl(row.storage_path, Number(process.env.ATTACHMENT_SIGNED_URL_TTL || 3600));
      if (!error && data?.signedUrl) {
        signedUrl = data.signedUrl;
      }
    }
    enriched.push({
      ...row,
      signed_url: signedUrl
    });
  }
  return enriched;
}

function mapAttachment(row) {
  return {
    id: row.id,
    recordId: row.record_id,
    name: row.file_name,
    fileName: row.file_name,
    fileUrl: row.signed_url || row.file_url,
    signedUrl: row.signed_url || row.file_url,
    type: row.file_type || '',
    size: Number(row.file_size || 0),
    ext: row.file_ext || '',
    bucketName: row.bucket_name || '',
    storagePath: row.storage_path || '',
    uploadedAt: row.created_at,
    uploadedBy: row.uploaded_by_name || ''
  };
}

router.get('/', async (req, res, next) => {
  try {
    const params = [];
    const where = [];

    if (req.auth.role === 'prestador') {
      params.push(req.auth.providerId);
      where.push(`r.provider_id = $${params.length}`);
    }

    if (req.query.status) {
      params.push(req.query.status);
      where.push(`r.status = $${params.length}`);
    }

    if (req.query.priority) {
      params.push(req.query.priority);
      where.push(`r.priority = $${params.length}`);
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      where.push(`(
        r.protocol ilike $${params.length}
        or r.patient_name ilike $${params.length}
        or r.request_type ilike $${params.length}
        or coalesce(p.name, '') ilike $${params.length}
      )`);
    }

    const sql = `
      select r.*, p.name as provider_name, u.full_name as created_by_name, a.full_name as assigned_to_name
      from app.records r
      left join app.providers p on p.id = r.provider_id
      left join app.users u on u.id = r.created_by
      left join app.users a on a.id = r.assigned_to
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by
  case
    when upper(coalesce(r.emergency_type, '')) in ('SIM', 'EMERGENCIA', 'URGENTE')
    then 1
    else 0
  end desc,
  r.updated_at desc
    `;

    const { rows } = await db.query(sql, params);
    const data = await Promise.all(rows.map(async (row) => ({ ...row, attachments: (await listAttachmentsForRecord(row.id)).map(mapAttachment) })));
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');
    res.json({ ok: true, data: { ...record, attachments: (await listAttachmentsForRecord(record.id)).map(mapAttachment) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', authorize('operadora', 'lideranca'), async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (!payload.patientName) {
      throw new HttpError(400, 'patientName é obrigatório.');
    }

    const protocol = payload.protocol || `MS-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const sql = `
      insert into app.records (
        protocol, state, observation, waiting_assumption, carencia, cpt, adhesion_date,
        patient_name, plan_type, age, request_type, solicitation, emergency_type, has_opme,
        provider_id, companion, contact, provider_attends_plan, assist_reg, origin_name,
        origin_address, destination_name, destination_address, status, priority,
        created_by, assigned_to, audit_deadline_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28
      )
      returning *
    `;

    const { rows } = await db.query(sql, [
      protocol,
      payload.state || null,
      payload.observation || null,
      payload.waitingAssumption || false,
      payload.carencia || null,
      payload.cpt || null,
      payload.adhesionDate || null,
      payload.patientName,
      payload.planType || null,
      payload.age || null,
      payload.requestType || null,
      payload.solicitation || null,
      payload.emergencyType || null,
      payload.hasOpme || null,
      payload.providerId || null,
      payload.companion || null,
      payload.contact || null,
      payload.providerAttendsPlan || null,
      payload.assistReg || null,
      payload.originName || null,
      payload.originAddress || null,
      payload.destinationName || null,
      payload.destinationAddress || null,
      payload.status || 'PENDENTE',
      payload.priority || 'NORMAL',
      req.auth.sub,
      payload.assignedTo || null,
      payload.auditDeadlineAt || null
    ]);

    res.status(201).json({ ok: true, data: { ...rows[0], attachments: [] } });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authorize('operadora', 'auditoria', 'lideranca'), async (req, res, next) => {
  try {
    const current = await fetchRecordById(req.params.id);
    if (!current) throw new HttpError(404, 'Registro não encontrado.');

    const payload = req.body || {};
    const sql = `
      update app.records
      set state = $2,
          observation = $3,
          waiting_assumption = $4,
          carencia = $5,
          cpt = $6,
          adhesion_date = $7,
          patient_name = $8,
          plan_type = $9,
          age = $10,
          request_type = $11,
          solicitation = $12,
          emergency_type = $13,
          has_opme = $14,
          provider_id = $15,
          companion = $16,
          contact = $17,
          provider_attends_plan = $18,
          assist_reg = $19,
          origin_name = $20,
          origin_address = $21,
          destination_name = $22,
          destination_address = $23,
          status = $24,
          priority = $25,
          assigned_to = $26,
          audit_deadline_at = $27,
          updated_at = now()
      where id = $1
      returning *
    `;

    const { rows } = await db.query(sql, [
      req.params.id,
      payload.state ?? current.state,
      payload.observation ?? current.observation,
      payload.waitingAssumption ?? current.waiting_assumption,
      payload.carencia ?? current.carencia,
      payload.cpt ?? current.cpt,
      payload.adhesionDate ?? current.adhesion_date,
      payload.patientName ?? current.patient_name,
      payload.planType ?? current.plan_type,
      payload.age ?? current.age,
      payload.requestType ?? current.request_type,
      payload.solicitation ?? current.solicitation,
      payload.emergencyType ?? current.emergency_type,
      payload.hasOpme ?? current.has_opme,
      payload.providerId ?? current.provider_id,
      payload.companion ?? current.companion,
      payload.contact ?? current.contact,
      payload.providerAttendsPlan ?? current.provider_attends_plan,
      payload.assistReg ?? current.assist_reg,
      payload.originName ?? current.origin_name,
      payload.originAddress ?? current.origin_address,
      payload.destinationName ?? current.destination_name,
      payload.destinationAddress ?? current.destination_address,
      payload.status ?? current.status,
      payload.priority ?? current.priority,
      payload.assignedTo ?? current.assigned_to,
      payload.auditDeadlineAt ?? current.audit_deadline_at
    ]);

    res.json({ ok: true, data: { ...rows[0], attachments: (await listAttachmentsForRecord(rows[0].id)).map(mapAttachment) } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');

    const requestedChannel = req.query.channel;
    const params = [req.params.id];
    let channelFilter = '';

    if (requestedChannel) {
      params.push(requestedChannel);
      channelFilter = `and m.channel = $2`;
    } else if (req.auth.role === 'prestador') {
      channelFilter = `and m.channel = 'public'`;
    } else if (req.auth.role === 'auditoria') {
      channelFilter = `and m.channel = 'audit'`;
    }

    const { rows } = await db.query(`
      select m.id, m.channel, m.message, m.created_at, m.author_user_id,
             u.full_name as author_name, u.role as author_role
      from app.record_messages m
      join app.users u on u.id = m.author_user_id
      where m.record_id = $1
      ${channelFilter}
      order by m.created_at asc
    `, params);

    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');

    const { channel, message } = req.body;
    if (!channel || !message) {
      throw new HttpError(400, 'channel e message são obrigatórios.');
    }

    if (!['public', 'audit'].includes(channel)) {
      throw new HttpError(400, 'channel deve ser public ou audit.');
    }

    if (channel === 'audit' && !['operadora', 'auditoria', 'lideranca'].includes(req.auth.role)) {
      throw new HttpError(403, 'Somente operadora, auditoria e liderança podem usar o canal audit.');
    }

    if (channel === 'public' && req.auth.role === 'auditoria') {
      throw new HttpError(403, 'Auditoria não envia mensagem no canal public.');
    }

    const { rows } = await db.query(`
      insert into app.record_messages (record_id, channel, author_user_id, message)
      values ($1, $2, $3, $4)
      returning *
    `, [req.params.id, channel, req.auth.sub, String(message).trim()]);

    await db.query('update app.records set updated_at = now() where id = $1', [req.params.id]);

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/info', async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');

    const { rows } = await db.query(`
      select i.id, i.info_text, i.updated_at, i.updated_by,
             u.full_name as updated_by_name
      from app.record_infos i
      left join app.users u on u.id = i.updated_by
      where i.record_id = $1
      order by i.updated_at desc
      limit 1
    `, [req.params.id]);

    res.json({ ok: true, data: rows[0] || null });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/info', authorize('operadora', 'lideranca'), async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');

    const { infoText } = req.body;
    if (!infoText) {
      throw new HttpError(400, 'infoText é obrigatório.');
    }

    const { rows } = await db.query(`
      insert into app.record_infos (record_id, info_text, updated_by)
      values ($1, $2, $3)
      returning *
    `, [req.params.id, String(infoText).trim(), req.auth.sub]);

    await db.query('update app.records set updated_at = now() where id = $1', [req.params.id]);

    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
});



router.get('/:id/attachments', async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');

    const attachments = await listAttachmentsForRecord(req.params.id);
    res.json({ ok: true, data: attachments.map(mapAttachment) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/attachments/:attachmentId/url', async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');

    const { rows } = await db.query(`
      select * from app.attachments where id = $1 and record_id = $2
    `, [req.params.attachmentId, req.params.id]);
    const attachment = rows[0];
    if (!attachment) throw new HttpError(404, 'Anexo não encontrado.');

    if (!attachment.storage_path) {
      return res.json({ ok: true, data: { url: attachment.file_url } });
    }

    const { data, error } = await supabase.storage
      .from(attachment.bucket_name || process.env.SUPABASE_STORAGE_BUCKET || 'medsenior-anexos')
      .createSignedUrl(attachment.storage_path, Number(process.env.ATTACHMENT_SIGNED_URL_TTL || 3600));

    if (error || !data?.signedUrl) {
      throw new HttpError(500, error?.message || 'Falha ao assinar URL do anexo.');
    }

    res.json({ ok: true, data: { url: data.signedUrl } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/attachments', upload.array('files', 10), async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');
    if (req.auth.role === 'auditoria') throw new HttpError(403, 'Auditoria não pode anexar arquivos neste fluxo.');

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) throw new HttpError(400, 'Nenhum arquivo enviado.');

    const saved = [];
    for (const file of files) {
      const ext = pathLib.extname(file.originalname || '').toLowerCase();
      const safeBase = pathLib.basename(file.originalname || `arquivo${ext}`, ext)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'arquivo';
      const storagePath = `records/${req.params.id}/${Date.now()}-${uuidv4()}-${safeBase}${ext}`;
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'medsenior-anexos';

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600'
        });

      if (uploadError) {
        throw new HttpError(500, `Falha ao enviar anexo para o Storage: ${uploadError.message}`);
      }

      const { data: signedData } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(storagePath, Number(process.env.ATTACHMENT_SIGNED_URL_TTL || 3600));

      const { rows } = await db.query(`
        insert into app.attachments (
          record_id, file_name, file_url, file_type, storage_provider, uploaded_by,
          bucket_name, storage_path, file_size, file_ext
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning *
      `, [
        req.params.id,
        file.originalname,
        signedData?.signedUrl || '',
        file.mimetype || null,
        'supabase-storage',
        req.auth.sub,
        bucketName,
        storagePath,
        file.size || 0,
        ext || null
      ]);

      saved.push(mapAttachment({ ...rows[0], signed_url: signedData?.signedUrl || rows[0].file_url }));
    }

    await db.query('update app.records set updated_at = now() where id = $1', [req.params.id]);
    res.status(201).json({ ok: true, data: saved });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/attachments/:attachmentId', authorize('operadora', 'prestador', 'lideranca'), async (req, res, next) => {
  try {
    const record = await fetchRecordById(req.params.id);
    if (!record) throw new HttpError(404, 'Registro não encontrado.');
    if (!canAccessRecord(req.auth, record)) throw new HttpError(403, 'Acesso negado ao registro.');

    const { rows } = await db.query('select * from app.attachments where id = $1 and record_id = $2', [req.params.attachmentId, req.params.id]);
    const attachment = rows[0];
    if (!attachment) throw new HttpError(404, 'Anexo não encontrado.');

    if (attachment.storage_path) {
      const { error: removeError } = await supabase.storage
        .from(attachment.bucket_name || process.env.SUPABASE_STORAGE_BUCKET || 'medsenior-anexos')
        .remove([attachment.storage_path]);
      if (removeError) {
        throw new HttpError(500, `Falha ao excluir anexo do Storage: ${removeError.message}`);
      }
    }

    await db.query('delete from app.attachments where id = $1', [req.params.attachmentId]);
    await db.query('update app.records set updated_at = now() where id = $1', [req.params.id]);
    res.json({ ok: true, message: 'Anexo excluído com sucesso.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
