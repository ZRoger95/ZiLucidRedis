export const aliases: Record<string, string> = {
  slaveof: 'replicaof',
  'slave-read-only': 'replica-read-only',
  'slave-serve-stale-data': 'replica-serve-stale-data',
  'slave-priority': 'replica-priority',
  'slave-announce-ip': 'replica-announce-ip',
  'slave-announce-port': 'replica-announce-port',
  'hash-max-ziplist-entries': 'hash-max-listpack-entries',
  'hash-max-ziplist-value': 'hash-max-listpack-value',
  'zset-max-ziplist-entries': 'zset-max-listpack-entries',
  'zset-max-ziplist-value': 'zset-max-listpack-value',
};
