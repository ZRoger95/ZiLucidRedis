import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import type { AnnotationMode } from '../types';

import { formatVersionLabel, RELEASES } from '../lib/dict';
import { type ExportKind, ExportMenu } from './ExportMenu';

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
  const items = [...RELEASES].reverse().map((release) => ({
    value: release.line,
    label: formatVersionLabel(release),
  }));

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3.5 py-2.5">
      <h1 className="mr-3 text-[15px] font-semibold tracking-[0.02em]">Redis 配置体检</h1>

      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <span>版本</span>
        <Select value={props.line} onValueChange={(value) => props.onLineChange(value)}>
          <SelectTrigger aria-label="Redis 版本" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <span>内联注释</span>
        <Select
          value={props.annotationMode}
          onValueChange={(value) => props.onAnnotationModeChange(value as AnnotationMode)}
        >
          <SelectTrigger aria-label="内联注释显示方式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANNOTATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </span>

      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Switch
          aria-label="只看差异"
          checked={props.onlyDiff}
          onCheckedChange={(checked) => props.onOnlyDiffChange(checked === true)}
        />
        只看差异
      </span>

      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Switch
          aria-label="中文摘要"
          checked={props.showZh}
          onCheckedChange={(checked) => props.onShowZhChange(checked === true)}
        />
        中文摘要
      </span>

      <Button variant="outline" onClick={props.onOpenSearch}>
        搜索配置项
      </Button>

      <Button variant="outline" onClick={props.onClear}>
        清空
      </Button>

      <span className="flex-1" />

      <Button variant="outline" onClick={props.onLoadOfficial}>
        载入官方配置
      </Button>

      <Button asChild variant="outline">
        <label htmlFor="toolbar-upload">上传 conf</label>
      </Button>
      <input
        id="toolbar-upload"
        type="file"
        accept=".conf,.config,.txt"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            props.onUpload(file);
          }
          event.target.value = '';
        }}
      />

      <ExportMenu onExport={props.onExport} canRestoreSecrets={props.canRestoreSecrets} />
    </header>
  );
}
