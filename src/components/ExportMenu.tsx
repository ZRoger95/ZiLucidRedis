import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ExportKind = 'original' | 'comments' | 'secrets';

interface ExportMenuProps {
  onExport: (kind: ExportKind) => void;
  canRestoreSecrets: boolean;
}

export function ExportMenu({ onExport, canRestoreSecrets }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">导出</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onExport('original')}>原样导出（密码保持占位符）</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport('comments')}>补全官方注释后导出</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canRestoreSecrets} onSelect={() => onExport('secrets')}>
          还原密码后导出…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
