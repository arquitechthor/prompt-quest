import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, type BatchWriteCommandOutput, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { gzipSync } from 'node:zlib';
import type { Replay } from '../engine/types';
import type { AgentRecord, ArenaState, CompileQueue, MatchRecord, ReplayStore, Store } from '../core/ports';
import { initialState } from './local';

// Diseño de tabla única (single-table design):
//   pk = AGENT#<id> | MATCH#<id> | STATE      sk = 'META'
//   GSI "byType": type (AGENT | MATCH) + createdAt  -> listados sin Scan

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

export class DynamoStore implements Store {
  constructor(private table: string) {}

  private async get<T>(pk: string): Promise<T | null> {
    const r = await ddb.send(new GetCommand({ TableName: this.table, Key: { pk, sk: 'META' } }));
    if (!r.Item) return null;
    const { pk: _p, sk: _s, type: _t, ...rest } = r.Item;
    void _p; void _s; void _t;
    return rest as T;
  }
  private async byType<T>(type: string, limit?: number, newestFirst = false): Promise<T[]> {
    const out: T[] = [];
    let key: Record<string, unknown> | undefined;
    do {
      const r = await ddb.send(new QueryCommand({
        TableName: this.table, IndexName: 'byType', KeyConditionExpression: '#t = :t',
        ExpressionAttributeNames: { '#t': 'type' }, ExpressionAttributeValues: { ':t': type },
        ScanIndexForward: !newestFirst, Limit: limit, ExclusiveStartKey: key,
      }));
      for (const it of r.Items ?? []) {
        const { pk: _p, sk: _s, type: _t, ...rest } = it;
        void _p; void _s; void _t;
        out.push(rest as T);
      }
      key = limit && out.length >= limit ? undefined : r.LastEvaluatedKey;
    } while (key);
    return limit ? out.slice(0, limit) : out;
  }

  getAgent(id: string) { return this.get<AgentRecord>(`AGENT#${id}`); }
  async putAgent(a: AgentRecord) {
    await ddb.send(new PutCommand({ TableName: this.table, Item: { pk: `AGENT#${a.id}`, sk: 'META', type: 'AGENT', ...a } }));
  }
  listAgents() { return this.byType<AgentRecord>('AGENT'); }
  getMatch(id: string) { return this.get<MatchRecord>(`MATCH#${id}`); }
  async putMatch(m: MatchRecord) {
    await ddb.send(new PutCommand({ TableName: this.table, Item: { pk: `MATCH#${m.id}`, sk: 'META', type: 'MATCH', ...m } }));
  }
  listRecentMatches(limit: number) { return this.byType<MatchRecord>('MATCH', limit, true); }
  async getState() { return (await this.get<ArenaState>('STATE')) ?? initialState(); }
  async putState(s: ArenaState, expectedVersion: number) {
    try {
      await ddb.send(new PutCommand({
        TableName: this.table, Item: { pk: 'STATE', sk: 'META', ...s },
        ConditionExpression: 'attribute_not_exists(pk) OR #v = :v',
        ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': expectedVersion },
      }));
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }

  /** Borra por tipo usando el GSI (solo claves) y BatchWrite de 25 en 25, reintentando lo no procesado. */
  private async deleteType(type: string): Promise<number> {
    const keys: { pk: string; sk: string }[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await ddb.send(new QueryCommand({
        TableName: this.table, IndexName: 'byType', KeyConditionExpression: '#t = :t',
        ExpressionAttributeNames: { '#t': 'type' }, ExpressionAttributeValues: { ':t': type },
        ProjectionExpression: 'pk, sk', ExclusiveStartKey: start,
      }));
      for (const it of r.Items ?? []) keys.push({ pk: it.pk, sk: it.sk });
      start = r.LastEvaluatedKey;
    } while (start);
    for (let i = 0; i < keys.length; i += 25) {
      let pending: Record<string, unknown>[] | undefined = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
      for (let attempt = 0; pending?.length; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** Math.min(attempt, 5)));
        const out: BatchWriteCommandOutput = await ddb.send(new BatchWriteCommand({ RequestItems: { [this.table]: pending } }));
        pending = out.UnprocessedItems?.[this.table];
      }
    }
    return keys.length;
  }
  async clear() {
    return { agents: await this.deleteType('AGENT'), matches: await this.deleteType('MATCH') };
  }
}

const s3 = new S3Client({});
export class S3ReplayStore implements ReplayStore {
  constructor(private bucket: string) {}
  async put(r: Replay) {
    await s3.send(new PutObjectCommand({
      Bucket: this.bucket, Key: `replays/${r.matchId}.json`, Body: gzipSync(JSON.stringify(r)),
      ContentType: 'application/json', ContentEncoding: 'gzip', CacheControl: 'public, max-age=31536000, immutable',
    }));
  }
  url(matchId: string) { return `/replays/${matchId}.json`; }
  async clear() {
    let n = 0;
    let token: string | undefined;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: 'replays/', ContinuationToken: token }));
      const objs = (r.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (objs.length) await s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objs, Quiet: true } }));
      n += objs.length;
      token = r.NextContinuationToken;
    } while (token);
    return n;
  }
}

const sqs = new SQSClient({});
export class SqsQueue implements CompileQueue {
  constructor(private url: string) {}
  async enqueue(agentId: string, version: number) {
    await sqs.send(new SendMessageCommand({ QueueUrl: this.url, MessageBody: JSON.stringify({ agentId, version }) }));
  }
}
