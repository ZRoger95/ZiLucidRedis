import { useEffect, useState } from 'react';

import type { DictFile } from '../types';

import { loadDict, loadOfficialConf } from '../lib/dict';

interface VersionData {
  line: string;
  dict: DictFile;
  official: string;
}

/** 按版本异步加载字典与官方 conf；模块加载是 React 之外的异步系统，只能在 effect 里触发。 */
export function useVersionData(line: string): { data: VersionData | null; error: string | null } {
  const [data, setData] = useState<VersionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDict(line), loadOfficialConf(line)])
      .then(([dict, official]) => {
        if (!cancelled) {
          setData({ line, dict, official });
          setError(null);
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setError(reason.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [line]);

  return { data: data?.line === line ? data : null, error };
}
