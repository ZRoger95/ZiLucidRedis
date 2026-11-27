import { useState } from 'react';

import type { ScenarioChecklistItem, ScenarioFileView, ScenarioReviewGroup } from '@/types';

import { Annotate } from '@/components/annotate';
import { Callout } from '@/components/callout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import registry from '@/data/configurator.json';

import { StepHeader } from './StepHeader';

interface FinishStepProps {
  line: string;
  text: string;
  changed: number;
  hasSecret: boolean;
  ordinal: string;
  onBack: () => void;
  onDownload: (file?: ScenarioFileView) => void;
  onHandoff: () => void;
  review?: ScenarioReviewGroup[];
  checklist?: ScenarioChecklistItem[];
  passwordMissing?: boolean;
  onJumpSection?: (sectionId: string) => void;
  files?: ScenarioFileView[];
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
  review,
  checklist,
  passwordMissing,
  onJumpSection,
  files,
}: FinishStepProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFile = files?.[activeIndex];
  const previewName = activeFile?.fileName ?? `redis-${line}.conf`;
  const code = [`redis-server ${previewName} # (1)`, 'redis-cli CONFIG GET maxmemory # (2)'].join('\n');
  const notes = [
    '生成的是完整官方模板加改动：未改动的行仍是注释，可以直接启动。',
    '启动后逐项 CONFIG GET 复核改动，确认没有被文件后面同名指令的其他生效行覆盖。',
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <StepHeader
        crumb={`~/configurator · ${ordinal} · 完成`}
        title={meta.name}
        summary={meta.summary}
        figure={meta.figure}
      />

      <div className="space-y-6">
        <p className="m-0 font-mono text-[12px] text-muted-foreground">
          版本 {line} · 共改 {changed} 项 · 文件名 {previewName}
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

      {passwordMissing ? (
        <Callout type="warning" title="注意">
          <p>密码未填，当前配置将无认证</p>
        </Callout>
      ) : null}

      {review && review.length > 0 ? (
        <div className="space-y-3">
          <h3 className="m-0 text-[13px] font-semibold text-ink">预设改了什么</h3>
          {review.map((group) => (
            <div key={group.sectionId} className="space-y-1.5">
              <h4 className="m-0 text-[12px] font-semibold text-muted-foreground">
                {registry.sections[group.sectionId as keyof typeof registry.sections]?.name ?? group.sectionId}
              </h4>
              <ul className="m-0 list-none space-y-1.5 p-0">
                {group.items.map((item) => (
                  <li key={item.name} className="rounded-md border border-line px-3 py-2 text-[12px]">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono font-medium text-ink">{item.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {item.value === null ? '已恢复官方默认' : item.value}
                      </span>
                      {item.state === 'modified' ? <span className="text-[#9a3412]">已手动修改</span> : null}
                      <span className="flex-1" />
                      <Button type="button" variant="ghost" size="xs" onClick={() => onJumpSection?.(group.sectionId)}>
                        去修改
                      </Button>
                    </div>
                    <p className="m-0 mt-1 leading-5 text-muted-foreground">{item.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {checklist && checklist.length > 0 ? (
        <div className="space-y-3">
          <h3 className="m-0 text-[13px] font-semibold text-ink">系统层必做项</h3>
          <p className="m-0 text-[12px] text-muted-foreground">这些进不了 redis.conf，需要在机器上单独执行。</p>
          <ul className="m-0 list-none space-y-2 p-0">
            {checklist.map((item) => (
              <li key={item.title} className="rounded-md border border-line px-3 py-2 text-[12px]">
                <p className="m-0 font-medium text-ink">{item.title}</p>
                <pre className="mt-1 mb-0 overflow-x-auto rounded bg-[#fbfbfc] p-2 font-mono text-[11px]">
                  {item.command}
                </pre>
                <p className="m-0 mt-1 leading-5 text-muted-foreground">{item.why}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        <h3 className="m-0 text-[13px] font-semibold text-ink">生成结果预览</h3>
        {files && files.length > 0 ? (
          <Tabs value={String(activeIndex)} onValueChange={(value) => setActiveIndex(Number(value))}>
            <TabsList variant="line">
              {files.map((file, index) => (
                <TabsTrigger key={file.role} value={String(index)}>
                  {file.title}
                </TabsTrigger>
              ))}
            </TabsList>
            {files.map((file, index) => (
              <TabsContent key={file.role} value={String(index)}>
                <pre
                  aria-label="生成结果预览"
                  className="m-0 max-h-96 overflow-auto rounded-md border border-line bg-[#fbfbfc] p-3 font-mono text-[12px] leading-5"
                >
                  {file.text}
                </pre>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <pre
            aria-label="生成结果预览"
            className="m-0 max-h-96 overflow-auto rounded-md border border-line bg-[#fbfbfc] p-3 font-mono text-[12px] leading-5"
          >
            {text}
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onDownload(activeFile)}>下载 conf</Button>
          {files && files.length > 0 ? null : (
            <Button variant="outline" onClick={onHandoff}>
              带回体检页
            </Button>
          )}
          <Button variant="ghost" onClick={onBack}>
            返回修改
          </Button>
        </div>
      </div>
    </div>
  );
}
