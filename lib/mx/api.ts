// MX widget API calls, matching the requests the widget itself sends
// (captured in mx_split: PUT the parent with has_been_split, POST each part
// with parent_guid, DELETE /transactions/{guid}/unsplit to undo).
import type { RawTransaction } from './session';
import { capturedHeaders, categories, forgetSplit, rawFetch, rememberTransaction, transactions } from './session';

export class ApiError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await rawFetch(new URL(path, location.origin), {
    method,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...capturedHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new ApiError(response.status, text);
  return text ? JSON.parse(text) : null;
}

const path = (guid: string) => `/transactions/${encodeURIComponent(guid)}`;

function returned(result: unknown): RawTransaction {
  const tx = (result as { transaction?: RawTransaction })?.transaction;
  if (!tx?.guid) throw new Error('Response did not include a transaction');
  rememberTransaction(tx);
  return tx;
}

function categoryFields(categoryGuid: string) {
  const category = categories.get(categoryGuid);
  if (!category) throw new Error(`Unknown category ${categoryGuid}`);
  return {
    category_guid: category.guid,
    category: category.name,
    top_level_category_guid: category.parentGuid ?? category.guid,
  };
}

function current(guid: string): RawTransaction {
  const tx = transactions.get(guid);
  if (!tx) throw new Error(`Transaction ${guid} isn't loaded; reload Money Manager`);
  return tx;
}

export interface Changes {
  categoryGuid: string;
  memo?: string | null; // undefined leaves it alone
  description?: string; // the payee shown in Money Manager
}

export async function recategorize(guid: string, changes: Changes): Promise<void> {
  const tx = current(guid);
  const body = {
    ...tx,
    ...categoryFields(changes.categoryGuid),
    ...(changes.memo === undefined ? {} : { memo: changes.memo }),
    ...(changes.description === undefined ? {} : { description: changes.description }),
  };
  returned(await request('PUT', path(guid), body));
}

export interface SplitPart {
  cents: number;
  categoryGuid: string;
  memo?: string;
  description?: string;
}

// Returns the guids of the new parts. If a part can't be created, the split
// is undone so the transaction isn't left half split.
export async function split(guid: string, parts: SplitPart[]): Promise<string[]> {
  const parent = current(guid);
  const parentCents = Math.round(Math.abs(Number(parent.amount)) * 100);
  const total = parts.reduce((sum, p) => sum + p.cents, 0);
  if (total !== parentCents) throw new Error(`Parts add up to ${total / 100}, not ${parentCents / 100}`);
  if (parts.length < 2) throw new Error('A split needs at least two parts');
  if (parent.has_been_split) throw new Error('Already split');

  returned(await request('PUT', path(guid), { ...parent, has_been_split: true }));
  const created: string[] = [];
  try {
    for (const part of parts) {
      const child = {
        ...parent,
        guid: null,
        amount: part.cents / 100,
        ...categoryFields(part.categoryGuid),
        memo: part.memo ?? null,
        ...(part.description ? { description: part.description } : {}),
        has_been_split: false,
        parent_guid: guid,
      };
      created.push(returned(await request('POST', '/transactions', child)).guid);
    }
  } catch (err) {
    await unsplit(guid).catch(() => {});
    throw err;
  }
  return created;
}

export async function unsplit(guid: string): Promise<void> {
  await request('DELETE', `${path(guid)}/unsplit`);
  forgetSplit(guid);
}
