// server/evals.ts — Phase A.3: labeled email set + triage precision measurement.
// Labels: act | delegate | fyi | archive. The production classifier is binary
// (actionable = act|delegate), so metrics report act-vs-rest per the spec
// (target ≥85% precision).

import { graphGet, isAuthenticated, scoreEmailsWithAI } from './outlook.js';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;
const LABELS_KEY = 'atlas:evalLabels';

export type EvalLabel = 'act' | 'delegate' | 'fyi' | 'archive';
export interface LabeledEmail {
  id: string;
  from: string;
  subject: string;
  preview: string;
  label: EvalLabel;
}

let _labels: Record<string, LabeledEmail> | null = null;

async function loadLabels(): Promise<Record<string, LabeledEmail>> {
  if (_labels) return _labels;
  _labels = {};
  if (!REDIS_URL || !REDIS_TOKEN) return _labels;
  try {
    const res = await fetch(`${REDIS_URL}/get/${LABELS_KEY}`, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
    const json = await res.json() as { result: string | null };
    if (json.result) {
      let parsed: unknown = JSON.parse(json.result);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') _labels = parsed as Record<string, LabeledEmail>;
    }
  } catch { /* fresh */ }
  return _labels;
}

async function saveLabels(): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN || !_labels) return;
  await fetch(`${REDIS_URL}/set/${LABELS_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(_labels),
  }).catch(() => {});
}

interface GraphMsg {
  id: string;
  subject?: string;
  bodyPreview?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
}

// Recent inbox emails for labeling — up to 200, newest first, labels merged in
export async function getEvalEmails(): Promise<{ labeled: number; emails: (Omit<LabeledEmail, 'label'> & { label?: EvalLabel })[] }> {
  if (!isAuthenticated()) throw new Error('Outlook not connected');
  const labels = await loadLabels();
  const emails: (Omit<LabeledEmail, 'label'> & { label?: EvalLabel })[] = [];
  let path: string | null = `/me/mailFolders/inbox/messages?$top=100&$orderby=receivedDateTime%20desc&$select=id,subject,from,bodyPreview`;
  const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
  for (let page = 0; page < 2 && path; page++) {
    const data = await graphGet(path) as { value: GraphMsg[]; '@odata.nextLink'?: string };
    for (const m of data.value || []) {
      emails.push({
        id: m.id,
        from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '?',
        subject: m.subject || '(no subject)',
        preview: (m.bodyPreview || '').slice(0, 300),
        label: labels[m.id]?.label,
      });
    }
    const next: string | undefined = data['@odata.nextLink'];
    path = next ? (next.startsWith(GRAPH_BASE) ? next.slice(GRAPH_BASE.length) : next) : null;
  }
  return { labeled: Object.keys(labels).length, emails };
}

export async function setLabel(email: Omit<LabeledEmail, 'label'>, label: EvalLabel): Promise<number> {
  const labels = await loadLabels();
  labels[email.id] = { ...email, label };
  await saveLabels();
  return Object.keys(labels).length;
}

export interface EvalResult {
  n: number;
  accuracy: number;   // act-vs-rest agreement
  precision: number;  // of predicted-actionable, how many labeled act|delegate
  recall: number;     // of labeled act|delegate, how many predicted actionable
  confusion: { tp: number; fp: number; tn: number; fn: number };
}

export async function runEval(): Promise<EvalResult> {
  const labels = await loadLabels();
  const rows = Object.values(labels);
  if (rows.length < 20) throw new Error(`Only ${rows.length} labeled — label at least 20 first`);

  const predicted = new Set<string>();
  for (let i = 0; i < rows.length; i += 40) {
    const chunk = rows.slice(i, i + 40);
    const hits = await scoreEmailsWithAI(chunk.map((r) => ({ id: r.id, from: r.from, subject: r.subject, preview: r.preview })));
    hits.forEach((id) => predicted.add(id));
  }

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const truth = r.label === 'act' || r.label === 'delegate';
    const pred = predicted.has(r.id);
    if (truth && pred) tp++;
    else if (!truth && pred) fp++;
    else if (!truth && !pred) tn++;
    else fn++;
  }
  return {
    n: rows.length,
    accuracy: (tp + tn) / rows.length,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    confusion: { tp, fp, tn, fn },
  };
}
