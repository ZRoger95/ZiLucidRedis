import { Button } from '@ui-sdk/react/button';

interface EmptyStateProps {
  onOfficial: () => void;
  onUpload: () => void;
}

export function EmptyState({ onOfficial, onUpload }: EmptyStateProps) {
  return (
    <div className="empty">
      <h2 style={{ margin: 0, fontSize: 16 }}>贴一份 redis.conf 进来看体检结果</h2>
      <p style={{ margin: 0 }}>可以直接粘贴、上传文件、拖拽到这里，或者从官方完整配置开始改。</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={onOfficial}>载入官方完整配置</Button>
        <Button onClick={onUpload}>选择文件</Button>
      </div>
      <p style={{ margin: 0, fontSize: 12 }}>
        解析全部在浏览器内完成，配置内容不会上传；密码会被替换为 <code>{'${env_requirepass}'}</code> 占位符。
      </p>
    </div>
  );
}
