import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';

type Props = { mode: 'Staff' | 'Admin' };

/** Centered faux title bar label; includes app version when running in Tauri. */
export default function TitleBarBrandLabel({ mode }: Props) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setVersion(null);
      return;
    }
    void getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  const versionPart = version ? ` ${version}` : '';

  return (
    <span className="text-white/20 text-[11px] font-medium">
      MVPTime{versionPart} — {mode}
    </span>
  );
}
