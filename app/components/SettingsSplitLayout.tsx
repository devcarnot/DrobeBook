import type { ReactNode } from "react";

type SettingsSplitLayoutProps = {
  editor: ReactNode;
  preview: ReactNode;
};

export function SettingsSplitLayout({ editor, preview }: SettingsSplitLayoutProps) {
  return (
    <div className="gk-settings-split">
      <div className="gk-settings-split__editor">{editor}</div>
      <div className="gk-settings-split__preview">{preview}</div>
    </div>
  );
}
