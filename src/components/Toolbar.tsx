import type { AnnotationMode } from '../types';
import { Button } from '@ui-sdk/react/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@ui-sdk/react/select';
import { Switch, SwitchThumb } from '@ui-sdk/react/switch';
import { VERSIONS } from '../lib/dict';
import { ExportMenu, type ExportKind } from './ExportMenu';

interface ToolbarProps {
  line: string;
  onLineChange: (line: string) => void;
  annotationMode: AnnotationMode;
  onAnnotationModeChange: (mode: AnnotationMode) => void;
  onlyDiff: boolean;
  onOnlyDiffChange: (value: boolean) => void;
  showZh: boolean;
  onShowZhChange: (value: boolean) => void;
  onUpload: (file: File) => void;
  onLoadOfficial: () => void;
  onClear: () => void;
  onOpenSearch: () => void;
  onExport: (kind: ExportKind) => void;
  canRestoreSecrets: boolean;
}

const ANNOTATION_OPTIONS = [
  { value: 'missing', label: '只补缺失' },
  { value: 'all', label: '全部显示' },
  { value: 'off', label: '关闭' },
];

export function Toolbar(props: ToolbarProps) {
  const items = VERSIONS.map((line) => ({ value: line, label: line }));

  return (
    <header className="topbar">
      <h1>Redis 配置体检</h1>

      <span className="control">
        <span>版本</span>
        <Select
          items={items}
          value={props.line}
          onValueChange={(value) => value && props.onLineChange(String(value))}
        >
          <SelectTrigger aria-label="Redis 版本">
            <SelectValue />
          </SelectTrigger>
          <SelectContent />
        </Select>
      </span>

      <span className="control">
        <span>内联注释</span>
        <Select
          items={ANNOTATION_OPTIONS}
          value={props.annotationMode}
          onValueChange={(value) => value && props.onAnnotationModeChange(value as AnnotationMode)}
        >
          <SelectTrigger aria-label="内联注释显示方式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent />
        </Select>
      </span>

      <label className="control">
        <Switch
          aria-label="只看差异"
          checked={props.onlyDiff}
          onCheckedChange={(checked) => props.onOnlyDiffChange(checked === true)}
        >
          <SwitchThumb />
        </Switch>
        只看差异
      </label>

      <label className="control">
        <Switch
          aria-label="中文摘要"
          checked={props.showZh}
          onCheckedChange={(checked) => props.onShowZhChange(checked === true)}
        >
          <SwitchThumb />
        </Switch>
        中文摘要
      </label>

      <Button onClick={props.onOpenSearch}>搜索配置项</Button>

      <Button onClick={props.onClear}>清空</Button>

      <span className="spacer" />

      <Button onClick={props.onLoadOfficial}>载入官方配置</Button>

      <label className="control">
        <input
          type="file"
          accept=".conf,.config,.txt"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onUpload(file);
            event.target.value = '';
          }}
        />
        <Button onClick={(event) => event.currentTarget.parentElement?.querySelector('input')?.click()}>
          上传 conf
        </Button>
      </label>

      <ExportMenu onExport={props.onExport} canRestoreSecrets={props.canRestoreSecrets} />
    </header>
  );
}
