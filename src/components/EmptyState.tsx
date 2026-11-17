import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onOfficial: () => void;
  onUpload: () => void;
}

export function EmptyState({ onOfficial, onUpload }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <h2 className="m-0 text-base">贴一份 redis.conf 进来看体检结果</h2>
      <p className="m-0">可以直接粘贴、上传文件、拖拽到这里，或者从官方完整配置开始改。</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onOfficial}>
          载入官方完整配置
        </Button>
        <Button variant="outline" onClick={onUpload}>
          选择文件
        </Button>
      </div>
      <p className="m-0 text-xs">
        解析全部在浏览器内完成，配置内容不会上传；密码会被替换为 <code>{'${env_requirepass}'}</code> 占位符。
      </p>
    </div>
  );
}
