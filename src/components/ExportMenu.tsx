import { Button } from '@ui-sdk/react/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';

export type ExportKind = 'original' | 'comments' | 'secrets';

interface ExportMenuProps {
  onExport: (kind: ExportKind) => void;
  canRestoreSecrets: boolean;
}

export function ExportMenu({ onExport, canRestoreSecrets }: ExportMenuProps) {
  return (
    <Menu onAction={(value) => onExport(value as ExportKind)}>
      <MenuTrigger render={<Button />}>导出</MenuTrigger>
      <MenuContent>
        <MenuItem value="original">原样导出（密码保持占位符）</MenuItem>
        <MenuItem value="comments">补全官方注释后导出</MenuItem>
        <MenuSeparator />
        <MenuItem value="secrets" disabled={!canRestoreSecrets}>
          还原密码后导出…
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
