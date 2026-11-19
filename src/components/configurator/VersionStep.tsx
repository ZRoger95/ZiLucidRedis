import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatVersionLabel, RELEASES } from '@/lib/dict';

interface VersionStepProps {
  line: string;
  onChange: (line: string) => void;
}

const items = [...RELEASES].reverse().map((release) => ({
  value: release.line,
  label: formatVersionLabel(release),
}));

export function VersionStep({ line, onChange }: VersionStepProps) {
  return (
    <div className="max-w-xl space-y-4">
      <h2 className="m-0 text-[18px] font-semibold text-ink">选择版本</h2>
      <p className="m-0 text-[13px] leading-6 text-muted-foreground">
        向导按所选版本的官方 redis.conf 区域逐步走。未改动的行保持官方注释原样，改过的指令会取消注释并写入新值。
        切换版本会清空当前草稿。
      </p>
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>版本</span>
        <Select value={line} onValueChange={onChange}>
          <SelectTrigger aria-label="选择 Redis 版本" className="w-80">
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
    </div>
  );
}
