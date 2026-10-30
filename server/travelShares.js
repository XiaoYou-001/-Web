import express from 'express';
import { parseDateOnly, inclusiveDayCount } from '../src/utils/date.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const digest = value => createHash('sha256').update(value).digest();
const idValid = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const tokenValid = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const text = (value, limit) => {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid text');
  return value;
};
export function publicPlan(input) {
  if (!input || !Array.isArray(input.days) || input.days.length > 60) throw new Error('Invalid plan');
  const date = value => { parseDateOnly(value); return value; };
  if (inclusiveDayCount(input.startDate,input.endDate)>60) throw new Error('Invalid duration');
  const seen = new Set();
  return {
    name: text(input.title, 120), startDate: date(input.startDate), endDate: date(input.endDate),
    days: input.days.map(day => {
      if (seen.has(day.date) || day.date < input.startDate || day.date > input.endDate) throw new Error('Invalid day');
      seen.add(day.date);
      if (!Array.isArray(day.activities) || day.activities.length > 50) throw new Error('Invalid activities');
      return { date: date(day.date), activities: day.activities.map(activity => ({
        title: text(activity.title, 200), time: text(activity.time || '', 20)
      })) };
    })
  };
}

// A per-link management capability authorizes revocation. Local demo account IDs
// are deliberately not treated as server authentication credentials.
export function shareRouter({ directory, now = Date.now } = {}) {
  const router = express.Router();
  const root = directory ? resolve(directory) : null;
  const attempts = new Map();
  router.get('/status', (_req,res) => res.set('Cache-Control','no-store').json({enabled:Boolean(root)}));
  const filename = id => join(root, `${id}.json`);
  const read = id => {
    if (!idValid(id)) return null;
    try {
      const entry = JSON.parse(readFileSync(filename(id), 'utf8'));
      return entry.expiresAt > now() ? entry : null;
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    if (!root) return res.status(503).json({code:'SERVICE_UNAVAILABLE',error:'分享服务尚未配置'});
    next();
  });
  router.post('/', (req, res) => {
    const { id, managementToken, plan } = req.body || {};
    if (!idValid(id) || !tokenValid(managementToken) || id !== digest(managementToken).toString('hex').slice(0,36)) return res.status(400).json({error:'分享参数无效'});
    let sanitized;
    try { sanitized = publicPlan(plan); } catch { return res.status(400).json({error:'行程格式无效，最多分享60天，每天50项活动'}); }
    try {
      mkdirSync(root, {recursive:true});
      let rawExisting;
      try { rawExisting=JSON.parse(readFileSync(filename(id),'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
      if(rawExisting && (rawExisting.revoked || rawExisting.expiresAt <= now())) return res.status(410).json({error:'该分享已撤销或已过期，请创建新链接'});
      const existing = read(id);
      if (existing) {
        if (!timingSafeEqual(Buffer.from(existing.tokenHash,'hex'), digest(managementToken))) return res.status(403).json({error:'无权操作该分享'});
        return res.json({id, expiresAt:existing.expiresAt});
      }
      for (const [key,value] of attempts) if (value.until <= now()) attempts.delete(key);
      const bucket = attempts.get(req.ip) || {count:0,until:now()+3600000};
      if (bucket.count >= 20 || attempts.size >= 10000) return res.status(429).json({error:'创建过于频繁，请稍后重试'});
      bucket.count++; attempts.set(req.ip,bucket);
      const files = readdirSync(root).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name));
      for (const file of files) {
        const entry = JSON.parse(readFileSync(join(root,file),'utf8'));
        if (!entry.revoked && entry.expiresAt <= now()) {
          const path=join(root,file),temporary=`${path}.tmp`;
          writeFileSync(temporary,JSON.stringify({revoked:true,expiresAt:0}),{mode:0o600});renameSync(temporary,path);
        }
      }
      if (readdirSync(root).filter(name=>name.endsWith('.json')).length >= 1000) return res.status(503).json({error:'分享存储已满'});
      const expiresAt = now()+7*86400000;
      const path = filename(id), temporary = `${path}.tmp`;
      writeFileSync(temporary,JSON.stringify({tokenHash:digest(managementToken).toString('hex'),expiresAt,plan:sanitized}),{mode:0o600});
      renameSync(temporary,path);
      res.status(201).json({id,expiresAt});
    } catch { res.status(503).json({error:'分享保存失败，请稍后重试'}); }
  });
  router.get('/:id', (req,res) => {
    try {
      const entry=read(req.params.id);
      if(!entry) return res.status(404).json({error:'分享不存在、已撤销或已过期'});
      res.json({plan:entry.plan,expiresAt:entry.expiresAt});
    } catch {res.status(503).json({error:'分享读取失败'});}
  });
  router.delete('/:id', (req,res) => {
    const token=req.body?.managementToken;
    if(!tokenValid(token) || !idValid(req.params.id) || req.params.id !== digest(token).toString('hex').slice(0,36)) return res.status(403).json({error:'无权撤销该分享'});
    try {
      mkdirSync(root,{recursive:true});
      for (const [key,value] of attempts) if (value.until <= now()) attempts.delete(key);
      const rateKey=`revoke:${req.ip}`;
      const bucket=attempts.get(rateKey)||{count:0,until:now()+3600000};
      if(bucket.count>=60||attempts.size>=10000)return res.status(429).json({error:'撤销请求过于频繁，请稍后重试'});
      bucket.count++;attempts.set(rateKey,bucket);
      const path=filename(req.params.id);
      const files=readdirSync(root).filter(name=>name.endsWith('.json'));
      if(!files.includes(`${req.params.id}.json`) && files.length>=1000)return res.status(503).json({error:'分享存储已满，请稍后重试'});
      // Keep a tombstone even when a create request has not arrived yet. This
      // prevents timeout -> revoke -> delayed create from resurrecting a link.
      const temporary=`${path}.tmp`;
      writeFileSync(temporary,JSON.stringify({revoked:true,expiresAt:0}),{mode:0o600});
      renameSync(temporary,path);
      res.status(204).end();
    } catch {res.status(503).json({error:'撤销失败，请重试'});}
  });
  return router;
}
