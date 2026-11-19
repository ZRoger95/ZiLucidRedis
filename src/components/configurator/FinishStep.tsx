import { Button } from '@/components/ui/button';

interface FinishStepProps {
  line: string;
  text: string;
  changed: number;
  hasSecret: boolean;
  onBack: () => void;
  onDownload: () => void;
  onHandoff: () => void;
}

export function FinishStep({ line, text, changed, hasSecret, onBack, onDownload, onHandoff }: FinishStepProps) {
  return (
    <div className="max-w-5xl space-y-4">
      <header className="space-y-1">
        <h2 className="m-0 text-[18px] font-semibold text-ink">完成</h2>
        <p className="m-0 text-[13px] text-muted-foreground">共改 {changed} 项</p>
      </header>

      {hasSecret ? (
        <p className="m-0 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-[12px] text-[#9a3412]">
          生成结果包含明文密码，只在下一次下载或带回编辑器时经内存传递，不会写入本地存储。
        </p>
      ) : null}

      <pre
        aria-label="生成结果预览"
        className="m-0 max-h-96 overflow-auto rounded-md border border-line bg-[#fbfbfc] p-3 font-mono text-[12px] leading-5"
      >
        {text}
      </pre>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onDownload}>下载 conf</Button>
        <Button variant="outline" onClick={onHandoff}>
          带回体检页
        </Button>
        <Button variant="ghost" onClick={onBack}>
          返回修改
        </Button>
        <span className="flex-1" />
        <span className="self-center text-[12px] text-muted-foreground">文件名：redis-{line}.conf</span>
      </div>
    </div>
  );
}
