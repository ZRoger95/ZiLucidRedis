import { Annotate } from '@/components/annotate';
import { Callout } from '@/components/callout';
import { Button } from '@/components/ui/button';
import registry from '@/data/configurator.json';

import { StepHeader } from './StepHeader';

interface FinishStepProps {
  line: string;
  text: string;
  changed: number;
  hasSecret: boolean;
  ordinal: string;
  onBack: () => void;
  onDownload: () => void;
  onHandoff: () => void;
}

const meta = registry.sections.__finish__;

export function FinishStep({
  line,
  text,
  changed,
  hasSecret,
  ordinal,
  onBack,
  onDownload,
  onHandoff,
}: FinishStepProps) {
  const code = [`redis-server redis-${line}.conf # (1)`, 'redis-cli CONFIG GET maxmemory # (2)'].join('\n');
  const notes = [
    '生成的是完整官方模板加改动：未改动的行仍是注释，可以直接启动。',
    '启动后逐项 CONFIG GET 复核改动，确认没有被文件后面同名指令的其他生效行覆盖。',
  ];

  return (
    <div className="max-w-6xl space-y-6">
      <StepHeader
        crumb={`~/configurator · ${ordinal} · 完成`}
        title={meta.name}
        summary={meta.summary}
        figure={meta.figure}
      />

      <div className="space-y-6">
        <p className="m-0 font-mono text-[12px] text-muted-foreground">
          版本 {line} · 共改 {changed} 项 · 文件名 redis-{line}.conf
        </p>
        <Annotate title="落地检查" code={code} notes={notes} />
        <Callout type="note" title="提示">
          <p>
            「带回体检页」会把口令替换成 {'${env_*}'} 占位符；Redis
            不解析环境变量，需要部署侧（docker-entrypoint、envsubst 等）替换后再启动。
          </p>
        </Callout>
        {hasSecret ? (
          <Callout type="warning" title="注意">
            <p>生成结果包含明文密码，只在下一次下载或带回编辑器时经内存传递，不会写入本地存储。</p>
          </Callout>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="m-0 text-[13px] font-semibold text-ink">生成结果预览</h3>
        <pre
          aria-label="生成结果预览"
          className="m-0 max-h-96 overflow-auto rounded-md border border-line bg-[#fbfbfc] p-3 font-mono text-[12px] leading-5"
        >
          {text}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onDownload}>下载 conf</Button>
          <Button variant="outline" onClick={onHandoff}>
            带回体检页
          </Button>
          <Button variant="ghost" onClick={onBack}>
            返回修改
          </Button>
        </div>
      </div>
    </div>
  );
}
